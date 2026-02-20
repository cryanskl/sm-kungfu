'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useWulinStore } from '@/stores/gameStore';
import { useShallow } from 'zustand/react/shallow';
import { DanmakuOverlay } from '@/components/game/DanmakuOverlay';
import { DanmakuInput } from '@/components/game/DanmakuInput';
import { GameHeader } from '@/components/game/GameHeader';
import { WaitingPhase } from '@/components/game/phases/WaitingPhase';
import { IntroPhase } from '@/components/game/phases/IntroPhase';
import { ActiveGamePhase } from '@/components/game/phases/ActiveGamePhase';
import { EndedPhase } from '@/components/game/phases/EndedPhase';
import { ArtifactSelectionPanel } from '@/components/game/ArtifactSelectionPanel';
import FullScreenEffect from '@/components/game/FullScreenEffect';
import AchievementToast from '@/components/game/AchievementToast';
import { soundManager } from '@/lib/sound';
import { bgmManager } from '@/lib/bgm';
import { GOSSIP_LINES, LOADING_LINES, INTRO_DURATION } from '@/lib/game/constants';
import { useEventRevealer } from '@/hooks/useEventRevealer';
import { generateCommentary, generateWelcomeDanmaku, resetEliminationCount, generateCelebrationDanmaku } from '@/lib/game/commentary';

const ENGINE_HEADERS: HeadersInit = {
  'Content-Type': 'application/json',
  ...(process.env.NEXT_PUBLIC_ENGINE_SECRET ? { 'X-Engine-Secret': process.env.NEXT_PUBLIC_ENGINE_SECRET } : {}),
};

function statusLabel(status: string | undefined): string {
  if (!status) return '等待中';
  if (status === 'waiting') return '等待入场';
  if (status === 'countdown') return '即将开始';
  if (status === 'intro') return '江湖开篇';
  if (status.startsWith('choosing_')) return `选择奇遇`;
  if (status.startsWith('resolving_')) return `回合结算中`;
  if (status.startsWith('round_')) return `比武进行中`;
  if (status === 'semifinals' || status === 'processing_finals') return '半决赛';
  if (status === 'artifact_selection') return '神兵助战';
  if (status === 'final' || status === 'processing_final') return '总决赛';
  if (status === 'ending') return '落幕';
  if (status === 'ended') return '已结束';
  return status;
}

