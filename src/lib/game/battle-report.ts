// ============================================================
// 战报生成：纯文本格式，用于分享
// ============================================================

import { GameState, GameEvent } from '@/lib/types';

export function generateBattleReport(state: GameState): string {
  const lines: string[] = [];
  const heroes = state.heroes || [];
  const events = state.recentEvents || [];
  const stats = state.battleStats;

  lines.push('⚔️ AI 武林大会 · 武林周刊 ⚔️');
  lines.push(`第 ${state.gameNumber} 届${state.theme ? ` · 「${state.theme}」` : ''}`);
  lines.push('');

  // 盟主
  if (state.championName) {
    lines.push(`🏆 武林盟主：${state.championName}`);
    lines.push('');
  }

  // Round summaries (if battleStats available)
  if (stats?.roundSummaries && stats.roundSummaries.length > 0) {
    lines.push('📖 各回合纪要：');
    const roundNames: Record<number, string> = {
      1: '第一回合', 2: '第二回合', 3: '第三回合',
      4: '第四回合', 5: '第五回合', 6: '半决赛', 7: '决赛',
    };
    for (const rs of stats.roundSummaries) {
      const name = roundNames[rs.round] || `R${rs.round}`;
      const parts = [`${rs.fightCount}战`];
      if (rs.eliminationCount > 0) parts.push(`${rs.eliminationCount}淘汰`);
      lines.push(`  ${name}：${parts.join(' / ')}`);
      if (rs.highlight) lines.push(`    └ ${rs.highlight}`);
    }
    lines.push('');
  }

  // MVP Awards
  if (stats) {
    lines.push('🏅 MVP 颁奖：');
    if (stats.mostDamageDealt) {
      lines.push(`  ⚔️ 战狂：${stats.mostDamageDealt.heroName}（累计${stats.mostDamageDealt.totalDamage}伤害）`);
    }
    if (stats.mostBetrayals) {
      lines.push(`  🗡️ 阴谋家：${stats.mostBetrayals.heroName}（${stats.mostBetrayals.count}次背叛）`);
    }
    if (stats.bestSurvivor) {
      lines.push(`  🛡️ 铁人：${stats.bestSurvivor.heroName}（剩余${stats.bestSurvivor.remainingHp}HP）`);
    }
    if (stats.mostPopular) {
      lines.push(`  🔥 顶流：${stats.mostPopular.heroName}（${stats.mostPopular.hotValue}热度）`);
    }
    lines.push('');
  }

  // Elimination timeline
  if (stats?.eliminationTimeline && stats.eliminationTimeline.length > 0) {
    lines.push('💀 淘汰时间线：');
    for (const e of stats.eliminationTimeline) {
      lines.push(`  R${e.round} ${e.heroName}`);
    }
    lines.push('');
  }

  // 声望排行前 8
  const repRank = state.reputationRanking || [];
  if (repRank.length > 0) {
    lines.push('📊 最终声望榜：');
    const medals = ['🥇', '🥈', '🥉'];
    repRank.slice(0, 8).forEach((r, i) => {
      const prefix = i < 3 ? medals[i] : `${i + 1}.`;
      lines.push(`  ${prefix} ${r.heroName}（${r.faction}）${r.value}声望`);
    });
    lines.push('');
  }

  // Betting results
  const betWinners = state.betWinners || [];
  if (betWinners.length > 0) {
    lines.push('💰 押注赢家：');
    for (const w of betWinners.slice(0, 5)) {
      lines.push(`  ${w.displayName} 押${w.betHeroName} → +${w.payout}`);
    }
    lines.push('');
  }

  // Stats footer
  if (stats) {
    lines.push(`📈 全场统计：${stats.totalFights}场战斗 · ${stats.totalBetrayals}次背叛 · ${stats.totalAlliances}次结盟 · ${stats.totalEliminations}人淘汰`);
    lines.push('');
  }

  lines.push('🎮 AI 武林大会 · SecondMe A2A 黑客松');
  return lines.join('\n');
}
