'use client';

import { GameHeroSnapshot } from '@/lib/types';
import { HeroCard } from '@/components/game/HeroCard';
import { BettingPanel } from '@/components/game/BettingPanel';

interface IntroPhaseProps {
  heroes: GameHeroSnapshot[];
  introTimer: number | null;
}

export function IntroPhase({ heroes, introTimer }: IntroPhaseProps) {
  return (
    <div className="py-8 phase-enter">
      <div className="text-center mb-8">
        <h2 className="font-display text-3xl font-bold text-gold mb-2 animate-glow-text tracking-widest">
          📜 开场点名
        </h2>
        <p className="text-[--text-secondary] text-sm">十二侠客登场亮相，即将开战</p>
        {introTimer !== null && introTimer > 0 && (
          <div className="mt-4 inline-flex items-center gap-2.5 phase-badge phase-countdown text-base">
            <span className="text-xl font-display font-bold tabular-nums">{introTimer}</span>
            <span className="text-xs opacity-80">秒后开战</span>
          </div>
        )}
        {introTimer === 0 && (
          <div className="mt-4 text-gold font-display font-bold animate-pulse text-lg">⚔️ 即将开战…</div>
        )}
      </div>
      <div className="max-w-2xl mx-auto mb-6">
        <BettingPanel />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-w-5xl mx-auto stagger-children mb-8">
        {heroes.map(hero => (
          <div key={hero.heroId}>
            <HeroCard hero={hero} />
          </div>
        ))}
      </div>
    </div>
  );
}
