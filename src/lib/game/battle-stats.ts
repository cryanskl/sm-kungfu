// ============================================================
// 武林周刊 · 战斗统计
// ============================================================

export interface BattleStats {
  totalFights: number;
  totalBetrayals: number;
  totalAlliances: number;
  totalEliminations: number;

  // MVP awards
  mostDamageDealt: { heroName: string; totalDamage: number } | null;
  mostBetrayals: { heroName: string; count: number } | null;
  bestSurvivor: { heroName: string; remainingHp: number } | null;
  mostPopular: { heroName: string; hotValue: number } | null;

  // Timeline
  eliminationTimeline: { round: number; heroName: string; narrative: string }[];

  // Highlights
  biggestDamage: { heroName: string; targetName: string; damage: number; round: number } | null;
  mostBetrayedHero: { heroName: string; count: number } | null;

  // Per-round summaries
  roundSummaries: { round: number; fightCount: number; eliminationCount: number; highlight: string }[];

  // Notable events
  allianceHighlights: { heroName: string; allyName: string; round: number }[];
  betrayalHighlights: { heroName: string; targetName: string; round: number; narrative: string }[];
}

/**
 * Compute battle stats from raw game_events rows (snake_case DB format).
 */
export function computeBattleStats(
  events: any[],
  heroNameMap: Map<string, string>,
): BattleStats {
  const name = (id: string | null) => (id ? heroNameMap.get(id) || '无名' : '无名');

  let totalFights = 0;
  let totalBetrayals = 0;
  let totalAlliances = 0;
  let totalEliminations = 0;

  // Damage tracking: heroId -> total damage dealt
  const damageDealt = new Map<string, number>();
  // Betrayal tracking: heroId -> count of betrayals initiated
  const betrayalsByHero = new Map<string, number>();
  // Betrayed tracking: heroId -> count of times betrayed (as target)
  const betrayedCount = new Map<string, number>();

  const eliminationTimeline: BattleStats['eliminationTimeline'] = [];
  let biggestDamage: BattleStats['biggestDamage'] = null;
  const allianceHighlights: BattleStats['allianceHighlights'] = [];
  const betrayalHighlights: BattleStats['betrayalHighlights'] = [];

  // Per-round accumulators
  const roundFights = new Map<number, number>();
  const roundEliminations = new Map<number, number>();
  const roundHighlights = new Map<number, { priority: number; narrative: string }>();

  for (const e of events) {
    const round = e.round || 0;
    const type = e.event_type;
    const heroId = e.hero_id;
    const targetId = e.target_hero_id;
    const hpDelta = Math.abs(e.hp_delta || 0);
    const narrative = e.narrative || '';

    if (type === 'fight' || type === 'gang_up' || type === 'scramble') {
      totalFights++;
      roundFights.set(round, (roundFights.get(round) || 0) + 1);
      if (heroId) {
        damageDealt.set(heroId, (damageDealt.get(heroId) || 0) + hpDelta);
      }
      if (heroId && targetId && hpDelta > 0) {
        if (!biggestDamage || hpDelta > biggestDamage.damage) {
          biggestDamage = { heroName: name(heroId), targetName: name(targetId), damage: hpDelta, round };
        }
      }
    }

    if (type === 'betray') {
      totalBetrayals++;
      if (heroId) betrayalsByHero.set(heroId, (betrayalsByHero.get(heroId) || 0) + 1);
      if (targetId) betrayedCount.set(targetId, (betrayedCount.get(targetId) || 0) + 1);
      betrayalHighlights.push({
        heroName: name(heroId),
        targetName: name(targetId),
        round,
        narrative,
      });
    }

    if (type === 'ally_formed') {
      totalAlliances++;
      allianceHighlights.push({
        heroName: name(heroId),
        allyName: name(targetId),
        round,
      });
    }

    if (type === 'eliminated') {
      totalEliminations++;
      roundEliminations.set(round, (roundEliminations.get(round) || 0) + 1);
      eliminationTimeline.push({ round, heroName: name(heroId), narrative });
    }

    // Track best highlight per round
    const priority = e.priority || 0;
    const current = roundHighlights.get(round);
    if (!current || priority > current.priority) {
      roundHighlights.set(round, { priority, narrative });
    }
  }

  // Build MVPs
  let mostDamageDealt: BattleStats['mostDamageDealt'] = null;
  let maxDmg = 0;
  for (const [hid, dmg] of damageDealt) {
    if (dmg > maxDmg) { maxDmg = dmg; mostDamageDealt = { heroName: name(hid), totalDamage: dmg }; }
  }

  let mostBetrayals: BattleStats['mostBetrayals'] = null;
  let maxBetray = 0;
  for (const [hid, cnt] of betrayalsByHero) {
    if (cnt > maxBetray) { maxBetray = cnt; mostBetrayals = { heroName: name(hid), count: cnt }; }
  }

  let mostBetrayedHero: BattleStats['mostBetrayedHero'] = null;
  let maxBetrayed = 0;
  for (const [hid, cnt] of betrayedCount) {
    if (cnt > maxBetrayed) { maxBetrayed = cnt; mostBetrayedHero = { heroName: name(hid), count: cnt }; }
  }

  // Build round summaries (rounds 1-5 + semifinals/finals = rounds 6-7)
  const allRounds = new Set([...roundFights.keys(), ...roundEliminations.keys(), ...roundHighlights.keys()]);
  const roundSummaries: BattleStats['roundSummaries'] = [];
  for (const r of [...allRounds].sort((a, b) => a - b)) {
    if (r > 8) continue; // skip weird round numbers
    roundSummaries.push({
      round: r,
      fightCount: roundFights.get(r) || 0,
      eliminationCount: roundEliminations.get(r) || 0,
      highlight: roundHighlights.get(r)?.narrative || '',
    });
  }

  return {
    totalFights,
    totalBetrayals,
    totalAlliances,
    totalEliminations,
    mostDamageDealt,
    mostBetrayals,
    bestSurvivor: null, // filled by caller from game_heroes data
    mostPopular: null,   // filled by caller from game_heroes data
    eliminationTimeline,
    biggestDamage,
    mostBetrayedHero,
    roundSummaries,
    allianceHighlights: allianceHighlights.slice(0, 10),
    betrayalHighlights: betrayalHighlights.slice(0, 10),
  };
}
