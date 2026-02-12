'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useWulinStore } from '@/stores/gameStore';
import { HeroCard } from '@/components/game/HeroCard';
import { EventFeed } from '@/components/game/EventFeed';
import { RankingPanel } from '@/components/game/RankingPanel';
import { DanmakuOverlay } from '@/components/game/DanmakuOverlay';
import { DanmakuInput } from '@/components/game/DanmakuInput';
import { FloatingText } from '@/components/game/FloatingText';
import { MuteToggle } from '@/components/game/MuteToggle';
import { BettingPanel } from '@/components/game/BettingPanel';
import { RelationshipGraph } from '@/components/game/RelationshipGraph';
import { ShareButton } from '@/components/game/ShareButton';
import { LastGameTop8, LastGameHighlights } from '@/components/game/LastGameReview';
import { soundManager } from '@/lib/sound';
import { GOSSIP_LINES } from '@/lib/game/constants';
import { DIRECTOR_EVENTS } from '@/lib/game/prompts';
import { useEventRevealer } from '@/hooks/useEventRevealer';

/** 根据赛季积分返回称号 */
function getSeasonTitle(points: number): { icon: string; name: string } {
  if (points >= 1000) return { icon: '🐉', name: '武林至尊' };
  if (points >= 500) return { icon: '🏆', name: '一代宗师' };
  if (points >= 300) return { icon: '⚔️', name: '绝世高手' };
  if (points >= 150) return { icon: '🗡️', name: '江湖名侠' };
  if (points >= 50) return { icon: '🥋', name: '武林新秀' };
  return { icon: '🌱', name: '初入江湖' };
}

