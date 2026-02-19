import { create } from 'zustand';
import { GameState, GameEvent, DanmakuItem } from '@/lib/types';
import { VIEW_SWITCH_COOLDOWN } from '@/lib/game/constants';

interface UserState {
  userId: string | null;
  heroId: string | null;
  hero: any | null;
  isLoggedIn: boolean;
}

interface AudienceBet {
  heroId: string;
  heroName: string;
  amount: number;
}

interface AudienceArtifact {
  artifactId: string;
  heroId: string;
  amount: number;
}

interface WulinStore {
  // 用户
  user: UserState;
  setUser: (user: UserState) => void;

  // 游戏状态
  gameState: GameState | null;
  setGameState: (state: GameState) => void;

  // 轮询
  isPolling: boolean;
  startPolling: () => Promise<void>;
  stopPolling: () => void;
  pollNow: () => Promise<void>;

  // SSE 实时推送
  eventSource: EventSource | null;
  startSSE: () => void;
  stopSSE: () => void;

  // 前端播放状态
  displayPhase: 'idle' | 'director' | 'decision' | 'resolution' | 'update';
  setDisplayPhase: (phase: WulinStore['displayPhase']) => void;
  currentEvents: GameEvent[];
  setCurrentEvents: (events: GameEvent[]) => void;

  // P1: 视角系统
  viewingHeroId: string | null;
  setViewingHero: (heroId: string | null) => void;
  lastViewSwitch: number;
  myEventsCompleted: boolean;
  setMyEventsCompleted: (v: boolean) => void;

  // P2: 押注（支持多选）
  audienceBets: AudienceBet[];
  addAudienceBet: (bet: AudienceBet) => void;
  clearAudienceBets: () => void;
  // P2: 弹幕（本地即时显示）
  localDanmaku: DanmakuItem[];
  addLocalDanmaku: (item: DanmakuItem) => void;
  addCommentaryDanmaku: (item: DanmakuItem) => void;
  lastCommentaryTime: number;
  clearLocalDanmaku: () => void;
  // P2: 音效
  isMuted: boolean;
  toggleMute: () => void;
  // 神兵助战
  audienceArtifact: AudienceArtifact | null;
  setAudienceArtifact: (artifact: AudienceArtifact) => void;
  clearAudienceArtifact: () => void;
}

export const useWulinStore = create<WulinStore>((set, get) => ({
  // 用户
  user: { userId: null, heroId: null, hero: null, isLoggedIn: false },
  setUser: (user) => set({ user }),

  // 游戏状态
  gameState: null,
  setGameState: (gameState) => set({ gameState }),

  // 轮询
  isPolling: false,
  startPolling: async () => {
    if (get().isPolling) return;
    set({ isPolling: true });

    // 首次立即拉取并等待结果，消除白屏
    try {
      const res = await fetch('/api/game/state');
      if (res.ok) {
        const data = await res.json();
        set({ gameState: data });
      }
    } catch { /* ignore */ }

    // 智能轮询：根据游戏阶段调整间隔
    const getInterval = () => {
      const status = get().gameState?.status;
      if (!status || status === 'waiting' || status === 'ended') return 8000;
      if (status === 'countdown' || status === 'ending') return 5000;
      return 3000; // 战斗阶段保持 3s
    };

    const poll = async () => {
      if (!get().isPolling) return;
      try {
        const res = await fetch('/api/game/state');
        if (res.ok) {
          const data = await res.json();
          set({ gameState: data });
        }
      } catch { /* ignore */ }

      if (get().isPolling) {
        setTimeout(poll, getInterval());
      }
    };
    setTimeout(poll, getInterval());
  },
  stopPolling: () => set({ isPolling: false }),
  pollNow: async () => {
    try {
      const res = await fetch('/api/game/state');
      if (res.ok) {
        const data = await res.json();
        set({ gameState: data });
      }
    } catch { /* ignore */ }
  },

  // SSE 实时推送
  eventSource: null,
  startSSE: () => {
    if (get().eventSource) return;
    const es = new EventSource('/api/game/stream');
    let firstMessage = true;
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        set({ gameState: data });
        // SSE 连接成功，停止轮询
        if (firstMessage) {
          firstMessage = false;
          get().stopPolling();
        }
      } catch { /* ignore parse errors */ }
    };
    es.onerror = () => {
      es.close();
      set({ eventSource: null });
      // 降级到轮询
      get().startPolling();
    };
    set({ eventSource: es });
  },
  stopSSE: () => {
    const es = get().eventSource;
    if (es) {
      es.close();
      set({ eventSource: null });
    }
  },

  // 前端播放
  displayPhase: 'idle',
  setDisplayPhase: (displayPhase) => set({ displayPhase }),
  currentEvents: [],
  setCurrentEvents: (currentEvents) => set({ currentEvents }),

  // P1: 视角系统
  viewingHeroId: null,
  setViewingHero: (heroId) => {
    const now = Date.now();
    const last = get().lastViewSwitch;
    if (now - last < VIEW_SWITCH_COOLDOWN) return; // 3 秒防抖
    set({ viewingHeroId: heroId, lastViewSwitch: now });
  },
  lastViewSwitch: 0,
  myEventsCompleted: false,
  setMyEventsCompleted: (v) => set({ myEventsCompleted: v }),

  // P2: 押注
  audienceBets: [],
  addAudienceBet: (bet) => set((s) => ({ audienceBets: [...s.audienceBets, bet] })),
  clearAudienceBets: () => set({ audienceBets: [] }),
  // P2: 弹幕
  localDanmaku: [],
  addLocalDanmaku: (item) => set((s) => ({
    localDanmaku: [...s.localDanmaku.slice(-49), item],
  })),
  addCommentaryDanmaku: (item) => {
    const now = Date.now();
    const state = get();
    if (now - state.lastCommentaryTime < 2000) return; // 2s rate limit — strict danmaku cap
    set({
      localDanmaku: [...state.localDanmaku.slice(-49), item],
      lastCommentaryTime: now,
    });
  },
  lastCommentaryTime: 0,
  clearLocalDanmaku: () => set({ localDanmaku: [] }),
  // P2: 音效
  isMuted: typeof window !== 'undefined' ? localStorage.getItem('wulin_muted') === '1' : false,
  toggleMute: () => set((s) => {
    const next = !s.isMuted;
    if (typeof window !== 'undefined') localStorage.setItem('wulin_muted', next ? '1' : '0');
    return { isMuted: next };
  }),
  // 神兵助战
  audienceArtifact: null,
  setAudienceArtifact: (artifact) => set({ audienceArtifact: artifact }),
  clearAudienceArtifact: () => set({ audienceArtifact: null }),
}));
