// ============================================================
// 音效系统：Web Audio API 合成，无需加载音频文件
// ============================================================

type SoundKey = 'intro_drums' | 'fight' | 'betray' | 'eliminated' | 'finals' | 'champion' | 'coin';

class SoundManager {
  private ctx: AudioContext | null = null;
  private _muted = false;

  get muted() { return this._muted; }
  set muted(v: boolean) { this._muted = v; }

  private getCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return this.ctx;
  }

  play(key: SoundKey) {
    if (this._muted) return;
    const ctx = this.getCtx();
    if (!ctx) return;

    try {
      // Resume on user interaction requirement
      if (ctx.state === 'suspended') ctx.resume();
      SYNTHS[key]?.(ctx);
    } catch {
      // Silently ignore autoplay restrictions
    }
  }
}

// --- Synthesizers ---

function playTone(ctx: AudioContext, freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.15) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

const SYNTHS: Record<SoundKey, (ctx: AudioContext) => void> = {
  intro_drums: (ctx) => {
    // Taiko-like drums: low rumble
    playTone(ctx, 80, 0.4, 'sine', 0.3);
    setTimeout(() => playTone(ctx, 90, 0.3, 'sine', 0.25), 200);
    setTimeout(() => playTone(ctx, 100, 0.5, 'sine', 0.35), 500);
  },

  fight: (ctx) => {
    // Sword clash: high metallic ping
    playTone(ctx, 800, 0.15, 'sawtooth', 0.1);
    playTone(ctx, 1200, 0.1, 'square', 0.08);
  },

  betray: (ctx) => {
    // Ominous descending tone
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.5);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  },

  eliminated: (ctx) => {
    // Falling tone
    playTone(ctx, 400, 0.3, 'triangle', 0.15);
    setTimeout(() => playTone(ctx, 200, 0.4, 'triangle', 0.1), 150);
  },

  finals: (ctx) => {
    // Ascending fanfare
    playTone(ctx, 440, 0.2, 'square', 0.1);
    setTimeout(() => playTone(ctx, 554, 0.2, 'square', 0.1), 150);
    setTimeout(() => playTone(ctx, 660, 0.3, 'square', 0.12), 300);
  },

  champion: (ctx) => {
    // Victory fanfare
    [440, 554, 660, 880].forEach((f, i) => {
      setTimeout(() => playTone(ctx, f, 0.3, 'sine', 0.15), i * 200);
    });
  },

  coin: (ctx) => {
    // Coin drop
    playTone(ctx, 1400, 0.08, 'sine', 0.1);
    setTimeout(() => playTone(ctx, 1800, 0.1, 'sine', 0.08), 60);
  },
};

// Singleton
export const soundManager = new SoundManager();
export type { SoundKey };