export default function Home() {
  const { user, setUser, gameState, setGameState, currentEvents, setCurrentEvents, startPolling, pollNow, clearAudienceBets, clearLocalDanmaku } = useWulinStore();

  // UI 状态
  const [isJoining, setIsJoining] = useState(false);
  const [queueInfo, setQueueInfo] = useState<{ position: number; estimatedMinutes: number } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [roundTimer, setRoundTimer] = useState<number | null>(null);
  const [gossip, setGossip] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [showDetail, setShowDetail] = useState<string | null>(null);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [joinToast, setJoinToast] = useState<string | null>(null);
  const [introTimer, setIntroTimer] = useState<number | null>(null);
  const introTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [endingTimer, setEndingTimer] = useState<number | null>(null);
  const endingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [endedCountdown, setEndedCountdown] = useState<number | null>(null);
  const endedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [skipNextGame, setSkipNextGame] = useState(false);
  const [isQueued, setIsQueued] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // 事件逐条揭晓
  const {
    isRevealing, revealedEvents, progressiveHeroes: revealHeroes,
    progressiveRepRanking, progressiveHotRanking,
    revealProgress, startReveal, skipReveal,
  } = useEventRevealer();

  // 引用，避免闭包过期
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const roundTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTriggeredRef = useRef<string>(''); // 防重复触发

  // === 初始化 ===
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(data => {
      if (data.user && data.hero) {
        setUser({ userId: data.user.userId, heroId: data.hero.id, hero: data.hero, isLoggedIn: true });
      }
    }).catch(() => {});
    startPolling();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (roundTimerRef.current) clearInterval(roundTimerRef.current);
      if (introTimerRef.current) clearInterval(introTimerRef.current);
      if (endingTimerRef.current) clearInterval(endingTimerRef.current);
      if (endedTimerRef.current) clearInterval(endedTimerRef.current);
    };
  }, []);

  // === 候补弹窗：游戏进入 waiting/countdown 时自动关闭 + 重置赛后状态 ===
  useEffect(() => {
    if (gameState?.status === 'waiting' || gameState?.status === 'countdown') {
      if (queueInfo) setQueueInfo(null);
      setSkipNextGame(false);
      setEndedCountdown(null);
      setIsQueued(false);
      if (endedTimerRef.current) { clearInterval(endedTimerRef.current); endedTimerRef.current = null; }
    }
  }, [gameState?.status, queueInfo]);

  // === 新一局重置押注 + 弹幕 ===
  const prevGameIdRef = useRef<string | null>(null);
  useEffect(() => {
    const gid = gameState?.gameId ?? null;
    if (prevGameIdRef.current && gid !== prevGameIdRef.current) {
      clearAudienceBets();
      clearLocalDanmaku();
    }
    prevGameIdRef.current = gid;
  }, [gameState?.gameId, clearAudienceBets, clearLocalDanmaku]);

  // === 状态驱动器：监听 gameState.status 自动推进 ===
  useEffect(() => {
    const status = gameState?.status;
    const gameId = gameState?.gameId;
    if (!status || !gameId) return;

    const key = `${gameId}:${status}`;
    if (lastTriggeredRef.current === key) return; // 已经处理过

    // countdown → 启动倒计时
    if (status === 'countdown' && countdown === null) {
      lastTriggeredRef.current = key;
      startCountdown(gameId);
    }

    // intro → 20 秒后开始 R1，同时启动 intro 倒计时显示
    if (status === 'intro') {
      lastTriggeredRef.current = key;
      clearAllTimers();
      setIntroTimer(20);
      if (introTimerRef.current) clearInterval(introTimerRef.current);
      introTimerRef.current = setInterval(() => {
        setIntroTimer(prev => {
          if (prev === null || prev <= 1) {
            if (introTimerRef.current) clearInterval(introTimerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      timerRef.current = setTimeout(() => triggerRound(gameId, 1), 20000);
    }

    // round_N → 35 秒倒计时，事件揭晓与倒计时同步进行
    if (status.startsWith('round_')) {
      const pendingRound = parseInt(status.split('_')[1]);
      if (!isNaN(pendingRound) && pendingRound >= 2 && pendingRound <= 5) {
        lastTriggeredRef.current = key;
        startRoundTimer(gameId, pendingRound, 35);
      }
    }

    // semifinals → 触发决赛
    if (status === 'semifinals') {
      lastTriggeredRef.current = key;
      clearAllTimers();
      timerRef.current = setTimeout(() => triggerFinals(gameId), 5000);
    }

    // ending → 10 秒后触发结束，同时启动 ending 倒计时显示
    if (status === 'ending') {
      lastTriggeredRef.current = key;
      clearAllTimers();
      setEndingTimer(10);
      if (endingTimerRef.current) clearInterval(endingTimerRef.current);
      endingTimerRef.current = setInterval(() => {
        setEndingTimer(prev => {
          if (prev === null || prev <= 1) {
            if (endingTimerRef.current) clearInterval(endingTimerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      timerRef.current = setTimeout(() => triggerEnd(gameId), 10000);
    }

    // ended → 45 秒倒计时自动进入下一局
    if (status === 'ended') {
      lastTriggeredRef.current = key;
      setEndedCountdown(45);
      if (endedTimerRef.current) clearInterval(endedTimerRef.current);
      endedTimerRef.current = setInterval(() => {
        setEndedCountdown(prev => {
          if (prev === null || prev <= 1) {
            if (endedTimerRef.current) { clearInterval(endedTimerRef.current); endedTimerRef.current = null; }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
  }, [gameState?.status, gameState?.gameId]);

  // === ended 倒计时到 0：自动加入或刷新 ===
  useEffect(() => {
    if (endedCountdown === 0 && gameState?.status === 'ended') {
      if (!skipNextGame) {
        handleJoin();
      } else {
        pollNow();
      }
    }
  }, [endedCountdown]);

  // === 安全兜底：ending 状态下持续重试 triggerEnd，直到成功转为 ended ===
  const endRetryRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    // 清理旧的重试
    if (endRetryRef.current) { clearInterval(endRetryRef.current); endRetryRef.current = null; }

    if (gameState?.status === 'ending' && gameState?.gameId && !isRevealing) {
      // 立即尝试一次
      triggerEnd(gameState.gameId);
      // 每 5 秒重试
      const gid = gameState.gameId;
      endRetryRef.current = setInterval(() => {
        triggerEnd(gid);
      }, 5000);
    }

    return () => {
      if (endRetryRef.current) { clearInterval(endRetryRef.current); endRetryRef.current = null; }
    };
  }, [isRevealing, gameState?.status, gameState?.gameId]);

  // === P2: 音效触发 ===
  const prevStatusRef = useRef<string>('');
  useEffect(() => {
    const status = gameState?.status || '';
    if (status === prevStatusRef.current) return;
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;

    if (status === 'intro' && prev !== 'intro') soundManager.play('intro_drums');
    if (status === 'semifinals' || status === 'final') soundManager.play('finals');
    if (status === 'ended') soundManager.play('champion');
  }, [gameState?.status]);

  // 战斗/背叛事件音效
  const lastEventCountRef = useRef(0);
  useEffect(() => {
    const evts = gameState?.recentEvents || [];
    if (evts.length <= lastEventCountRef.current) return;
    const newEvts = evts.slice(lastEventCountRef.current);
    lastEventCountRef.current = evts.length;

    for (const e of newEvts) {
      if (e.eventType === 'fight' || e.eventType === 'gang_up' || e.eventType === 'scramble') {
        soundManager.play('fight');
        break;
      }
      if (e.eventType === 'betray') {
        soundManager.play('betray');
        break;
      }
      if (e.eventType === 'eliminated') {
        soundManager.play('eliminated');
        break;
      }
    }
  }, [gameState?.recentEvents]);

  // === 点击外部关闭下拉菜单 ===
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfileDropdown(false);
      }
    }
    if (showProfileDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showProfileDropdown]);

  // === 清理所有计时器 ===
  function clearAllTimers() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    if (roundTimerRef.current) { clearInterval(roundTimerRef.current); roundTimerRef.current = null; }
    setCountdown(null);
    setRoundTimer(null);
  }

  // === 开赛倒计时 ===
  function startCountdown(gameId: string) {
    setCountdown(30);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev === null || prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          triggerStart(gameId);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }

  // === 回合倒计时 ===
  function startRoundTimer(gameId: string, nextRound: number, seconds: number) {
    setRoundTimer(seconds);
    if (roundTimerRef.current) clearInterval(roundTimerRef.current);
    roundTimerRef.current = setInterval(() => {
      setRoundTimer(prev => {
        if (prev === null || prev <= 1) {
          if (roundTimerRef.current) clearInterval(roundTimerRef.current);
          triggerRound(gameId, nextRound);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }

  // === API 调用 ===

  const handleJoin = useCallback(async () => {
    if (!user.isLoggedIn) {
      window.location.href = '/api/auth/login';
      return;
    }
    setIsJoining(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/game/join', { method: 'POST' });
      const data = await res.json();
      if (data.queued) {
        if (data.position > 12) {
          setQueueInfo({ position: data.position, estimatedMinutes: data.estimatedMinutes });
        } else {
          setJoinToast('比赛进行中，已排入下一局，先观战吧');
          setTimeout(() => setJoinToast(null), 5000);
        }
      } else if (res.ok) {
        setJoinToast('入座成功！等待其他侠客加入…');
        setTimeout(() => setJoinToast(null), 3000);
      } else {
        setErrorMsg(data.error || '入座失败');
      }
    } catch { setErrorMsg('网络错误'); }
    setIsJoining(false);
  }, [user]);

  const handleLeave = useCallback(async () => {
    setIsLeaving(true);
    try {
      const res = await fetch('/api/game/leave', { method: 'POST' });
      if (res.ok) {
        pollNow();
      } else {
        const data = await res.json();
        setErrorMsg(data.error || '退出失败');
      }
    } catch { setErrorMsg('网络错误'); }
    setIsLeaving(false);
  }, [pollNow]);

  const triggerStart = useCallback(async (gameId: string) => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const res = await fetch('/api/engine/start', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.gameState) setGameState(data.gameState);
        else pollNow();
      } else {
        console.error('Start failed:', await res.text());
        pollNow();
      }
    } catch (e) { console.error('Start error:', e); pollNow(); }
    setIsProcessing(false);
  }, [isProcessing, setGameState, pollNow]);

  const triggerRound = useCallback(async (gameId: string, roundNumber: number) => {
    if (isProcessing) return;
    setIsProcessing(true);
    setGossip(GOSSIP_LINES[Math.floor(Math.random() * GOSSIP_LINES.length)]);
    // Snapshot heroes before the round processes
    const snapshot = useWulinStore.getState().gameState?.heroes || [];
    try {
      const res = await fetch('/api/engine/round', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, roundNumber }),
      });
      const data = await res.json();
      if (data.gameState) setGameState(data.gameState);
      else pollNow();
      if (data.events) {
        setCurrentEvents(data.events);
        startReveal(data.events, snapshot);
      }
    } catch (e) { console.error('Round error:', e); pollNow(); }
    setIsProcessing(false);
  }, [isProcessing, startReveal, setGameState, pollNow]);

  const triggerFinals = useCallback(async (gameId: string) => {
    if (isProcessing) return;
    setIsProcessing(true);
    const snapshot = useWulinStore.getState().gameState?.heroes || [];
    try {
      const res = await fetch('/api/engine/finals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId }),
      });
      const data = await res.json();
      if (data.gameState) setGameState(data.gameState);
      else pollNow();
      if (data.events) {
        setCurrentEvents(data.events);
        startReveal(data.events, snapshot);
      }
    } catch (e) { console.error('Finals error:', e); pollNow(); }
    setIsProcessing(false);
  }, [isProcessing, startReveal, setGameState, pollNow]);

  const triggerEnd = useCallback(async (gameId: string) => {
    try {
      const res = await fetch('/api/engine/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.gameState) setGameState(data.gameState);
        else pollNow();
      } else {
        pollNow();
      }
    } catch (e) { console.error('End error:', e); pollNow(); }
  }, [setGameState, pollNow]);


  // === 渲染 ===
  const status = gameState?.status || 'waiting';
  const heroes = isRevealing ? revealHeroes : (gameState?.heroes || []);
  const events = isRevealing ? revealedEvents : (currentEvents.length > 0 ? currentEvents : (gameState?.recentEvents || []));
  const repRanking = isRevealing ? progressiveRepRanking : (gameState?.reputationRanking || []);
  const hotRanking = isRevealing ? progressiveHotRanking : (gameState?.hotRanking || []);
  const isGameActive = status.startsWith('round_') || status.startsWith('processing_') ||
    status === 'intro' || status === 'semifinals' || status === 'final' || status === 'ending';
  const isParticipant = user.isLoggedIn && gameState?.heroes?.some(h => h.heroId === user.heroId);

  return (
    <div className="min-h-screen bg-[--bg-primary] pb-16">
      {/* ===== 顶栏 ===== */}
      <header className="border-b border-[--accent-gold]/20 bg-[--bg-secondary]/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-[--accent-gold]">⚔️ AI 武林大会</h1>
            {gameState?.theme && (
              <span className="text-sm px-2 py-0.5 rounded bg-[--accent-gold]/10 text-[--accent-gold]">
                「{gameState.theme}」
              </span>
            )}
          </div>
          {/* Center: Round info */}
          {isGameActive && status !== 'intro' && (() => {
            const round = gameState?.currentRound || 0;
            const directorInfo = DIRECTOR_EVENTS[round];
            const isFinals = status === 'semifinals' || status === 'final';
            const isEnding = status === 'ending';
            const roundTitle = isEnding ? '加冕典礼'
              : isFinals ? '盟主加冕战'
              : directorInfo ? `第${round}回合 · ${directorInfo.title}` : null;

            return roundTitle ? (
              <div className="hidden sm:flex items-center gap-2 text-sm">
                <span className="text-[--accent-gold] font-bold whitespace-nowrap">
                  {isFinals || isEnding ? '🏆' : '📜'} {roundTitle}
                </span>
                {isEnding && endingTimer !== null && endingTimer > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-[--accent-red]/15 border border-[--accent-red]/30 text-[--accent-red] font-mono text-xs font-bold">
                    {endingTimer}s
                  </span>
                )}
                {gameState?.nextRoundPreview && !isFinals && !isEnding && (
                  <span className="text-xs text-[--text-secondary] truncate hidden lg:inline">
                    ⏭️ {gameState.nextRoundPreview}
                  </span>
                )}
                {isProcessing && (
                  <span className="text-xs px-2 py-0.5 rounded bg-[--accent-gold]/20 text-[--accent-gold] animate-pulse">
                    结算中…
                  </span>
                )}
                {roundTimer !== null && !isProcessing && (
                  <span className="font-mono text-sm px-2 py-0.5 rounded bg-[--accent-red]/20 text-[--accent-red]">
                    {roundTimer}s
                  </span>
                )}
              </div>
            ) : null;
          })()}
          <div className="flex items-center gap-4 text-sm">
            <MuteToggle />
            {/* 观众排队按钮 */}
            {user.isLoggedIn && isGameActive && !isParticipant && (
              <button
                onClick={() => { if (!isQueued) { handleJoin(); setIsQueued(true); } }}
                disabled={isQueued}
                className={`px-3 py-1 rounded-lg text-xs font-bold border transition ${
                  isQueued
                    ? 'border-green-500/40 text-green-400 opacity-70 cursor-default'
                    : 'border-[--accent-gold]/50 text-[--accent-gold] hover:bg-[--accent-gold]/10'
                }`}
              >
                {isQueued ? '✅ 已排队' : '⏳ 排队等候'}
              </button>
            )}
            {/* 参赛者退出按钮 */}
            {isParticipant && (status === 'waiting' || status === 'countdown') && (
              <button
                onClick={handleLeave}
                disabled={isLeaving}
                className="px-3 py-1 rounded-lg text-xs font-bold border border-[--accent-red]/50 text-[--accent-red] hover:bg-[--accent-red]/10 transition disabled:opacity-50"
              >
                {isLeaving ? '退出中…' : '🚪 退出比赛'}
              </button>
            )}
            {user.isLoggedIn ? (
              <div className="flex items-center gap-3 relative" ref={profileRef}>
                {(() => {
                  const t = getSeasonTitle(user.hero?.seasonPoints ?? 0);
                  return (
                    <span className="text-[--accent-gold] text-xs">
                      {t.icon} {t.name}
                    </span>
                  );
                })()}
                <span className="text-[--text-secondary]">|</span>
                <button
                  onClick={() => setShowProfileDropdown(v => !v)}
                  className="flex items-center gap-1 hover:text-[--accent-gold] transition"
                >
                  <span>{user.hero?.heroName || user.hero?.hero_name}</span>
                  <span className="text-xs text-[--text-secondary]">▼</span>
                </button>
                {showProfileDropdown && (
                  <div className="absolute right-0 top-full mt-2 w-56 bg-[--bg-secondary] border border-[--accent-gold]/20 rounded-xl shadow-lg overflow-hidden z-[60]">
                    <div className="p-4 border-b border-[--accent-gold]/10">
                      {(() => {
                        const t = getSeasonTitle(user.hero?.seasonPoints ?? 0);
                        return (
                          <>
                            <div className="text-2xl font-bold text-[--accent-gold]">
                              {t.icon} {t.name}
                            </div>
                            <div className="text-xs text-[--text-secondary] mt-1">
                              💰 {(user.hero?.balance ?? 0).toLocaleString()} 银两
                            </div>
                          </>
                        );
                      })()}
                    </div>
                    <div className="p-4 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-[--text-secondary]">总场次</span>
                        <span>{user.hero?.totalGames ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[--text-secondary]">胜场 (前三)</span>
                        <span className="text-[--accent-gold]">{user.hero?.totalWins ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[--text-secondary]">赛季积分</span>
                        <span className="text-[--accent-gold]">{user.hero?.seasonPoints ?? 0}</span>
                      </div>
                    </div>
                    <div className="border-t border-[--accent-gold]/10">
                      <a
                        href="/api/auth/logout"
                        className="block w-full text-center py-3 text-sm text-[--accent-red] hover:bg-[--accent-red]/10 transition"
                      >
                        退出登录
                      </a>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <a href="/api/auth/login"
                className="px-4 py-1.5 rounded-lg bg-[--accent-gold] text-black font-bold hover:bg-[--accent-gold]/80 transition">
                用 SecondMe 登录
              </a>
            )}
          </div>
        </div>
      </header>

      {/* P2: 弹幕浮层 */}
      <DanmakuOverlay />

      <main className="max-w-7xl mx-auto px-4 py-6">

        {/* ========== 等待 / 倒计时 ========== */}
        {(status === 'waiting' || status === 'countdown') && (() => {
          const hasLastGame = (gameState?.lastGameTop8?.length ?? 0) > 0;
          return (
          <div className={hasLastGame ? 'grid grid-cols-12 gap-4 lg:gap-6 py-8' : 'text-center py-12 md:py-20'}>
            {hasLastGame && (
              <div className="col-span-12 lg:col-span-3 order-2 lg:order-1">
                <LastGameTop8 entries={gameState?.lastGameTop8 || []} />
              </div>
            )}
            <div className={hasLastGame ? 'col-span-12 lg:col-span-6 order-1 lg:order-2 text-center' : ''}>
            <div className="text-7xl mb-6 animate-breathe">⚔️</div>
            <h2 className="text-4xl md:text-5xl font-bold text-[--accent-gold] mb-3 animate-glow-text">
              武林大会
            </h2>
            <p className="text-lg text-[--text-secondary] mb-2">
              12 个 AI 侠客齐聚江湖 · 6 回合争夺武林盟主
            </p>

            {countdown !== null && countdown > 0 ? (
              <div className="my-8">
                <div className="text-6xl font-bold text-[--accent-red] animate-count-pulse">{countdown}</div>
                <p className="text-[--text-secondary] mt-2">秒后开战</p>
              </div>
            ) : countdown === 0 ? (
              <div className="my-8">
                <div className="text-4xl font-bold text-[--accent-gold] animate-pulse">⚔️ 开战中…</div>
                <p className="text-[--text-secondary] mt-2">正在召集各路英雄</p>
              </div>
            ) : (
              <div className="my-8">
                {user.isLoggedIn ? (
                  <button onClick={handleJoin} disabled={isJoining}
                    className="btn-gold text-lg px-10 py-3 animate-pulse-glow disabled:opacity-50">
                    {isJoining ? '入座中…' : '⚔️ 入座参战'}
                  </button>
                ) : (
                  <div className="space-y-3">
                    <a href="/api/auth/login"
                      className="inline-block btn-gold text-lg px-10 py-3 animate-pulse-glow">
                      🔑 用 SecondMe 登录参战
                    </a>
                    <p className="text-sm text-[--text-secondary]">或留在此处围观比赛实况</p>
                  </div>
                )}
                <p className="text-xs text-[--text-secondary] mt-3">无需登录即可围观 · 登录后你的 AI 自动参战</p>
                {errorMsg && <p className="text-[--accent-red] text-sm mt-2">{errorMsg}</p>}
              </div>
            )}

            <div className="mt-8">
              <h3 className="text-lg mb-4 text-[--text-secondary]">
                ⚔️ 已入座 {heroes.length}/12
              </h3>
              <div className={`grid grid-cols-3 ${hasLastGame ? '' : 'md:grid-cols-4 max-w-4xl mx-auto'} gap-3`}>
                {Array.from({ length: 12 }, (_, i) => {
                  const hero = heroes.find(h => h.seatNumber === i + 1);
                  if (hero) {
                    return <HeroCard key={hero.heroId} hero={hero} compact />;
                  }
                  return (
                    <div key={`empty-${i}`} className="flex items-center justify-center px-3 py-2 rounded-lg border border-dashed border-[--accent-gold]/15 text-[--text-secondary]/40 text-sm min-h-[52px]">
                      座位 {i + 1}
                    </div>
                  );
                })}
              </div>
            </div>
            </div>
            {/* 右栏：上届大事记（仅有上局数据时） */}
            {hasLastGame && (
              <div className="col-span-12 lg:col-span-3 order-3">
                <LastGameHighlights events={gameState?.lastGameHighlights || []} />
              </div>
            )}
          </div>
          );
        })()}

        {/* ========== 开场点名 ========== */}
        {status === 'intro' && (
          <div className="py-8">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-[--accent-gold] mb-2 animate-glow-text">📜 开场点名</h2>
              <p className="text-[--text-secondary]">十二侠客登场亮相，即将开战</p>
              {introTimer !== null && introTimer > 0 && (
                <div className="mt-3 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[--accent-red]/15 border border-[--accent-red]/30">
                  <span className="text-2xl font-bold text-[--accent-red] font-mono">{introTimer}</span>
                  <span className="text-sm text-[--text-secondary]">秒后开战</span>
                </div>
              )}
              {introTimer === 0 && (
                <div className="mt-3 text-[--accent-gold] font-bold animate-pulse">⚔️ 即将开战…</div>
              )}
            </div>
            {/* P2: 押注面板 */}
            <div className="max-w-2xl mx-auto mb-6">
              <BettingPanel />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
              {heroes.map((hero, i) => (
                <div key={hero.heroId} className="animate-fade-in-up" style={{ animationDelay: `${i * 150}ms` }}>
                  <HeroCard hero={hero} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========== 正赛 / 决赛 ========== */}
        {isGameActive && status !== 'intro' && (
          <div className="grid grid-cols-12 gap-4 lg:gap-6">
            {/* 左：英雄列表 */}
            <div className="col-span-12 lg:col-span-3">
              {/* 关系网络图 */}
              <RelationshipGraph />
              <h3 className="font-bold text-sm text-[--text-secondary] mb-2 flex items-center justify-between mt-4">
                <span>⚔️ 侠客 ({heroes.filter(h => !h.isEliminated).length} 存活)</span>
                <span className="text-xs font-normal">{heroes.length} 人</span>
              </h3>
              <div className="space-y-1.5 max-h-[70vh] overflow-y-auto pr-1">
                {heroes
                  .slice()
                  .sort((a, b) => {
                    if (a.isEliminated !== b.isEliminated) return a.isEliminated ? 1 : -1;
                    return (b.reputation || 0) - (a.reputation || 0);
                  })
                  .map(hero => (
                    <div key={hero.heroId} onClick={() => setShowDetail(
                      showDetail === hero.heroId ? null : hero.heroId
                    )} className="cursor-pointer">
                      {showDetail === hero.heroId ? (
                        <HeroCard hero={hero} />
                      ) : (
                        <HeroCard hero={hero} compact />
                      )}
                    </div>
                  ))}
              </div>
            </div>

            {/* 中：事件流 */}
            <div className="col-span-12 lg:col-span-5">
              {/* 八卦彩蛋 */}
              {gossip && (
                <div className="mb-3 text-center text-sm text-[--text-secondary] italic animate-fade-in-up">
                  💬 江湖传闻：{gossip}
                </div>
              )}

              <div className="bg-[--bg-secondary] rounded-xl p-4 border border-[--accent-gold]/10 relative overflow-hidden">
                {/* P2: 招式飘字 */}
                <FloatingText overrideEvents={isRevealing ? revealedEvents : undefined} />
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-sm">📜 江湖快报</h3>
                  {isRevealing && (
                    <button onClick={skipReveal}
                      className="text-xs px-2 py-1 rounded bg-[--accent-gold]/10 text-[--accent-gold] hover:bg-[--accent-gold]/30 transition">
                      ⏩ 跳过
                    </button>
                  )}
                </div>
                <EventFeed events={events} highlightLatest={isRevealing} />
              </div>
            </div>

            {/* 右：排行榜 */}
            <div className="col-span-12 lg:col-span-4 space-y-4">
              <RankingPanel
                title="声望榜"
                icon="⚔️"
                entries={repRanking}
                highlight={status === 'semifinals' ? 4 : 3}
              />
              <RankingPanel
                title="热搜榜"
                icon="🔥"
                entries={hotRanking}
                highlight={status === 'semifinals' ? 4 : 3}
              />
            </div>
          </div>
        )}

        {/* ========== 结束 ========== */}
        {status === 'ended' && (
          <div className="py-8 md:py-12">
            {/* 冠军横幅 */}
            <div className="text-center mb-8">
              <div className="text-7xl mb-4 animate-breathe">🏆</div>
              <h2 className="text-3xl md:text-4xl font-bold text-[--accent-gold] mb-2 animate-glow-text">
                {gameState?.championName
                  ? `恭喜「${gameState.championName}」荣登武林盟主！`
                  : '武林大会圆满落幕！'}
              </h2>
              {gameState?.gameNumber && (
                <p className="text-[--text-secondary]">第 {gameState.gameNumber} 届武林大会</p>
              )}
            </div>

            {/* 三栏布局：声望榜 | 封神榜 | 热搜榜 */}
            <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {/* 左：声望榜 */}
              <RankingPanel title="最终声望榜" icon="⚔️" entries={gameState?.reputationRanking || []} />

              {/* 中：封神榜 */}
              {events.length > 0 && (
                <div className="bg-[--bg-secondary] rounded-xl p-4 border border-[--accent-gold]/10">
                  <h3 className="font-bold text-sm mb-3">📜 封神榜</h3>
                  <EventFeed events={events} />
                </div>
              )}

              {/* 右：热搜榜 */}
              <RankingPanel title="最终热搜榜" icon="🔥" entries={gameState?.hotRanking || []} />
            </div>

            {/* 押注赢家 + 富豪榜（如有数据则展示） */}
            {((gameState?.betWinners?.length ?? 0) > 0 || (gameState?.balanceRanking?.length ?? 0) > 0) && (
              <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {(gameState?.betWinners?.length ?? 0) > 0 && (
                  <div className="bg-[--bg-secondary] rounded-xl p-4 border border-[--accent-gold]/10">
                    <h3 className="font-bold text-sm mb-3 text-[--accent-gold]">💰 押注赢家</h3>
                    <div className="space-y-2">
                      {gameState!.betWinners.map((w, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <div className="min-w-0">
                            <span className="font-bold truncate block">{w.displayName}</span>
                            <span className="text-[--text-secondary]">
                              押 {w.betHeroName} · {['🏆','🥈','🥉'][w.rank - 1]}第{w.rank}名
                            </span>
                          </div>
                          <span className="text-[--accent-gold] font-mono whitespace-nowrap ml-2">
                            +{w.payout}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {(gameState?.balanceRanking?.length ?? 0) > 0 && (
                  <div className="bg-[--bg-secondary] rounded-xl p-4 border border-[--accent-gold]/10">
                    <h3 className="font-bold text-sm mb-3 text-[--accent-gold]">🏦 富豪榜</h3>
                    <div className="space-y-2">
                      {gameState!.balanceRanking.map((entry, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[--text-secondary] w-4 text-right">{entry.rank}</span>
                            <span className="font-bold truncate">{entry.heroName}</span>
                            <span className="text-[--text-secondary] text-[10px]">{entry.faction}</span>
                          </div>
                          <span className="text-[--accent-gold] font-mono whitespace-nowrap ml-2">
                            {entry.balance.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="text-center">
              {/* 候补人数提示 */}
              {(gameState?.queueCount ?? 0) > 0 && (
                <p className="text-sm text-[--accent-gold] mb-2">
                  当前候补 {gameState!.queueCount} 人
                </p>
              )}
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <button onClick={() => { setEndedCountdown(null); if (endedTimerRef.current) { clearInterval(endedTimerRef.current); endedTimerRef.current = null; } handleJoin(); }}
                  disabled={isJoining}
                  className="btn-gold text-lg px-8 py-3">
                  {isJoining ? '加入中…' : '⚔️ 加入房间'}
                </button>
                {endedCountdown !== null && endedCountdown > 0 && (
                  <span className="text-sm text-[--text-secondary] font-mono">
                    {skipNextGame ? '将观战下一局' : `${endedCountdown}s 后自动加入`}
                  </span>
                )}
                {!skipNextGame ? (
                  <button
                    onClick={() => setSkipNextGame(true)}
                    className="px-4 py-2 rounded-lg text-sm border border-[--text-secondary]/30 text-[--text-secondary] hover:bg-[--text-secondary]/10 transition"
                  >
                    👀 仅观战
                  </button>
                ) : (
                  <span className="text-xs text-[--text-secondary] px-3 py-1.5 rounded-lg bg-[--text-secondary]/10 border border-[--text-secondary]/20">
                    👀 观战模式
                  </span>
                )}
                {/* P2: 分享战报 */}
                <ShareButton />
              </div>
              <p className="text-xs text-[--text-secondary] mt-2">
                {skipNextGame
                  ? '将以观众身份观看下一局'
                  : '未满12人自动入座，已满则顺位等候，比赛已开始则先观战'}
              </p>
            </div>
          </div>
        )}

        {/* ========== 候补弹窗（仅13人以上溢出时弹出） ========== */}
        {queueInfo && queueInfo.position > 12 && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-[--bg-secondary] border border-[--accent-gold]/20 rounded-2xl p-8 max-w-sm mx-4 text-center shadow-2xl">
              <div className="text-5xl mb-4">⏳</div>
              <h3 className="text-xl font-bold text-[--accent-gold] mb-3">您已自动候补！</h3>
              <div className="space-y-2 text-sm mb-6">
                <p>当前候补位数: <span className="text-[--accent-gold] font-bold">{queueInfo.position}</span></p>
                <p>预计等待时间: <span className="text-[--accent-gold] font-bold">~{queueInfo.estimatedMinutes} 分钟</span></p>
                <p className="text-xs text-[--text-secondary]">12人为一桌，大约3分钟一局</p>
              </div>
              <button
                onClick={() => setQueueInfo(null)}
                className="btn-gold px-6 py-2"
              >
                知道了
              </button>
            </div>
          </div>
        )}

        {/* ========== 轻提示（候补1-12位） ========== */}
        {joinToast && (
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[60] px-6 py-3 rounded-xl bg-[--bg-secondary] border border-[--accent-gold]/30 text-sm text-[--accent-gold] shadow-lg animate-fade-in-up">
            {joinToast}
          </div>
        )}

      </main>

      {/* ===== 底栏 ===== */}
      <footer className="fixed bottom-0 left-0 right-0 border-t border-[--accent-gold]/10 bg-[--bg-secondary]/95 backdrop-blur z-40">
        {/* P2: 弹幕输入 */}
        {isGameActive && (
          <div className="max-w-7xl mx-auto px-4 pt-2">
            <DanmakuInput />
          </div>
        )}
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between text-xs text-[--text-secondary]">
          <span>
            {status} · R{gameState?.currentRound || 0}
            {gameState?.heroes?.length ? ` · ${gameState.heroes.filter(h => !h.isEliminated).length}人存活` : ''}
          </span>
          <span>AI 武林大会 · <a href="https://hackathon.second.me/" target="_blank" rel="noopener" className="text-[--accent-gold] hover:underline">SecondMe A2A 黑客松</a></span>
        </div>
      </footer>
    </div>
  );
}
