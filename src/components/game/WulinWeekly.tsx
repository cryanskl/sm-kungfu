'use client';

import { BattleStats } from '@/lib/game/battle-stats';
import { GameState } from '@/lib/types';

interface WulinWeeklyProps {
  gameState: GameState;
  battleStats: BattleStats;
}

const ROUND_NAMES: Record<number, string> = {
  1: '第一回合', 2: '第二回合', 3: '第三回合',
  4: '第四回合', 5: '第五回合', 6: '半决赛', 7: '决赛', 8: '封神',
};

export function WulinWeekly({ gameState, battleStats }: WulinWeeklyProps) {
  const stats = battleStats;
  const repRank = gameState.reputationRanking || [];

  return (
    <div className="max-w-4xl mx-auto mb-6 space-y-4">
      {/* Header */}
      <div className="text-center">
        <h3 className="font-display text-xl font-bold text-gold tracking-wider brush-underline inline-block">
          武林周刊 · 第 {gameState.gameNumber} 期
        </h3>
        {gameState.theme && (
          <p className="text-xs text-[--text-dim] mt-1">「{gameState.theme}」</p>
        )}
      </div>

      {/* Round Summaries */}
      {stats.roundSummaries.length > 0 && (
        <div className="card-wuxia p-4">
          <h4 className="font-display font-bold text-sm mb-3 tracking-wide brush-underline">
            📖 各回合纪要
          </h4>
          <div className="space-y-2">
            {stats.roundSummaries.map(rs => (
              <div key={rs.round} className="text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-gold font-bold whitespace-nowrap">
                    {ROUND_NAMES[rs.round] || `R${rs.round}`}
                  </span>
                  <span className="text-[--text-dim]">
                    {rs.fightCount}战
                    {rs.eliminationCount > 0 && ` · ${rs.eliminationCount}淘汰`}
                  </span>
                </div>
                {rs.highlight && (
                  <p className="text-[--text-dim] pl-4 mt-0.5 line-clamp-2">{rs.highlight}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MVP Cards - 2x2 Grid */}
      <div className="grid grid-cols-2 gap-3">
        {stats.mostDamageDealt && (
          <MvpCard
            icon="⚔️"
            title="战狂"
            name={stats.mostDamageDealt.heroName}
            detail={`累计 ${stats.mostDamageDealt.totalDamage} 伤害`}
          />
        )}
        {stats.mostBetrayals && (
          <MvpCard
            icon="🗡️"
            title="阴谋家"
            name={stats.mostBetrayals.heroName}
            detail={`${stats.mostBetrayals.count} 次背叛`}
          />
        )}
        {stats.bestSurvivor && (
          <MvpCard
            icon="🛡️"
            title="铁人"
            name={stats.bestSurvivor.heroName}
            detail={`剩余 ${stats.bestSurvivor.remainingHp} HP`}
          />
        )}
        {stats.mostPopular && (
          <MvpCard
            icon="🔥"
            title="顶流"
            name={stats.mostPopular.heroName}
            detail={`${stats.mostPopular.hotValue} 热度`}
          />
        )}
      </div>

      {/* Elimination Timeline */}
      {stats.eliminationTimeline.length > 0 && (
        <div className="card-wuxia p-4">
          <h4 className="font-display font-bold text-sm mb-3 tracking-wide brush-underline">
            💀 淘汰时间线
          </h4>
          <div className="flex flex-wrap gap-2">
            {stats.eliminationTimeline.map((e, i) => (
              <span
                key={i}
                className="text-xs bg-ink-dark/80 border border-ink-light/20 px-2 py-1 rounded"
              >
                R{e.round} <span className="text-red-400">{e.heroName}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Alliance & Betrayal Highlights */}
      {(stats.allianceHighlights.length > 0 || stats.betrayalHighlights.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {stats.allianceHighlights.length > 0 && (
            <div className="card-wuxia p-4">
              <h4 className="font-display font-bold text-sm mb-2 tracking-wide">🤝 结盟录</h4>
              <div className="space-y-1">
                {stats.allianceHighlights.slice(0, 5).map((a, i) => (
                  <p key={i} className="text-xs text-[--text-dim]">
                    R{a.round}: <span className="text-cyan-400">{a.heroName}</span> & <span className="text-cyan-400">{a.allyName}</span>
                  </p>
                ))}
              </div>
            </div>
          )}
          {stats.betrayalHighlights.length > 0 && (
            <div className="card-wuxia p-4">
              <h4 className="font-display font-bold text-sm mb-2 tracking-wide">🗡️ 背叛录</h4>
              <div className="space-y-1">
                {stats.betrayalHighlights.slice(0, 5).map((b, i) => (
                  <p key={i} className="text-xs text-[--text-dim]">
                    R{b.round}: <span className="text-red-400">{b.heroName}</span> → {b.targetName}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Final Rankings (Top 8) */}
      {repRank.length > 0 && (
        <div className="card-wuxia p-4">
          <h4 className="font-display font-bold text-sm mb-3 tracking-wide brush-underline">
            📊 最终声望榜
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {repRank.slice(0, 8).map((r, i) => {
              const medals = ['🥇', '🥈', '🥉'];
              return (
                <div key={r.heroId} className="flex items-center gap-1.5 text-xs">
                  <span className="w-5 text-right">{i < 3 ? medals[i] : `${i + 1}.`}</span>
                  <span className="font-bold truncate">{r.heroName}</span>
                  <span className="text-[--text-dim] tabular-nums ml-auto">{r.value}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stats Footer */}
      <div className="text-center text-xs text-[--text-dim] tracking-wide">
        全场 {stats.totalFights} 场战斗 · {stats.totalBetrayals} 次背叛 · {stats.totalAlliances} 次结盟 · {stats.totalEliminations} 人淘汰
      </div>
    </div>
  );
}

function MvpCard({ icon, title, name, detail }: { icon: string; title: string; name: string; detail: string }) {
  return (
    <div className="card-wuxia p-3 text-center">
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-xs text-[--text-dim] mb-1">{title}</div>
      <div className="font-display font-bold text-sm text-gold truncate">{name}</div>
      <div className="text-xs text-[--text-dim] mt-0.5">{detail}</div>
    </div>
  );
}