export default function Home() {
  // 只订阅渲染需要的状态值（避免 danmaku/bet 等高频变更导致整组件重渲染）
  const { user, gameState, currentEvents } = useWulinStore(
    useShallow(s => ({ user: s.user, gameState: s.gameState, currentEvents: s.currentEvents }))
  );
  // 函数引用在 Zustand 中永远稳定，直接从 getState 取，不触发订阅
  const { setUser, setGameState, setCurrentEvents, startPolling, pollNow, clearAudienceBets, clearLocalDanmaku, clearAudienceArtifact, addCommentaryDanmaku, addLocalDanmaku, setMyEventsCompleted, submitChoices } = useWulinStore.getState();

  // UI state
  const [isInitLoading, setIsInitLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [queueInfo, setQueueInfo] = useState<{ position: number; estimatedMinutes: number } | null>(null);
  const [isProcessing, _setIsProcessing] = useState(false);
  const isProcessingRef = useRef(false);
  // 同步更新 ref + state，确保 setTimeout/setInterval 中永远读到最新值
  const setIsProcessing = useCallback((v: boolean) => { isProcessingRef.current = v; _setIsProcessing(v); }, []);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [roundTimer, setRoundTimer] = useState<number | null>(null);
  const [gossip, setGossip] = useState('');
  const [loadingLine, setLoadingLine] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [joinToast, setJoinToast] = useState<string | null>(null);
  const [spectatorToast, setSpectatorToast] = useState<string | null>(null);
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
    startReveal, skipReveal, resetReveal,
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

    // round_2 ~ round_5: 揭晓完立即触发下一轮的选择阶段
    if (status.startsWith('round_') && !roundTriggeredRef.current) {
      const nextRound = parseInt(status.split('_')[1]);
      if (!isNaN(nextRound) && nextRound >= 2 && nextRound <= 5) {
        roundTriggeredRef.current = true;
        // 取消备用定时器
        if (roundTimerRef.current) { clearInterval(roundTimerRef.current); roundTimerRef.current = null; }
        setRoundTimer(null);
        // 1.5s 喘息后进入选择阶段
        timerRef.current = setTimeout(() => triggerChooseStart(gameId, nextRound), 1500);
      }
    }
  }, [isRevealing, gameState?.status, gameState?.gameId]);

  // 兜底：轮询发现状态停留超时且未在处理中，强制触发
  // 使用 ref 读取最新 phaseElapsedMs，避免 setInterval 闭包捕获过期值
  const stuckCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (stuckCheckRef.current) { clearInterval(stuckCheckRef.current); stuckCheckRef.current = null; }
    const status = gameState?.status;
    const gameId = gameState?.gameId;
    if (!status || !gameId) return;

    const getElapsed = () => useWulinStore.getState().gameState?.phaseElapsedMs;

    // round_2~5: >40s stuck → retry triggerChooseStart（进入选择阶段，而非直接解算）
    if (status.startsWith('round_')) {
      const roundNum = parseInt(status.split('_')[1]);
      if (!isNaN(roundNum) && roundNum >= 2 && roundNum <= 5) {
        stuckCheckRef.current = setInterval(() => {
          const elapsed = getElapsed();
          if (elapsed == null) return;
          // 标准兜底：40s + 非处理中
          if (elapsed > 40000 && !isProcessingRef.current && !isRevealing) {
            console.warn(`[StuckDetector] round_${roundNum} stuck for ${elapsed}ms, triggering choose start`);
            triggerChooseStart(gameId, roundNum);
          }
          // 紧急兜底：60s 无论是否 isProcessing，强制重置并重试
          if (elapsed > 60000 && isProcessingRef.current) {
            console.warn(`[StuckDetector] round_${roundNum} EMERGENCY: processing stuck for ${elapsed}ms, force-resetting`);
            setIsProcessing(false);
            triggerChooseStart(gameId, roundNum);
          }
        }, 5000);
      }
    }

    // intro: >40s stuck → retry triggerChooseStart(1)
    if (status === 'intro') {
      stuckCheckRef.current = setInterval(() => {
        const elapsed = getElapsed();
        if (elapsed != null && elapsed > 40000 && !isProcessingRef.current) {
          console.warn(`[StuckDetector] intro stuck for ${elapsed}ms, force triggering choosing 1`);
          triggerChooseStart(gameId, 1);
        }
      }, 5000);
    }

    // resolving_N: >30s stuck → re-trigger round resolution
    if (status.startsWith('resolving_')) {
      const roundNum = parseInt(status.split('_')[1]);
      if (!isNaN(roundNum)) {
        stuckCheckRef.current = setInterval(() => {
          const elapsed = getElapsed();
          if (elapsed != null && elapsed > 30000 && !isProcessingRef.current) {
            console.warn(`[StuckDetector] resolving_${roundNum} stuck for ${elapsed}ms, force triggering`);
            triggerRound(gameId, roundNum);
          }
        }, 5000);
      }
    }

    // semifinals: >40s stuck → retry triggerFinals
    if (status === 'semifinals') {
      stuckCheckRef.current = setInterval(() => {
        const elapsed = getElapsed();
        if (elapsed != null && elapsed > 40000 && !isProcessingRef.current) {
          console.warn(`[StuckDetector] semifinals stuck for ${elapsed}ms, force triggering finals`);
          triggerFinals(gameId);
        }
      }, 5000);
    }

    return () => { if (stuckCheckRef.current) { clearInterval(stuckCheckRef.current); stuckCheckRef.current = null; } };
  }, [gameState?.status, gameState?.gameId]);

  // 选择阶段截止后自动触发回合解算
  useEffect(() => {
    const status = gameState?.status;
    const gameId = gameState?.gameId;
    if (!status || !gameId || !status.startsWith('choosing_')) return;

    const roundNumber = parseInt(status.split('_')[1]);
    if (isNaN(roundNumber)) return;

    const deadline = gameState?.choosingDeadline;
    if (!deadline) return;

    const timeUntilDeadline = new Date(deadline).getTime() - Date.now();
    const delay = Math.max(0, timeUntilDeadline + 1000); // 1s grace after deadline

    const timer = setTimeout(() => {
      triggerRound(gameId, roundNumber);
    }, delay);

    return () => clearTimeout(timer);
  }, [gameState?.status, gameState?.choosingDeadline]);

  // === Init: 并行拉取 auth + game state，消除白屏 ===
  // 优先使用 SSE 实时推送，失败降级到轮询
  useEffect(() => {
    const init = async () => {
      await Promise.all([
        fetch('/api/auth/me').then(r => r.json()).then(data => {
          if (data.user && data.hero) {
            setUser({ userId: data.user.userId, heroId: data.hero.id, hero: data.hero, isLoggedIn: true });
          }
        }).catch(() => {}),
        // 先用轮询拉取首屏数据，再启动 SSE
        startPolling(),
      ]);
      // SSE 暂时禁用：endpoint 在 Vercel serverless 上不可靠且有资源泄露
      // 轮询已足够满足需求（智能间隔：战斗 3s / 等待 8s）
      setIsInitLoading(false);
    };
    init();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (roundTimerRef.current) clearInterval(roundTimerRef.current);
      if (introTimerRef.current) clearInterval(introTimerRef.current);
      if (stuckCheckRef.current) clearInterval(stuckCheckRef.current);
      if (artifactTimerRef.current) clearInterval(artifactTimerRef.current);
      if (finalRetryRef.current) clearInterval(finalRetryRef.current);
      if (endRetryRef.current) clearInterval(endRetryRef.current);
      if (endingTimerRef.current) clearInterval(endingTimerRef.current);
      if (endedTimerRef.current) clearInterval(endedTimerRef.current);
      commentaryTimersRef.current.forEach(t => clearTimeout(t));
      welcomeTimersRef.current.forEach(t => clearTimeout(t));
    };
  }, []);

  // Tab 可见性感知：隐藏时暂停轮询，可见时恢复并立即同步
  useEffect(() => {
    const handleVisibility = () => {
      const store = useWulinStore.getState();
      if (document.hidden) {
        store.stopPolling();
      } else {
        store.startPolling();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
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
      // 清除上一局残留的事件，防止新回合显示旧决赛结果
      setCurrentEvents([]);
      resetReveal();
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
      startCountdown(gameId, gameState?.countdownSeconds ?? 30);
    }

    if (status === 'intro') {
      lastTriggeredRef.current = key;
      clearAllTimers();
      const elapsed = getPhaseElapsedSec();
      const introRemaining = Math.max(0, INTRO_DURATION - elapsed);
      setIntroTimer(introRemaining);
      if (introTimerRef.current) clearInterval(introTimerRef.current);
      if (introRemaining > 0) {
        introTimerRef.current = setInterval(() => {
          setIntroTimer(prev => {
            if (prev === null || prev <= 1) {
              if (introTimerRef.current) clearInterval(introTimerRef.current);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
      fetch('/api/engine/prefetch', {
        method: 'POST', headers: ENGINE_HEADERS,
        body: JSON.stringify({ gameId, roundNumber: 1 }),
      }).catch(() => {});
      // intro 结束后触发选择阶段
      const triggerDelay = Math.max(0, INTRO_DURATION * 1000 - elapsed * 1000);
      timerRef.current = setTimeout(() => triggerChooseStart(gameId, 1), triggerDelay);
    }

    if (status.startsWith('round_')) {
      const pendingRound = parseInt(status.split('_')[1]);
      if (!isNaN(pendingRound) && pendingRound >= 2 && pendingRound <= 5) {
        lastTriggeredRef.current = key;
        fetch('/api/engine/prefetch', {
          method: 'POST', headers: ENGINE_HEADERS,
          body: JSON.stringify({ gameId, roundNumber: pendingRound }),
        }).catch(() => {});
        const elapsed = getPhaseElapsedSec();
        startRoundTimer(gameId, pendingRound, Math.max(5, 30 - elapsed)); // 兜底，减去已过时间
      }
    }

    if (status === 'semifinals') {
      lastTriggeredRef.current = key;
      clearAllTimers();
      const elapsed = getPhaseElapsedSec();
      const triggerDelay = Math.max(0, 5000 - elapsed * 1000);
      timerRef.current = setTimeout(() => triggerFinals(gameId), triggerDelay);
    }

    if (status === 'artifact_selection') {
      lastTriggeredRef.current = key;
      clearAllTimers();
      const elapsed = getPhaseElapsedSec();
      const artifactRemaining = Math.max(0, 10 - elapsed);
      setArtifactTimer(artifactRemaining);
      if (artifactTimerRef.current) clearInterval(artifactTimerRef.current);
      if (artifactRemaining > 0) {
        artifactTimerRef.current = setInterval(() => {
          setArtifactTimer(prev => {
            if (prev === null || prev <= 1) {
              if (artifactTimerRef.current) clearInterval(artifactTimerRef.current);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
      const triggerDelay = Math.max(0, 10000 - elapsed * 1000);
      timerRef.current = setTimeout(() => triggerFinal(gameId), triggerDelay);
    }

    if (status === 'ending') {
      lastTriggeredRef.current = key;
      clearAllTimers();
      const elapsed = getPhaseElapsedSec();
      const endingRemaining = Math.max(0, 10 - elapsed);
      setEndingTimer(endingRemaining);
      if (endingTimerRef.current) clearInterval(endingTimerRef.current);
      if (endingRemaining > 0) {
        endingTimerRef.current = setInterval(() => {
          setEndingTimer(prev => {
            if (prev === null || prev <= 1) {
              if (endingTimerRef.current) clearInterval(endingTimerRef.current);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
      const triggerDelay = Math.max(0, 10000 - elapsed * 1000);
      timerRef.current = setTimeout(() => triggerEnd(gameId), triggerDelay);
    }

    if (status === 'ended') {
      lastTriggeredRef.current = key;
      const elapsed = getPhaseElapsedSec();
      const endedRemaining = Math.max(0, 45 - elapsed);
      setEndedCountdown(endedRemaining);
      if (endedTimerRef.current) clearInterval(endedTimerRef.current);
      if (endedRemaining > 0) {
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
    }
  }, [gameState?.status, gameState?.gameId]);

  // 服务器权威时间同步：每次轮询校准本地 timer
  useEffect(() => {
    const status = gameState?.status;

    // countdown: 用服务端精确计算的 countdownSeconds（独立于 phaseElapsedMs）
    if (status === 'countdown' && gameState?.countdownSeconds != null && countdown !== null) {
      setCountdown(gameState.countdownSeconds);
    }

    const elapsed = gameState?.phaseElapsedMs;
    if (!status || elapsed == null) return;
    const elapsedSec = Math.floor(elapsed / 1000);

    // intro: INTRO_DURATION 总时长
    if (status === 'intro' && introTimer !== null) {
      setIntroTimer(Math.max(0, INTRO_DURATION - elapsedSec));
    }
    // artifact_selection: 10s 总时长
    if (status === 'artifact_selection' && artifactTimer !== null) {
      setArtifactTimer(Math.max(0, 10 - elapsedSec));
    }
    // ending: 10s 总时长
    if (status === 'ending' && endingTimer !== null) {
      setEndingTimer(Math.max(0, 10 - elapsedSec));
    }
    // ended: 45s 总时长
    if (status === 'ended' && endedCountdown !== null) {
      setEndedCountdown(Math.max(0, 45 - elapsedSec));
    }
  }, [gameState?.updatedAt]);

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

  // ending 兜底重试（使用 ref 防止 isRevealing 切换时重复触发 triggerEnd）
  const endRetryRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endTriggeredForRef = useRef<string | null>(null);
  useEffect(() => {
    if (endRetryRef.current) { clearInterval(endRetryRef.current); endRetryRef.current = null; }
    if (gameState?.status === 'ending' && gameState?.gameId && !isRevealing) {
      const gid = gameState.gameId;
      // 只在首次进入 ending 阶段时立即触发，避免 isRevealing 切换导致重复调用
      if (endTriggeredForRef.current !== gid) {
        endTriggeredForRef.current = gid;
        triggerEnd(gid);
      }
      endRetryRef.current = setInterval(() => { triggerEnd(gid); }, 5000);
    }
    // 离开 ending 阶段时重置
    if (gameState?.status !== 'ending') endTriggeredForRef.current = null;
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
      // 生成庆祝弹幕，均匀分散在 3-40 秒内，每条间隔 ≥3s
      const celebrations = generateCelebrationDanmaku(gameState?.championName || undefined);
      celebrations.forEach((item, i) => {
        const delay = 3000 + i * 4000 + Math.floor(Math.random() * 2000);
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

  // 角色阵亡自动切换旁观视角
  const wasEliminatedRef = useRef(false);
  useEffect(() => {
    const heroes = gameState?.heroes;
    const myId = user.heroId;
    if (!heroes || !myId) return;
    const myHero = heroes.find(h => h.heroId === myId);
    if (!myHero) return;
    if (myHero.isEliminated && !wasEliminatedRef.current) {
      wasEliminatedRef.current = true;
      // 切换到声望最高的存活英雄
      const alive = heroes.filter(h => !h.isEliminated).sort((a, b) => (b.reputation || 0) - (a.reputation || 0));
      if (alive.length > 0) {
        useWulinStore.setState({ viewingHeroId: alive[0].heroId });
      }
      setSpectatorToast('你的角色已阵亡，切换至旁观模式');
      setTimeout(() => setSpectatorToast(null), 4000);
    }
    // 新一局重置
    if (!myHero.isEliminated) wasEliminatedRef.current = false;
  }, [gameState?.heroes, user.heroId]);

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

    // 每批最多生成 2 条解说弹幕，间隔 ≥2s，防止刷屏
    let commentaryGenerated = 0;
    for (const e of newEvts) {
      if (commentaryGenerated >= 2) break;
      const commentary = generateCommentary(e, heroes);
      if (commentary) {
        commentaryGenerated++;
        const delay = (commentaryGenerated - 1) * 2000 + Math.floor(Math.random() * 800);
        const timer = setTimeout(() => addCommentaryDanmaku(commentary), delay);
        commentaryTimersRef.current.push(timer);
      }
    }
  }, [revealedEvents.length, isRevealing]);

  // 从服务端权威时间计算当前阶段已过秒数（多设备同步）
  function getPhaseElapsedSec(): number {
    const elapsed = gameState?.phaseElapsedMs;
    if (elapsed == null || elapsed < 0) return 0;
    return Math.floor(elapsed / 1000);
  }

  function clearAllTimers() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    if (roundTimerRef.current) { clearInterval(roundTimerRef.current); roundTimerRef.current = null; }
    if (artifactTimerRef.current) { clearInterval(artifactTimerRef.current); artifactTimerRef.current = null; }
    setCountdown(null);
    setRoundTimer(null);
    setArtifactTimer(null);
  }

  function startCountdown(gameId: string, initialSeconds?: number) {
    setCountdown(initialSeconds ?? 30);
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
            // 必须调用 triggerChooseStart（进入选择阶段），而非 triggerRound（解算）。
            // 此时 DB status 仍为 round_N，processRound 期望 choosing_N 会锁失败。
            triggerChooseStart(gameId, nextRound);
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
          setJoinToast('已候场，下一局自动入座，先观战吧');
          setTimeout(() => setJoinToast(null), 5000);
        }
      } else if (res.ok) {
        setJoinToast('入座成功！等待其他侠客加入…');
        setTimeout(() => setJoinToast(null), 3000);
        pollNow();
      } else {
        setErrorMsg(data.error || '入座失败');
        setIsQueued(false);
      }
    } catch {
      setErrorMsg('网络错误');
      setIsQueued(false);
    }
    setIsJoining(false);
  }, [user, pollNow]);

  const handleLeave = useCallback(async () => {
    setIsLeaving(true);
    try {
      const res = await fetch('/api/game/leave', { method: 'POST' });
      if (res.ok) { await pollNow(); } else {
        const data = await res.json();
        setErrorMsg(data.error || '退出失败');
      }
    } catch { setErrorMsg('网络错误'); }
    setIsLeaving(false);
  }, [pollNow]);

  const triggerStart = useCallback(async (gameId: string) => {
    if (isProcessingRef.current) return;
    setIsProcessing(true);
    const ac = new AbortController();
    const tm = setTimeout(() => ac.abort(), 30000);
    try {
      const res = await fetch('/api/engine/start', { method: 'POST', headers: ENGINE_HEADERS, signal: ac.signal });
      if (res.ok) {
        const data = await res.json();
        if (data.gameState) setGameState(data.gameState);
        else pollNow();
      } else {
        console.error('Start failed:', await res.text());
        pollNow();
      }
    } catch (e) { console.error('Start error:', e); pollNow(); }
    finally { clearTimeout(tm); setIsProcessing(false); }
  }, [setGameState, pollNow]);

  const triggerRound = useCallback(async (gameId: string, roundNumber: number) => {
    if (isProcessingRef.current) return;
    setIsProcessing(true);
    setGossip(GOSSIP_LINES[Math.floor(Math.random() * GOSSIP_LINES.length)]);
    setLoadingLine(LOADING_LINES[Math.floor(Math.random() * LOADING_LINES.length)]);
    const snapshot = useWulinStore.getState().gameState?.heroes || [];
    const ac = new AbortController();
    const tm = setTimeout(() => ac.abort(), 30000);
    try {
      const res = await fetch('/api/engine/round', {
        method: 'POST',
        headers: ENGINE_HEADERS,
        body: JSON.stringify({ gameId, roundNumber }),
        signal: ac.signal,
      });
      const data = await res.json();
      if (data.gameState) setGameState(data.gameState);
      else pollNow();
      // 优先用 API 返回的事件；若被节流（events=[]），回退到 gameState 缓存事件
      const evts = (data.events && data.events.length > 0)
        ? data.events
        : (data.gameState?.recentEvents || []);
      if (evts.length > 0) {
        setCurrentEvents(evts);
        setMyEventsCompleted(false);
        const viewId = useWulinStore.getState().viewingHeroId || useWulinStore.getState().user.heroId || null;
        startReveal(evts, snapshot, 35000, viewId, () => setMyEventsCompleted(true));
      }
    } catch (e) { console.error('Round error:', e); pollNow(); }
    finally { clearTimeout(tm); setIsProcessing(false); }
  }, [startReveal, setGameState, pollNow, setMyEventsCompleted]);

  const triggerChooseStart = useCallback(async (gameId: string, roundNumber: number) => {
    if (isProcessingRef.current) return;
    setIsProcessing(true);
    try {
      const res = await fetch('/api/engine/choose-start', {
        method: 'POST',
        headers: ENGINE_HEADERS,
        body: JSON.stringify({ gameId, roundNumber }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.gameState) setGameState(data.gameState);
        else pollNow();
      } else { pollNow(); }
    } catch (e) { console.error('ChooseStart error:', e); pollNow(); }
    finally { setIsProcessing(false); }
  }, [setGameState, pollNow]);

  const handleSubmitChoices = useCallback(async (encounterIds: string[]) => {
    if (!gameState?.gameId) return;
    const ok = await submitChoices(gameState.gameId, encounterIds);
    if (!ok) {
      setJoinToast('提交失败，请重试');
      setTimeout(() => setJoinToast(null), 3000);
    }
  }, [gameState?.gameId, submitChoices]);

  const triggerFinals = useCallback(async (gameId: string) => {
    if (isProcessingRef.current) return;
    setIsProcessing(true);
    setLoadingLine(LOADING_LINES[Math.floor(Math.random() * LOADING_LINES.length)]);
    const snapshot = useWulinStore.getState().gameState?.heroes || [];
    const ac = new AbortController();
    const tm = setTimeout(() => ac.abort(), 30000);
    try {
      const res = await fetch('/api/engine/finals', {
        method: 'POST',
        headers: ENGINE_HEADERS,
        body: JSON.stringify({ gameId }),
        signal: ac.signal,
      });
      const data = await res.json();
      if (data.gameState) setGameState(data.gameState);
      else pollNow();
      const evts = (data.events && data.events.length > 0)
        ? data.events
        : (data.gameState?.recentEvents || []);
      if (evts.length > 0) {
        setCurrentEvents(evts);
        setMyEventsCompleted(false);
        const viewId = useWulinStore.getState().viewingHeroId || useWulinStore.getState().user.heroId || null;
        startReveal(evts, snapshot, 10000, viewId, () => setMyEventsCompleted(true));
      }
    } catch (e) { console.error('Finals error:', e); pollNow(); }
    finally { clearTimeout(tm); setIsProcessing(false); }
  }, [startReveal, setGameState, pollNow, setMyEventsCompleted]);

  const triggerFinal = useCallback(async (gameId: string) => {
    if (isProcessingRef.current) return;
    setIsProcessing(true);
    const snapshot = useWulinStore.getState().gameState?.heroes || [];
    const ac = new AbortController();
    const tm = setTimeout(() => ac.abort(), 30000);
    try {
      const res = await fetch('/api/engine/final', {
        method: 'POST',
        headers: ENGINE_HEADERS,
        body: JSON.stringify({ gameId }),
        signal: ac.signal,
      });
      const data = await res.json();
      if (data.gameState) setGameState(data.gameState);
      else pollNow();
      const evts = (data.events && data.events.length > 0)
        ? data.events
        : (data.gameState?.recentEvents || []);
      if (evts.length > 0) {
        setCurrentEvents(evts);
        setMyEventsCompleted(false);
        const viewId = useWulinStore.getState().viewingHeroId || useWulinStore.getState().user.heroId || null;
        startReveal(evts, snapshot, 10000, viewId, () => setMyEventsCompleted(true));
      }
    } catch (e) { console.error('Final error:', e); pollNow(); }
    finally { clearTimeout(tm); setIsProcessing(false); }
  }, [startReveal, setGameState, pollNow, setMyEventsCompleted]);

  const triggerEnd = useCallback(async (gameId: string) => {
    if (isProcessingRef.current) return;
    setIsProcessing(true);
    try {
      const res = await fetch('/api/engine/end', {
        method: 'POST',
        headers: ENGINE_HEADERS,
        body: JSON.stringify({ gameId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.gameState) setGameState(data.gameState);
        else pollNow();
      } else { pollNow(); }
    } catch (e) { console.error('End error:', e); pollNow(); }
    setIsProcessing(false);
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
    status.startsWith('choosing_') || status.startsWith('resolving_') ||
    status === 'intro' || status === 'semifinals' || status === 'artifact_selection' || status === 'final' || status === 'ending';
  const isParticipant = user.isLoggedIn && gameState?.heroes?.some(h => h.heroId === user.heroId);

  // 初始加载骨架屏 — 数据到达前立即展示，避免白屏
  if (isInitLoading) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center bg-ink-deepest">
        <div className="text-center space-y-6">
          <div
            className="font-display text-8xl text-gold animate-breathe select-none"
            style={{ textShadow: '0 0 40px var(--gold-glow), 0 0 80px rgba(201,168,76,0.1)' }}
          >
            武
          </div>
          <div className="loading-jianghu">
            <span className="loading-jianghu-icon">⏳</span>
            <span>江湖载入中</span>
            <span className="loading-dots" />
          </div>
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
      <FullScreenEffect />
      <AchievementToast />

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
            onSubmitChoices={handleSubmitChoices}
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
        {spectatorToast && <div className="toast-wuxia">{spectatorToast}</div>}
      </main>

      <footer className="footer-wuxia">
        {isGameActive && (
          <div className="max-w-7xl mx-auto px-4 pt-2">
            <DanmakuInput />
          </div>
        )}
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between text-xs text-[--text-dim]">
          <span className="tabular-nums">
            {statusLabel(status)} · 第{gameState?.currentRound || 0}回合
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
