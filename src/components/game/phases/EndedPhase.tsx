'use client';

import { GameState, GameEvent } from '@/lib/types';
import { RankingPanel } from '@/components/game/RankingPanel';
import { ShareButton } from '@/components/game/ShareButton';
import { WulinWeekly } from '@/components/game/WulinWeekly';

interface EndedPhaseProps {
  gameState: GameState | null;
  events: Partial<GameEvent>[];
  isJoining: boolean;
  endedCountdown: number | null;
  skipNextGame: boolean;
  onJoin: () => void;
  onJoinImmediate: () => void;
  onSkipNextGame: (v: boolean) => void;
}

export function EndedPhase({
  gameState, events, isJoining, endedCountdown, skipNextGame,
  onJoin, onJoinImmediate, onSkipNextGame,
}: EndedPhaseProps) {
  return (
    <div className="py-8 md:py-12 phase-enter">
      <div className="text-center mb-8">
        {(gameState?.queueCount ?? 0) > 0 && (
          <p className="text-sm text-gold mb-2">当前候补 {gameState!.queueCount} 人</p>
        )}
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <button onClick={onJoinImmediate}
            disabled={isJoining} className="btn-gold text-lg px-10 py-3">
            {isJoining ? '加入中…' : '⚔️ 加入房间'}
          </button>
          {endedCountdown !== null && endedCountdown > 0 && (
            <span className="text-sm text-[--text-dim] font-mono tabular-nums">
              {skipNextGame ? '将观战下一局' : `${endedCountdown}s 后自动加入`}
            </span>
          )}
          {!skipNextGame ? (
            <button onClick={() => onSkipNextGame(true)} className="btn-ghost text-sm">👀 仅观战</button>
          ) : (
            <span className="text-xs text-[--text-dim] px-3 py-1.5 rounded-lg bg-ink-dark/80 border border-ink-light/20">
              👀 观战模式
            </span>
          )}
          <ShareButton />
        </div>
        <p className="text-xs text-[--text-dim] mt-3 tracking-wide">
          {skipNextGame ? '将以观众身份观看下一局' : '未满12人自动入座，已满则顺位等候，比赛已开始则先观战'}
        </p>
      </div>

      <div className="champion-banner mb-8">
        <div className="text-7xl mb-4 animate-crown-float">🏆</div>
        <h2 className="font-display text-3xl md:text-4xl font-bold text-gold mb-2 animate-glow-text tracking-wider">
          {gameState?.championName
            ? `「${gameState.championName}」傲立群雄之巅，荣膺武林盟主！`
            : '武林大会圆满落幕！'}
        </h2>
        {gameState?.gameNumber != null && gameState.gameNumber > 0 && (
          <p className="text-[--text-dim] text-sm tracking-wider">第 {gameState.gameNumber} 届武林大会</p>
        )}
      </div>

      {gameState?.battleStats && (
        <WulinWeekly gameState={gameState} battleStats={gameState.battleStats} />
      )}

      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <RankingPanel title="最终声望榜" icon="⚔️" entries={gameState?.reputationRanking || []} />
        {(() => {
          // 封神榜：盟主居首，然后声望榜前3 + 热搜榜前3 去重
          const repTop3 = (gameState?.reputationRanking || []).slice(0, 3);
          const hotTop3 = (gameState?.hotRanking || []).slice(0, 3);
          const championHero = gameState?.heroes.find(h => h.heroName === gameState?.championName);
          const championId = championHero?.heroId;

          const entries: typeof repTop3 = [];
          const seenIds = new Set<string>();

          // 盟主第一
          if (championId) {
            const champEntry = repTop3.find(e => e.heroId === championId)
              || hotTop3.find(e => e.heroId === championId);
            if (champEntry) {
              entries.push(champEntry);
              seenIds.add(championId);
            }
          }

          // 声望榜前3 + 热搜榜前3，去重
          for (const entry of [...repTop3, ...hotTop3]) {
            if (!seenIds.has(entry.heroId)) {
              seenIds.add(entry.heroId);
              entries.push(entry);
            }
          }

          const labels = ['🏆 盟主', '🥈', '🥉', '④', '⑤', '⑥'];
          return entries.length > 0 ? (
            <div className="card-wuxia p-4">
              <div className="flex items-center gap-2 mb-3">
                <span>📜</span>
                <h3 className="font-display font-bold text-sm tracking-wide brush-underline">封神榜</h3>
              </div>
              <div className="space-y-3 max-h-64 overflow-y-auto scrollbar-wuxia">
                {entries.map((entry, i) => {
                  const hero = gameState?.heroes.find(h => h.heroId === entry.heroId);
                  const bio = hero?.bio;
                  return (
                    <div key={entry.heroId} className="text-sm leading-relaxed">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span>{labels[i] || `${i + 1}`}</span>
                        <span className="font-display font-bold text-gold">{entry.heroName}</span>
                        <span className="text-[--text-dim] text-xs">· {entry.faction}</span>
                      </div>
                      {bio && (
                        <p className="text-[--text-secondary] text-xs leading-relaxed pl-6">{bio}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null;
        })()}
        <RankingPanel title="最终热搜榜" icon="🔥" entries={gameState?.hotRanking || []} />
      </div>

      {(gameState?.newAchievements?.length ?? 0) > 0 && (
        <div className="max-w-4xl mx-auto mb-6">
          <div className="card-wuxia p-4">
            <div className="flex items-center gap-2 mb-3">
              <span>🏅</span>
              <h3 className="font-display font-bold text-sm tracking-wide brush-underline">成就解锁</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {gameState!.newAchievements.map((a, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gold/5 border border-gold/20 animate-seal-stamp">
                  <span className="text-xl">{a.icon}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-gold truncate">{a.achievementName}</div>
                    <div className="text-[10px] text-[--text-dim] truncate">{a.heroName} · +{a.points}分</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {((gameState?.betWinners?.length ?? 0) > 0 || (gameState?.balanceRanking?.length ?? 0) > 0) && (
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {(gameState?.betWinners?.length ?? 0) > 0 && (
            <div className="card-wuxia p-4">
              <h3 className="font-display font-bold text-sm mb-3 text-gold tracking-wide">💰 押注赢家</h3>
              <div className="space-y-2">
                {gameState!.betWinners.map((w, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="min-w-0">
                      <span className="font-bold truncate block">{w.displayName}</span>
                      <span className="text-[--text-dim]">
                        押 {w.betHeroName} · {['🏆','🥈','🥉'][w.rank - 1]}第{w.rank}名
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 ml-2 whitespace-nowrap">
                      {w.multiplier && (
                        <span className="text-[10px] font-bold text-gold/70 bg-gold/10 px-1 py-0.5 rounded tabular-nums">×{w.multiplier}</span>
                      )}
                      <span className="text-gold font-mono tabular-nums">+{w.payout}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(gameState?.balanceRanking?.length ?? 0) > 0 && (
            <div className="card-wuxia p-4">
              <h3 className="font-display font-bold text-sm mb-3 text-gold tracking-wide">🏦 富豪榜</h3>
              <div className="space-y-2">
                {gameState!.balanceRanking.map((entry, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[--text-dim] w-4 text-right tabular-nums">{entry.rank}</span>
                      <span className="font-bold truncate">{entry.heroName}</span>
                      <span className="text-[--text-dim] text-[10px]">{entry.faction}</span>
                    </div>
                    <span className="text-gold font-mono whitespace-nowrap ml-2 tabular-nums">
                      {entry.balance.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
