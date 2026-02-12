import { create } from 'zustand';
import { GameState, GameEvent, DanmakuItem } from '@/lib/types';

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

interface WulinStore {
  // 用户
  user: UserState;
  setUser: (user: UserState) => void;

  // 游戏状态
  gameState: GameState | null;
  setGameState: (state: GameState) => void;

  // 轮询
  isPolling: boolean;
  startPolling: () => void;
  stopPolling: () => void;
  pollNow: () => Promise<void>;

  // 前端播放状态
  displayPhase: 'idle' | 'director' | 'decision' | 'resolution' | 'update';
  setDisplayPhase: (phase: WulinStore['displayPhase']) => void;
  currentEvents: GameEvent[];
  setCurrentEvents: (events: GameEvent[]) => void;

  // P2: 押注（支持多选）
  audienceBets: AudienceBet[];
  addAudienceBet: (bet: AudienceBet) => void;
  clearAudienceBets: () => void;
  // P2: 弹幕（本地即时显示）
  localDanmaku: DanmakuItem[];
  addLocalDanmaku: (item: DanmakuItem) => void;
  // P2: 音效
  isMuted: boolean;
  toggleMute: () => void;
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
  startPolling: () => {
    if (get().isPolling) return;
    set({ isPolling: true });

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
        setTimeout(poll, 3000);
      }
    };
    poll();
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

  // 前端播放
  displayPhase: 'idle',
  setDisplayPhase: (displayPhase) => set({ displayPhase }),
  currentEvents: [],
  setCurrentEvents: (currentEvents) => set({ currentEvents }),

  // P2: 押注
  audienceBets: [],
  addAudienceBet: (bet) => set((s) => ({ audienceBets: [...s.audienceBets, bet] })),
  clearAudienceBets: () => set({ audienceBets: [] }),
  // P2: 弹幕
  localDanmaku: [],
  addLocalDanmaku: (item) => set((s) => ({
    localDanmaku: [...s.localDanmaku.slice(-49), item],
  })),
  // P2: 音效
  isMuted: typeof window !== 'undefined' ? localStorage.getItem('wulin_muted') === '1' : false,
  toggleMute: () => set((s) => {
    const next = !s.isMuted;
    if (typeof window !== 'undefined') localStorage.setItem('wulin_muted', next ? '1' : '0');
    return { isMuted: next };
  }),
}));
