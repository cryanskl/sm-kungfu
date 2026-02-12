'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useWulinStore } from '@/stores/gameStore';
import { DanmakuOverlay } from '@/components/game/DanmakuOverlay';
import { DanmakuInput } from '@/components/game/DanmakuInput';
import { GameHeader } from '@/components/game/GameHeader';
import { WaitingPhase } from '@/components/game/phases/WaitingPhase';
import { IntroPhase } from '@/components/game/phases/IntroPhase';
import { ActiveGamePhase } from '@/components/game/phases/ActiveGamePhase';
import { EndedPhase } from '@/components/game/phases/EndedPhase';
import { ArtifactSelectionPanel } from '@/components/game/ArtifactSelectionPanel';
import { soundManager } from '@/lib/sound';
import { bgmManager } from '@/lib/bgm';
import { GOSSIP_LINES, LOADING_LINES } from '@/lib/game/constants';
import { useEventRevealer } from '@/hooks/useEventRevealer';
import { generateCommentary, generateWelcomeDanmaku, resetEliminationCount, generateCelebrationDanmaku } from '@/lib/game/commentary';

export default function Home() {
  const { user, setUser, gameState, setGameState, currentEvents, setCurrentEvents, startPolling, pollNow, clearAudienceBets, clearLocalDanmaku, clearAudienceArtifact, addCommentaryDanmaku, addLocalDanmaku } = useWulinStore();

  // UI state
  const [isInitLoading, setIsInitLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [queueInfo, setQueueInfo] = useState<{ position: number; estimatedMinutes: number } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [roundTimer, setRoundTimer] = useState<number | null>(null);
  const [gossip, setGossip] = useState('');
  const [loadingLine, setLoadingLine] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [joinToast, setJoinToast] = useState<string | null>(null);
  const [introTimer, setIntroTimer] = useState<number | null>(null);
  const introTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [artifactTimer, setArtifactTimer] = useState<number | null>(null);
  const artifactTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [endingTimer, setEndingTimer] = useState<number | null>(null);
  const endingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [endedCountdown, setEndedCountdown] = useState<number | null>(null);
  const endedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [skipNextGame, setSkipNextGame] = useState(false);
  const [isQueued, setIsQueued] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  // 事件逐条揭晓
  const {
    isRevealing, revealedEvents, progressiveHeroes: revealHeroes,
    progressiveRepRanking, progressiveHotRanking,
    startReveal, skipReveal,
  } = useEventRevealer();

  // Refs
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const roundTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTriggeredRef = useRef<string>('');
  const commentaryTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const roundTriggeredRef = useRef(false);
  const wasRevealingRef = useRef(false);

  // 揭晓完毕后自动触发下一轮（核心流畅化逻辑）
  useEffect(() => {
    if (isRevealing) {
      wasRevealingRef.current = true;
      return;
    }
    // 只在 true→false 转换时触发，忽略初始 false
    if (!wasRevealingRef.current) return;
    wasRevealingRef.current = false;

    const status = gameState?.status;
    const gameId = gameState?.gameId;
    if (!status || !gameId) return;

    // round_2 ~ round_5: 揭晓完立即触发下一轮
    if (status.startsWith('round_') && !roundTriggeredRef.current) {
      const nextRound = parseInt(status.split('_')[1]);
      if (!isNaN(nextRound) && nextRound >= 2 && nextRound <= 5) {
        roundTriggeredRef.current = true;
        // 取消备用定时器
        if (roundTimerRef.current) { clearInterval(roundTimerRef.current); roundTimerRef.current = null; }
        setRoundTimer(null);
        // 1.5s 喘息后立即触发
        timerRef.current = setTimeout(() => triggerRound(gameId, nextRound), 1500);
      }
    }
  }, [isRevealing, gameState?.status, gameState?.gameId]);

  // === Init: 并行拉取 auth + game state，消除白屏 ===
  useEffect(() => {
    const init = async () => {
      await Promise.all([
        fetch('/api/auth/me').then(r => r.json()).then(data => {
          if (data.user && data.hero) {
            setUser({ userId: data.user.userId, heroId: data.hero.id, hero: data.hero, isLoggedIn: true });
          }
        }).catch(() => {}),
        startPolling(),
      ]);
      setIsInitLoading(false);
    };
    init();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (roundTimerRef.current) clearInterval(roundTimerRef.current);
      if (introTimerRef.current) clearInterval(introTimerRef.current);
      if (artifactTimerRef.current) clearInterval(artifactTimerRef.current);
      if (finalRetryRef.current) clearInterval(finalRetryRef.current);
      if (endingTimerRef.current) clearInterval(endingTimerRef.current);
      if (endedTimerRef.current) clearInterval(endedTimerRef.current);
      commentaryTimersRef.current.forEach(t => clearTimeout(t));
    };
  }, []);

  // 候补弹窗：游戏进入 waiting/countdown 时自动关闭 + 重置赛后状态
  useEffect(() => {
    if (gameState?.status === 'waiting' || gameState?.status === 'countdown') {
      if (queueInfo) setQueueInfo(null);
      setSkipNextGame(false);
      setEndedCountdown(null);
      setIsQueued(false);
      if (endedTimerRef.current) { clearInterval(endedTimerRef.current); endedTimerRef.current = null; }
      // Only clear danmaku in waiting (not countdown — welcome danmaku live there)
      if (gameState?.status === 'waiting') clearLocalDanmaku();
    }
  }, [gameState?.status, queueInfo]);

  // ended 时清空弹幕 + 事件计数器 + 定时器（逻辑合并到下方音效 prevStatusRef 中）

  // 新一局重置押注 + 弹幕 + 解说淘汰计数 + 事件计数器
  const prevGameIdRef = useRef<string | null>(null);
  useEffect(() => {
    const gid = gameState?.gameId ?? null;
    if (prevGameIdRef.current && gid !== prevGameIdRef.current) {
      clearAudienceBets();
      clearLocalDanmaku();
      clearAudienceArtifact();
      resetEliminationCount();
      lastEventCountRef.current = 0;
    }
    prevGameIdRef.current = gid;
  }, [gameState?.gameId, clearAudienceBets, clearLocalDanmaku]);

  // === 入座欢迎弹幕 ===
  const prevHeroCountRef = useRef(0);
  const welcomeTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const status = gameState?.status;
    const heroCount = gameState?.heroes?.length ?? 0;
    if (status === 'countdown' && heroCount > prevHeroCountRef.current && prevHeroCountRef.current > 0) {
      // New heroes seated — fire welcome danmaku for each
      const newHeroes = (gameState?.heroes || []).slice(prevHeroCountRef.current);
      newHeroes.forEach((hero, i) => {
        const delay = i * 800; // stagger 800ms per hero
        const timer = setTimeout(() => {
          addLocalDanmaku(generateWelcomeDanmaku(hero.heroName));
        }, delay);
        welcomeTimersRef.current.push(timer);
      });
    }
    // Reset when leaving countdown (e.g. NPC fill on intro shouldn't trigger)
    if (status !== 'countdown' && status !== 'waiting') {
      prevHeroCountRef.current = 0;
      welcomeTimersRef.current.forEach(t => clearTimeout(t));
      welcomeTimersRef.current = [];
    } else {
      prevHeroCountRef.current = heroCount;
    }
  }, [gameState?.heroes?.length, gameState?.status]);

  // === 状态驱动器 ===
  useEffect(() => {
    const status = gameState?.status;
    const gameId = gameState?.gameId;
    if (!status || !gameId) return;

    const key = `${gameId}:${status}`;
    if (lastTriggeredRef.current === key) return;

    if (status === 'countdown' && countdown === null) {
      lastTriggeredRef.current = key;
      startCountdown(gameId);
    }

    if (status === 'intro') {
      lastTriggeredRef.current = key;
      clearAllTimers();
      setIntroTimer(15);
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
      fetch('/api/engine/prefetch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, roundNumber: 1 }),
      }).catch(() => {});
      timerRef.current = setTimeout(() => triggerRound(gameId, 1), 10000); // 提前 5s 触发，减少「即将开战」等待
    }

    if (status.startsWith('round_')) {
      const pendingRound = parseInt(status.split('_')[1]);
      if (!isNaN(pendingRound) && pendingRound >= 2 && pendingRound <= 5) {
        lastTriggeredRef.current = key;
        fetch('/api/engine/prefetch', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId, roundNumber: pendingRound }),
        }).catch(() => {});
        startRoundTimer(gameId, pendingRound, 30); // 兜底30s，正常由揭晓完毕触发
      }
    }

    if (status === 'semifinals') {
      lastTriggeredRef.current = key;
      clearAllTimers();
      timerRef.current = setTimeout(() => triggerFinals(gameId), 5000);
    }

    if (status === 'artifact_selection') {
      lastTriggeredRef.current = key;
      clearAllTimers();
      setArtifactTimer(10);
      if (artifactTimerRef.current) clearInterval(artifactTimerRef.current);
      artifactTimerRef.current = setInterval(() => {
        setArtifactTimer(prev => {
          if (prev === null || prev <= 1) {
            if (artifactTimerRef.current) clearInterval(artifactTimerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      timerRef.current = setTimeout(() => triggerFinal(gameId), 10000);
    }

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

  // ended 倒计时到 0：自动加入或刷新
  useEffect(() => {
    if (endedCountdown === 0 && gameState?.status === 'ended') {
      if (!skipNextGame) { handleJoin(); } else { pollNow(); }
    }
  }, [endedCountdown]);

  // artifact_selection 兜底重试：倒计时结束后 retry triggerFinal
  const finalRetryRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (finalRetryRef.current) { clearInterval(finalRetryRef.current); finalRetryRef.current = null; }
    if (gameState?.status === 'artifact_selection' && gameState?.gameId && artifactTimer === 0) {
      triggerFinal(gameState.gameId);
      const gid = gameState.gameId;
      finalRetryRef.current = setInterval(() => { triggerFinal(gid); }, 3000);
    }
    return () => { if (finalRetryRef.current) { clearInterval(finalRetryRef.current); finalRetryRef.current = null; } };
  }, [artifactTimer, gameState?.status, gameState?.gameId]);

  // ending 兜底重试
  const endRetryRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (endRetryRef.current) { clearInterval(endRetryRef.current); endRetryRef.current = null; }
    if (gameState?.status === 'ending' && gameState?.gameId && !isRevealing) {
      triggerEnd(gameState.gameId);
      const gid = gameState.gameId;
      endRetryRef.current = setInterval(() => { triggerEnd(gid); }, 5000);
    }
    return () => { if (endRetryRef.current) { clearInterval(endRetryRef.current); endRetryRef.current = null; } };
  }, [isRevealing, gameState?.status, gameState?.gameId]);

  // 音效 + ended 时清空弹幕
  const prevStatusRef = useRef<string>('');
  useEffect(() => {
    const status = gameState?.status || '';
    if (status === prevStatusRef.current) return;
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (status === 'intro' && prev !== 'intro') soundManager.play('intro_drums');
    if (status === 'semifinals' || status === 'final') soundManager.play('finals');
    if (status === 'ending') {
      // 进入封神阶段，先清空旧弹幕
      clearLocalDanmaku();
      commentaryTimersRef.current.forEach(t => clearTimeout(t));
      commentaryTimersRef.current = [];
    }
    if (status === 'ended') {
      soundManager.play('champion');
      clearLocalDanmaku();
      lastEventCountRef.current = 0;
      resetEliminationCount();
      commentaryTimersRef.current.forEach(t => clearTimeout(t));
      commentaryTimersRef.current = [];
      // 生成庆祝弹幕，分散在 2-30 秒内飘过
      const celebrations = generateCelebrationDanmaku(gameState?.championName || undefined);
      celebrations.forEach((item, i) => {
        const delay = 2000 + Math.floor(Math.random() * 28000);
        const timer = setTimeout(() => addLocalDanmaku(item), delay);
        commentaryTimersRef.current.push(timer);
      });
    }
  }, [gameState?.status]);

  // BGM phase sync
  useEffect(() => {
    bgmManager.setPhase(gameState?.status || 'waiting');
  }, [gameState?.status]);

  const isMuted = useWulinStore(s => s.isMuted);
  useEffect(() => { bgmManager.muted = isMuted; }, [isMuted]);
  useEffect(() => () => bgmManager.destroy(), []);

  // Sound effects on new events (separate from commentary)
  const lastEventCountRef = useRef(0);
  useEffect(() => {
    const evts = gameState?.recentEvents || [];
    if (evts.length <= lastEventCountRef.current) return;
    const newEvts = evts.slice(lastEventCountRef.current);
    lastEventCountRef.current = evts.length;
    for (const e of newEvts) {
      if (e.eventType === 'fight' || e.eventType === 'gang_up' || e.eventType === 'scramble') { soundManager.play('fight'); break; }
      if (e.eventType === 'betray') { soundManager.play('betray'); break; }
      if (e.eventType === 'eliminated') { soundManager.play('eliminated'); break; }
    }
  }, [gameState?.recentEvents]);

  // Commentary danmaku — synced to event reveal rhythm
  const lastRevealedCountRef = useRef(0);
  const prevIsRevealingRef = useRef(false);
  useEffect(() => {
    // Reset counter when a new reveal session starts
    if (isRevealing && !prevIsRevealingRef.current) {
      lastRevealedCountRef.current = 0;
      commentaryTimersRef.current.forEach(t => clearTimeout(t));
      commentaryTimersRef.current = [];
    }
    prevIsRevealingRef.current = isRevealing;

    if (!isRevealing) return;
    const count = revealedEvents.length;
    if (count <= lastRevealedCountRef.current) return;

    // Process newly revealed events
    const newEvts = revealedEvents.slice(lastRevealedCountRef.current);
    lastRevealedCountRef.current = count;
    const heroes = gameState?.heroes || [];

    for (const e of newEvts) {
      const commentary = generateCommentary(e, heroes);
      if (commentary) {
        const delay = Math.floor(Math.random() * 500); // 0-500ms jitter
        const timer = setTimeout(() => addCommentaryDanmaku(commentary), delay);
        commentaryTimersRef.current.push(timer);
      }
    }
  }, [revealedEvents.length, isRevealing]);

  function clearAllTimers() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    if (roundTimerRef.current) { clearInterval(roundTimerRef.current); roundTimerRef.current = null; }
    if (artifactTimerRef.current) { clearInterval(artifactTimerRef.current); artifactTimerRef.current = null; }
    setCountdown(null);
    setRoundTimer(null);
    setArtifactTimer(null);
  }

  function startCountdown(gameId: string) {
    setCountdown(30);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev === null || prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          triggerStart(gameId); // 兜底：如果提前触发失败
          return 0;
        }
        if (prev === 5) triggerStart(gameId); // 提前 5s 触发，减少「开战中」等待
        return prev - 1;
      });
    }, 1000);
  }

  function startRoundTimer(gameId: string, nextRound: number, seconds: number) {
    // 仅用作安全兜底 — 正常流程由揭晓完毕 effect 驱动
    setRoundTimer(seconds);
    roundTriggeredRef.current = false;
    if (roundTimerRef.current) clearInterval(roundTimerRef.current);
    roundTimerRef.current = setInterval(() => {
      setRoundTimer(prev => {
        if (prev === null || prev <= 1) {
          if (roundTimerRef.current) clearInterval(roundTimerRef.current);
          if (!roundTriggeredRef.current) {
            roundTriggeredRef.current = true;
            triggerRound(gameId, nextRound);
          }
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }

  // === API Calls ===

  const handleJoin = useCallback(async () => {
    if (!user.isLoggedIn) { window.location.href = '/api/auth/login'; return; }
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
      if (res.ok) { pollNow(); } else {
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
    setLoadingLine(LOADING_LINES[Math.floor(Math.random() * LOADING_LINES.length)]);
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
        startReveal(data.events, snapshot, 35000);
      }
    } catch (e) { console.error('Round error:', e); pollNow(); }
    setIsProcessing(false);
  }, [isProcessing, startReveal, setGameState, pollNow]);

  const triggerFinals = useCallback(async (gameId: string) => {
    if (isProcessing) return;
    setIsProcessing(true);
    setLoadingLine(LOADING_LINES[Math.floor(Math.random() * LOADING_LINES.length)]);
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
        startReveal(data.events, snapshot, 10000);
      }
    } catch (e) { console.error('Finals error:', e); pollNow(); }
    setIsProcessing(false);
  }, [isProcessing, startReveal, setGameState, pollNow]);

  const triggerFinal = useCallback(async (gameId: string) => {
    if (isProcessing) return;
    setIsProcessing(true);
    const snapshot = useWulinStore.getState().gameState?.heroes || [];
    try {
      const res = await fetch('/api/engine/final', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId }),
      });
      const data = await res.json();
      if (data.gameState) setGameState(data.gameState);
      else pollNow();
      if (data.events) {
        setCurrentEvents(data.events);
        startReveal(data.events, snapshot, 10000);
      }
    } catch (e) { console.error('Final error:', e); pollNow(); }
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
      } else { pollNow(); }
    } catch (e) { console.error('End error:', e); pollNow(); }
  }, [setGameState, pollNow]);

  const handleJoinImmediate = useCallback(() => {
    setEndedCountdown(null);
    if (endedTimerRef.current) { clearInterval(endedTimerRef.current); endedTimerRef.current = null; }
    handleJoin();
  }, [handleJoin]);

  // === Render ===
  const status = gameState?.status || 'waiting';
  const hasRevealed = revealedEvents.length > 0;
  const heroes = isRevealing ? revealHeroes : (gameState?.heroes || []);
  const events = (isRevealing || hasRevealed) ? revealedEvents : (currentEvents.length > 0 ? currentEvents : (gameState?.recentEvents || []));
  const repRanking = isRevealing ? progressiveRepRanking : (gameState?.reputationRanking || []);
  const hotRanking = isRevealing ? progressiveHotRanking : (gameState?.hotRanking || []);
  const isGameActive = status.startsWith('round_') || status.startsWith('processing_') ||
    status === 'intro' || status === 'semifinals' || status === 'artifact_selection' || status === 'final' || status === 'ending';
  const isParticipant = user.isLoggedIn && gameState?.heroes?.some(h => h.heroId === user.heroId);

  // 初始加载骨架屏 — 数据到达前立即展示，避免白屏
  if (isInitLoading) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center bg-[--bg-primary)]">
        <div className="text-center space-y-4 animate-pulse">
          <div className="text-4xl">⚔️</div>
          <p className="text-[--text-secondary] text-sm">江湖载入中…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      <GameHeader
        user={user}
        gameState={gameState}
        status={status}
        isGameActive={isGameActive}
        isParticipant={!!isParticipant}
        isProcessing={isProcessing}
        roundTimer={roundTimer}
        endingTimer={endingTimer}
        isQueued={isQueued}
        isLeaving={isLeaving}
        onJoin={handleJoin}
        onLeave={handleLeave}
        onSetQueued={setIsQueued}
      />

      <DanmakuOverlay />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-6 overflow-y-auto">
        {(status === 'waiting' || status === 'countdown') && (
          <WaitingPhase
            gameState={gameState}
            heroes={heroes}
            countdown={countdown}
            isJoining={isJoining}
            errorMsg={errorMsg}
            isLoggedIn={user.isLoggedIn}
            onJoin={handleJoin}
          />
        )}

        {status === 'intro' && (
          <IntroPhase heroes={heroes} introTimer={introTimer} />
        )}

        {status === 'artifact_selection' && gameState?.artifactPool && (
          <ArtifactSelectionPanel
            artifactPool={gameState.artifactPool}
            timer={artifactTimer}
            gameId={gameState.gameId || ''}
            heroes={heroes}
          />
        )}

        {isGameActive && status !== 'intro' && status !== 'artifact_selection' && (
          <ActiveGamePhase
            gameState={gameState}
            status={status}
            heroes={heroes}
            events={events}
            repRanking={repRanking}
            hotRanking={hotRanking}
            gossip={gossip}
            isProcessing={isProcessing}
            loadingLine={loadingLine}
            isRevealing={isRevealing}
            revealedEvents={revealedEvents}
            roundTimer={roundTimer}
            onSkipReveal={skipReveal}
          />
        )}

        {status === 'ended' && (
          <EndedPhase
            gameState={gameState}
            events={events}
            isJoining={isJoining}
            endedCountdown={endedCountdown}
            skipNextGame={skipNextGame}
            onJoin={handleJoin}
            onJoinImmediate={handleJoinImmediate}
            onSkipNextGame={setSkipNextGame}
          />
        )}

        {/* Queue Modal */}
        {queueInfo && queueInfo.position > 12 && (
          <div className="modal-wuxia">
            <div className="modal-wuxia-content">
              <div className="text-5xl mb-4">⏳</div>
              <h3 className="text-xl font-display font-bold text-gold mb-3">您已自动候补！</h3>
              <div className="space-y-2 text-sm mb-6">
                <p>当前候补位数: <span className="text-gold font-bold tabular-nums">{queueInfo.position}</span></p>
                <p>预计等待时间: <span className="text-gold font-bold">~{queueInfo.estimatedMinutes} 分钟</span></p>
                <p className="text-xs text-[--text-dim]">12人为一桌，大约3分钟一局</p>
              </div>
              <button onClick={() => setQueueInfo(null)} className="btn-gold px-8 py-2">知道了</button>
            </div>
          </div>
        )}

        {joinToast && <div className="toast-wuxia">{joinToast}</div>}
      </main>

      <footer className="footer-wuxia">
        {isGameActive && (
          <div className="max-w-7xl mx-auto px-4 pt-2">
            <DanmakuInput />
          </div>
        )}
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between text-xs text-[--text-dim]">
          <span className="tabular-nums">
            {status} · R{gameState?.currentRound || 0}
            {gameState?.heroes?.length ? ` · ${gameState.heroes.filter(h => !h.isEliminated).length}人存活` : ''}
          </span>
          <span>
            AI 武林大会 · <a href="https://hackathon.second.me/" target="_blank" rel="noopener" className="text-gold hover:underline">SecondMe A2A 黑客松</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
