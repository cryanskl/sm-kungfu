'use client';

import { useState } from 'react';
import { GameState, GameEvent, GameHeroSnapshot, RankEntry } from '@/lib/types';
import { HeroCard } from '@/components/game/HeroCard';
import { EventFeed } from '@/components/game/EventFeed';
import { RankingPanel } from '@/components/game/RankingPanel';
import { RelationshipGraph } from '@/components/game/RelationshipGraph';
import { FloatingText } from '@/components/game/FloatingText';
import { ChoosingPanel } from '@/components/game/ChoosingPanel';
import { InfluenceButton } from '@/components/game/InfluenceButton';
import { useWulinStore } from '@/stores/gameStore';

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
  onSubmitChoices: (encounterIds: string[]) => void;
}

export function ActiveGamePhase({
  gameState, status, heroes, events, repRanking, hotRanking,
  gossip, isProcessing, loadingLine, isRevealing, revealedEvents, roundTimer, onSkipReveal, onSubmitChoices,
}: ActiveGamePhaseProps) {
  const [showDetail, setShowDetail] = useState<string | null>(null);
  const liveHeroes = gameState?.heroes || [];
  const aliveCount = liveHeroes.filter(h => !h.isEliminated).length;

  const { viewingHeroId, setViewingHero, myEventsCompleted, user, chosenEncounterIds, influenceUsed, submitInfluence } = useWulinStore();

  // 当前用户的 heroId
  const myHeroId = user.heroId;
  // 旁观模式：玩家英雄已阵亡
  const isSpectator = myHeroId ? liveHeroes.some(h => h.heroId === myHeroId && h.isEliminated) : false;
  // 实际展示的视角 ID（null 表示自己 / 全局）
  const activeViewId = viewingHeroId || myHeroId;

  // 按视角过滤事件用于高亮显示
  const isEventRelated = (event: Partial<GameEvent>) => {
    if (!activeViewId) return true;
    return event.heroId === activeViewId || event.targetHeroId === activeViewId;
  };

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
        {/* 旁观模式横幅 */}
        {isSpectator && (
          <div className="text-center text-xs text-[--text-dim] bg-ink-deep/60 border border-ink-light/20 rounded px-3 py-1.5 mb-2">
            亡灵视角 · 观战中
          </div>
        )}
        {/* P1: 视角切换栏 */}
        <div className="flex items-center gap-1.5 mb-3 px-1 flex-wrap">
          <span className="text-[10px] text-[--text-dim] mr-1">视角:</span>
          {/* 自己视角（旁观者显示全局视角） */}
          <button
            onClick={() => setViewingHero(null)}
            className={`w-6 h-6 rounded-full border-2 transition-all text-[10px] flex items-center justify-center
              ${!viewingHeroId ? 'border-gold bg-gold/20 text-gold shadow-gold-glow' : 'border-ink-light/30 text-[--text-dim] hover:border-ink-light/60'}`}
            title={isSpectator ? '全局视角' : '我的视角'}
          >
            {isSpectator ? '全' : '我'}
          </button>
          {liveHeroes.filter(h => !h.isEliminated).map((hero) => {
            const isActive = viewingHeroId === hero.heroId;
            const isMe = hero.heroId === myHeroId;
            const canSwitch = isSpectator || myEventsCompleted || isMe || !myHeroId;
            return (
              <button
                key={hero.heroId}
                onClick={() => canSwitch && setViewingHero(hero.heroId)}
                disabled={!canSwitch}
                className={`w-6 h-6 rounded-full border-2 transition-all text-[10px] flex items-center justify-center
                  ${isActive ? 'border-gold bg-gold/20 text-gold shadow-gold-glow' : ''}
                  ${!isActive && canSwitch ? 'border-ink-light/30 text-[--text-dim] hover:border-ink-light/60' : ''}
                  ${!canSwitch ? 'border-ink-light/10 text-ink-light/20 cursor-not-allowed' : 'cursor-pointer'}`}
                title={`${hero.heroName}${!canSwitch ? ' (看完自己的事件后解锁)' : ''}`}
              >
                {hero.heroName.charAt(0)}
              </button>
            );
          })}
          {!isSpectator && myHeroId && !myEventsCompleted && isRevealing && (
            <span className="text-[10px] text-[--text-dim] ml-1">事件揭示中…</span>
          )}
          {!isSpectator && myHeroId && myEventsCompleted && (
            <span className="text-[10px] text-gold ml-1">可切换观战</span>
          )}
        </div>

        {status?.startsWith('choosing_') ? (
          <ChoosingPanel
            gameState={gameState!}
            onSubmit={onSubmitChoices}
            isSubmitted={chosenEncounterIds.length > 0}
          />
        ) : (
          <>
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
                  {activeViewId && viewingHeroId && (
                    <span className="text-[10px] text-gold font-normal">
                      — {liveHeroes.find(h => h.heroId === activeViewId)?.heroName || ''}视角
                    </span>
                  )}
                </h3>
                {activeViewId && activeViewId !== myHeroId && !status?.startsWith('choosing_') && (
                  <InfluenceButton
                    targetHeroId={activeViewId}
                    targetHeroName={liveHeroes.find(h => h.heroId === activeViewId)?.heroName || ''}
                    influenceUsed={influenceUsed}
                    onInfluence={submitInfluence}
                  />
                )}
              </div>
              <EventFeed
                events={events}
                highlightLatest={isRevealing || revealedEvents.length > 0}
                activeReveal={isRevealing}
                highlightHeroId={activeViewId || undefined}
              />
            </div>
          </>
        )}
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
