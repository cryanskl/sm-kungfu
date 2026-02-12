// ============================================================
// 动态 BGM：基于 Web Audio API 的中国五声音阶合成
// ============================================================

type BgmPhase = 'silent' | 'intro' | 'early_round' | 'late_round' | 'finals' | 'ending';

// 中国五声音阶: 宫(C) 商(D) 角(E) 徵(G) 羽(A)
const PENTATONIC = [262, 294, 330, 392, 440];
const PENTATONIC_HIGH = [523, 587, 659, 784, 880];

interface PhaseConfig {
  tempo: number;       // BPM
  wave: OscillatorType;
  notes: number[];
  gain: number;
  staccato: boolean;   // short notes vs sustained
}

const PHASE_CONFIGS: Record<Exclude<BgmPhase, 'silent'>, PhaseConfig> = {
  intro: {
    tempo: 60, wave: 'sine', notes: PENTATONIC, gain: 0.10, staccato: false,
  },
  early_round: {
    tempo: 120, wave: 'triangle', notes: PENTATONIC, gain: 0.12, staccato: false,
  },
  late_round: {
    tempo: 170, wave: 'triangle', notes: PENTATONIC_HIGH, gain: 0.12, staccato: true,
  },
  finals: {
    tempo: 210, wave: 'sawtooth', notes: PENTATONIC_HIGH, gain: 0.10, staccato: true,
  },
  ending: {
    tempo: 50, wave: 'sine', notes: [...PENTATONIC, ...PENTATONIC_HIGH], gain: 0.10, staccato: false,
  },
};

function statusToPhase(status: string): BgmPhase {
  if (!status || status === 'waiting' || status === 'ended') return 'silent';
  if (status === 'countdown' || status === 'intro') return 'intro';
  if (status === 'ending') return 'ending';
  if (status === 'semifinals' || status === 'final' || status === 'artifact_selection') return 'finals';
  // round_1..3 → early, round_4..5 → late
  if (status.startsWith('round_')) {
    const n = parseInt(status.split('_')[1]);
    return n >= 4 ? 'late_round' : 'early_round';
  }
  // processing_N statuses: keep whatever current phase is (don't change)
  if (status.startsWith('processing_')) return 'silent'; // handled specially
  return 'silent';
}

class BgmManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private currentPhase: BgmPhase = 'silent';
  private loopTimer: ReturnType<typeof setTimeout> | null = null;
  private noteIndex = 0;
  private _muted = false;
  private destroyed = false;

  private ensureContext(): AudioContext | null {
    if (this.destroyed) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this._muted ? 0 : 1;
        this.masterGain.connect(this.ctx.destination);
      } catch {
        return null;
      }
    }
    return this.ctx;
  }

  get muted() { return this._muted; }
  set muted(v: boolean) {
    this._muted = v;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.linearRampToValueAtTime(
        v ? 0 : 1, this.ctx.currentTime + 0.3
      );
    }
  }

  setPhase(gameStatus: string) {
    // processing_N: don't interrupt current phase
    if (gameStatus.startsWith('processing_')) return;

    const phase = statusToPhase(gameStatus);
    if (phase === this.currentPhase) return;

    this.stopLoop();
    this.currentPhase = phase;

    if (phase === 'silent') return;

    const ctx = this.ensureContext();
    if (!ctx) return;
    // Resume suspended context (browser autoplay policy)
    if (ctx.state === 'suspended') ctx.resume();

    this.noteIndex = 0;
    this.scheduleNote();
  }

  private scheduleNote() {
    if (this.currentPhase === 'silent' || this.destroyed) return;
    const config = PHASE_CONFIGS[this.currentPhase];
    if (!config) return;

    const ctx = this.ctx;
    const master = this.masterGain;
    if (!ctx || !master) return;

    const intervalMs = (60 / config.tempo) * 1000;
    const note = config.notes[this.noteIndex % config.notes.length];
    this.noteIndex++;

    // Create oscillator for this note
    const osc = ctx.createOscillator();
    const noteGain = ctx.createGain();
    osc.type = config.wave;
    osc.frequency.value = note;
    noteGain.gain.value = config.gain;

    osc.connect(noteGain);
    noteGain.connect(master);

    const now = ctx.currentTime;
    const duration = config.staccato ? intervalMs / 2000 : intervalMs / 1200;
    osc.start(now);
    // Fade out
    noteGain.gain.linearRampToValueAtTime(0, now + duration);
    osc.stop(now + duration + 0.05);

    this.loopTimer = setTimeout(() => this.scheduleNote(), intervalMs);
  }

  private stopLoop() {
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
  }

  destroy() {
    this.destroyed = true;
    this.stopLoop();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
      this.masterGain = null;
    }
  }
}

export const bgmManager = new BgmManager();
