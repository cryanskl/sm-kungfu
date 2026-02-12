'use client';

import { useState } from 'react';
import { GameState, GameEvent, GameHeroSnapshot, RankEntry } from '@/lib/types';
import { HeroCard } from '@/components/game/HeroCard';
import { EventFeed } from '@/components/game/EventFeed';
import { RankingPanel } from '@/components/game/RankingPanel';
import { RelationshipGraph } from '@/components/game/RelationshipGraph';
import { FloatingText } from '@/components/game/FloatingText';

interface ActiveGamePhaseProps {
  gameState: GameState | null;
  status: string;
  heroes: GameHeroSnapshot[];
  events: Partial<GameEvent>[];
  repRanking: RankEntry[];
  hotRanking: RankEntry[];
  gossip: string;
  isProcessing: boolean;
  loadingLine: string;
  isRevealing: boolean;
  revealedEvents: Partial<GameEvent>[];
  roundTimer: number | null;
  onSkipReveal: () => void;
}

export function ActiveGamePhase({
  gameState, status, heroes, events, repRanking, hotRanking,
  gossip, isProcessing, loadingLine, isRevealing, revealedEvents, roundTimer, onSkipReveal,
}: ActiveGamePhaseProps) {
  const [showDetail, setShowDetail] = useState<string | null>(null);
  const liveHeroes = gameState?.heroes || [];
  const aliveCount = liveHeroes.filter(h => !h.isEliminated).length;

  return (
    <div className="grid grid-cols-12 gap-4 lg:gap-6 phase-enter">
      {/* Left: Heroes — last on mobile */}
      <div className="col-span-12 lg:col-span-3 order-3 lg:order-1 flex flex-col">
        <RelationshipGraph />
        <h3 className="font-display font-bold text-sm text-[--text-dim] mb-2 mt-4 tracking-wider">
          ⚔️ 侠客 <span className="text-gold tabular-nums">({aliveCount}存活)</span>
          <span className="text-[10px] text-[--text-dim] font-normal ml-1 opacity-60">血量↓</span>
        </h3>
        <div className="space-y-1.5 flex-1 min-h-0 overflow-y-auto pr-1 scroll-fade">
          {liveHeroes
            .slice()
            .sort((a, b) => {
              if (a.isEliminated !== b.isEliminated) return a.isEliminated ? 1 : -1;
              return (b.hp || 0) - (a.hp || 0);
            })
            .map((hero, idx) => {
              const hpRank = hero.isEliminated ? undefined : idx + 1;
              return (
                <div key={hero.heroId} onClick={() => setShowDetail(
                  showDetail === hero.heroId ? null : hero.heroId
                )} className="cursor-pointer">
                  {showDetail === hero.heroId ? <HeroCard hero={hero} rank={hpRank} /> : <HeroCard hero={hero} compact rank={hpRank} />}
                </div>
              );
            })}
        </div>
      </div>

      {/* Center: Event Feed — first on mobile */}
      <div className="col-span-12 lg:col-span-5 order-1 lg:order-2 flex flex-col">
        {(() => {
          // Loading indicator: show during API processing OR when waiting between rounds (after reveal, timer counting down)
          const isWaitingForNextRound = !isProcessing && !isRevealing && roundTimer !== null && roundTimer > 0;
          const showLoading = (isProcessing && !isRevealing) || isWaitingForNextRound;
          return (
            <>
              {showLoading && (
                <div className="loading-jianghu mb-3">
                  <span className="loading-jianghu-icon">⏳</span>
                  <span>{isWaitingForNextRound ? '下一回合即将开始' : loadingLine}</span>
                  <span className="loading-dots" />
                </div>
              )}
              {gossip && !showLoading && !isRevealing && (
                <div className="gossip-line mb-3">💬 江湖传闻：{gossip}</div>
              )}
            </>
          );
        })()}
        <div className="card-wuxia p-4 flex-1 relative overflow-hidden">
          <FloatingText overrideEvents={isRevealing ? revealedEvents : undefined} />
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-bold text-sm tracking-wider flex items-center gap-2">
              <span>📜</span> 江湖快报
            </h3>
            {/* skip button removed */}
          </div>
          <EventFeed events={events} highlightLatest={isRevealing || revealedEvents.length > 0} activeReveal={isRevealing} />
        </div>
      </div>

      {/* Right: Rankings */}
      <div className="col-span-12 lg:col-span-4 order-2 lg:order-3 flex flex-col gap-4">
        <div className="flex-1 min-h-0">
          <RankingPanel title="声望榜" icon="⚔️" entries={repRanking} highlight={status === 'semifinals' ? 4 : 3} />
        </div>
        <div className="flex-1 min-h-0">
          <RankingPanel title="热搜榜" icon="🔥" entries={hotRanking} highlight={status === 'semifinals' ? 4 : 3} />
        </div>
      </div>
    </div>
  );
}
