// ============================================================
// 战报生成：纯文本格式，用于分享
// ============================================================

import { GameState, GameEvent } from '@/lib/types';

export function generateBattleReport(state: GameState): string {
  const lines: string[] = [];
  const heroes = state.heroes || [];
  const events = state.recentEvents || [];

  lines.push('⚔️ AI 武林大会 · 战报 ⚔️');
  lines.push(`第 ${state.gameNumber} 届${state.theme ? ` · 「${state.theme}」` : ''}`);
  lines.push('');

  // 盟主
  if (state.championName) {
    lines.push(`🏆 武林盟主：${state.championName}`);
    lines.push('');
  }

  // 声望排行前 5
  const repRank = state.reputationRanking || [];
  if (repRank.length > 0) {
    lines.push('📊 声望榜：');
    const medals = ['🥇', '🥈', '🥉', '4.', '5.'];
    repRank.slice(0, 5).forEach((r, i) => {
      lines.push(`  ${medals[i]} ${r.heroName}（${r.faction}）${r.value}声望`);
    });
    lines.push('');
  }

  // 称号颁发
  const titleEvents = events.filter(e => e.eventType === 'title_award');
  if (titleEvents.length > 0) {
    lines.push('🏅 称号：');
    for (const evt of titleEvents) {
      lines.push(`  ${evt.narrative}`);
    }
    lines.push('');
  }

  // 名场面（高优先级事件）
  const highlights = events
    .filter(e => e.priority >= 5 && e.eventType !== 'title_award')
    .slice(0, 5);
  if (highlights.length > 0) {
    lines.push('✨ 名场面：');
    for (const evt of highlights) {
      lines.push(`  ${evt.narrative}`);
    }
    lines.push('');
  }

  lines.push('🎮 AI 武林大会 · SecondMe A2A 黑客松');
  return lines.join('\n');
}
