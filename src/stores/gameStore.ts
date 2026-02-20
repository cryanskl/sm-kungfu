import { create } from 'zustand';
import { GameState, GameEvent, DanmakuItem } from '@/lib/types';
import { VIEW_SWITCH_COOLDOWN } from '@/lib/game/constants';

// ETag 缓存：避免无变化时重新解析和更新 state
let lastEtag: string | null = null;

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

  // 前端播放状态
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

  // P5: 交互式回合选择
  chosenEncounterIds: string[];
  influenceUsed: boolean;
  submitChoices: (gameId: string, encounterIds: string[]) => Promise<boolean>;
  submitInfluence: (targetHeroId: string, effectType: 'buff' | 'debuff') => Promise<boolean>;
  resetChoices: () => void;
}

export const useWulinStore = create<WulinStore>((set, get) => ({
  // 用户
  user: { userId: null, heroId: null, hero: null, isLoggedIn: false },
  setUser: (user) => set({ user }),

  // 游戏状态
  gameState: null,
  setGameState: (gameState) => {
    const prev = get().gameState;
    const updates: Partial<WulinStore> = { gameState };
    // Reset choices when leaving choosing_* phase
    if (
      prev?.status?.startsWith('choosing_') &&
      !gameState.status?.startsWith('choosing_')
    ) {
      updates.chosenEncounterIds = [];
      updates.influenceUsed = false;
    }
    set(updates as any);
  },

  // 轮询（带 ETag 条件请求，304 时跳过解析和状态更新）
  isPolling: false,
  startPolling: async () => {
    if (get().isPolling) return;
    set({ isPolling: true });

    const fetchState = async () => {
      const headers: HeadersInit = lastEtag ? { 'If-None-Match': lastEtag } : {};
      const res = await fetch('/api/game/state', { headers });
      if (res.status === 304) return; // 无变化，跳过
      if (res.ok) {
        lastEtag = res.headers.get('etag');
        const data = await res.json();
        get().setGameState(data);
      }
    };

    // 首次立即拉取并等待结果，消除白屏
    try { await fetchState(); } catch { /* ignore */ }

    // 智能轮询：根据游戏阶段调整间隔
    const getInterval = () => {
      const status = get().gameState?.status;
      if (!status || status === 'waiting' || status === 'ended') return 8000;
      if (status === 'countdown' || status === 'ending') return 5000;
      return 3000; // 战斗阶段保持 3s
    };

    const poll = async () => {
      if (!get().isPolling) return;
      try { await fetchState(); } catch { /* ignore */ }
      if (get().isPolling) {
        setTimeout(poll, getInterval());
      }
    };
    setTimeout(poll, getInterval());
  },
  stopPolling: () => set({ isPolling: false }),
  pollNow: async () => {
    try {
      // pollNow 强制跳过 ETag 以获取最新数据
      const res = await fetch('/api/game/state');
      if (res.ok) {
        lastEtag = res.headers.get('etag');
        const data = await res.json();
        get().setGameState(data);
      }
    } catch { /* ignore */ }
  },

  // 前端播放
  currentEvents: [],
  setCurrentEvents: (currentEvents) => set({ currentEvents }),

  // P1: 视角系统
  viewingHeroId: null,
  setViewingHero: (heroId) => {
    const now = Date.now();
    const last = get().lastViewSwitch;
    if (now - last < VIEW_SWITCH_COOLDOWN) return; // 500ms 防抖
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

  // P5: 交互式回合选择
  chosenEncounterIds: [],
  influenceUsed: false,
  submitChoices: async (gameId: string, encounterIds: string[]) => {
    try {
      const res = await fetch('/api/game/choose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, encounterIds }),
      });
      if (res.ok) {
        set({ chosenEncounterIds: encounterIds });
        return true;
      }
      return false;
    } catch (e) {
      console.error('submitChoices failed:', e);
      return false;
    }
  },
  submitInfluence: async (targetHeroId: string, effectType: 'buff' | 'debuff') => {
    try {
      const res = await fetch('/api/audience/influence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetHeroId, effectType }),
      });
      if (res.ok) {
        set({ influenceUsed: true });
        return true;
      }
      return false;
    } catch (e) {
      console.error('submitInfluence failed:', e);
      return false;
    }
  },
  resetChoices: () => set({ chosenEncounterIds: [] }),
}));
