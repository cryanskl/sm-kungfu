import { GameHero, MartialArt, FinalsMove, ArtifactEffect } from '../types';
import {
  MIN_DAMAGE, ULTIMATE_MULTIPLIER, DEATH_PACT_MULTIPLIER,
  GANG_UP_DEFENSE_BONUS, WANTED_DEFENSE_BONUS,
  REVENGE_DAMAGE_BONUS, COUNTER_BASE_CHANCE,
  BLUFF_BASE_CHANCE, BLUFF_WISDOM_FACTOR, BLUFF_CREDIT_FACTOR,
  FINALS_CLASH_DAMAGE,
} from './constants';

// ============================================================
// 基础伤害计算
// ============================================================

interface CombatContext {
  isDeathPact?: boolean;
  isWanted?: boolean;       // 目标是通缉犯
  isRevenge?: boolean;      // 攻击者有复仇buff
  isGangUp?: boolean;       // 围攻
  attackerAttrs: { strength: number; innerForce: number; agility: number; wisdom: number; constitution: number };
  defenderAttrs: { strength: number; innerForce: number; agility: number; wisdom: number; constitution: number };
  attackerMartialArts: MartialArt[];
  defenderMartialArts: MartialArt[];
}

export function calculateAttackPower(ctx: CombatContext): number {
  const { strength, innerForce } = ctx.attackerAttrs;
  const martialBonus = ctx.attackerMartialArts.reduce((sum, ma) => sum + ma.attackBonus, 0);
  let power = strength * 0.6 + innerForce * 0.5 + martialBonus;

  if (ctx.isDeathPact) power *= DEATH_PACT_MULTIPLIER;
  if (ctx.isRevenge) power *= REVENGE_DAMAGE_BONUS;

  return Math.round(power);
}

export function calculateDefensePower(ctx: CombatContext): number {
  const { constitution, agility } = ctx.defenderAttrs;
  const martialBonus = ctx.defenderMartialArts.reduce((sum, ma) => sum + ma.defenseBonus, 0);
  let defense = constitution * 0.3 + agility * 0.2 + martialBonus;

  if (ctx.isWanted) defense *= WANTED_DEFENSE_BONUS;
  if (ctx.isGangUp) defense *= GANG_UP_DEFENSE_BONUS;

  return Math.round(defense);
}

export function calculateDamage(ctx: CombatContext): number {
  const attack = calculateAttackPower(ctx);
  const defense = calculateDefensePower(ctx);
  return Math.max(MIN_DAMAGE, attack - defense);
}

// ============================================================
// 先手判定
// ============================================================

export function rollInitiative(agility: number): number {
  return agility + Math.floor(Math.random() * 10) + 1;
}

// ============================================================
// 围攻反杀
// ============================================================

export function rollCounterAttack(defenderWisdom: number): boolean {
  const chance = COUNTER_BASE_CHANCE + (defenderWisdom / 100) * 0.2;
  return Math.random() < chance;
}

// ============================================================
// 段誉六脉神剑（30%概率反杀）
// ============================================================

// ============================================================
// 虚竹运气加成
// ============================================================

export function applyLuckBonus(damage: number, isXuzhu: boolean): number {
  if (isXuzhu) return Math.round(damage * 1.5);
  return damage;
}

// ============================================================
// 决赛出招系统
// ============================================================

interface FinalsMatchup {
  move1: FinalsMove;
  move2: FinalsMove;
  hero1Attrs: { strength: number; wisdom: number; innerForce: number };
  hero2Attrs: { strength: number; wisdom: number; innerForce: number };
  hero1Credit: number;
  hero2Credit: number;
  hero1Morality?: number;
  hero2Morality?: number;
  hero1Artifacts?: ArtifactEffect;
  hero2Artifacts?: ArtifactEffect;
}

export type FinalsResult = 'hero1_wins' | 'hero2_wins' | 'draw' | 'both_hurt';

// 克制关系
const BEATS: Record<string, string> = {
  attack: 'ultimate',    // 攻克绝招
  defend: 'attack',      // 守克攻
  ultimate: 'defend',    // 绝招克守
};

export function resolveFinalsRound(matchup: FinalsMatchup): {
  result: FinalsResult;
  hero1HpDelta: number;
  hero2HpDelta: number;
  narrative: string;
} {
  const { move1, move2 } = matchup;
  const a1 = matchup.hero1Artifacts || {};
  const a2 = matchup.hero2Artifacts || {};

  // 道义修正：低于50道义的角色攻击力下降（背叛代价）
  // 道义50=1.0x, 道义30=0.9x, 道义0=0.75x
  const moralityMod = (morality: number) => Math.max(0.75, 1 - (50 - morality) * 0.005);
  const m1 = moralityMod(matchup.hero1Morality ?? 50);
  const m2 = moralityMod(matchup.hero2Morality ?? 50);

  // 诈的处理（加 bluffBoost）
  let effectiveMove1 = move1;
  let effectiveMove2 = move2;

  // 双诈特判：双方都选诈时，比较智慧决定胜负，避免顺序依赖的 bug
  if (move1 === 'bluff' && move2 === 'bluff') {
    const w1 = matchup.hero1Attrs.wisdom + (a1.bluffBoost || 0) * 10;
    const w2 = matchup.hero2Attrs.wisdom + (a2.bluffBoost || 0) * 10;
    // 智慧高者识破对方，低者退化为攻
    if (w1 > w2) {
      effectiveMove1 = 'attack';
      effectiveMove2 = 'defend'; // 被识破，变为防守
    } else if (w2 > w1) {
      effectiveMove1 = 'defend';
      effectiveMove2 = 'attack';
    } else {
      // 同智慧：双方都退化为攻
      effectiveMove1 = 'attack';
      effectiveMove2 = 'attack';
    }
  } else if (move1 === 'bluff') {
    const bluffChance = BLUFF_BASE_CHANCE
      + matchup.hero1Attrs.wisdom * BLUFF_WISDOM_FACTOR
      + matchup.hero1Credit * BLUFF_CREDIT_FACTOR
      + (a1.bluffBoost || 0);
    if (Math.random() < bluffChance) {
      const counterOf = Object.entries(BEATS).find(([, v]) => v === move2)?.[0];
      if (counterOf) effectiveMove2 = counterOf as FinalsMove;
      effectiveMove1 = 'attack';
    } else {
      effectiveMove1 = 'attack';
    }
  } else if (move2 === 'bluff') {
    const bluffChance = BLUFF_BASE_CHANCE
      + matchup.hero2Attrs.wisdom * BLUFF_WISDOM_FACTOR
      + matchup.hero2Credit * BLUFF_CREDIT_FACTOR
      + (a2.bluffBoost || 0);
    if (Math.random() < bluffChance) {
      const counterOf = Object.entries(BEATS).find(([, v]) => v === move1)?.[0];
      if (counterOf) effectiveMove1 = counterOf as FinalsMove;
      effectiveMove2 = 'attack';
    } else {
      effectiveMove2 = 'attack';
    }
  }

  // 伤害计算辅助函数（含道义修正和减免）
  const finalDmg = (baseDmg: number, moralityMult: number, reduction: number) =>
    Math.max(5, Math.round(baseDmg * moralityMult) - reduction);

  // 同招
  if (effectiveMove1 === effectiveMove2) {
    if (effectiveMove1 === 'attack') {
      // 比力量（加 attackBoost）
      const s1 = matchup.hero1Attrs.strength + (a1.attackBoost || 0);
      const s2 = matchup.hero2Attrs.strength + (a2.attackBoost || 0);
      if (s1 > s2) {
        const dmg = finalDmg(15 + (a1.attackBoost || 0), m1, a2.damageReduction || 0);
        return { result: 'hero1_wins', hero1HpDelta: 0, hero2HpDelta: -dmg, narrative: '双方硬碰硬，力量更强者占据上风！' };
      } else if (s1 < s2) {
        const dmg = finalDmg(15 + (a2.attackBoost || 0), m2, a1.damageReduction || 0);
        return { result: 'hero2_wins', hero1HpDelta: -dmg, hero2HpDelta: 0, narrative: '双方硬碰硬，力量更强者占据上风！' };
      }
      return { result: 'draw', hero1HpDelta: -5, hero2HpDelta: -5, narrative: '势均力敌，双方各退一步！' };
    }
    if (effectiveMove1 === 'defend') {
      return { result: 'draw', hero1HpDelta: 5, hero2HpDelta: 5, narrative: '双方以守为攻，各自调息。' };
    }
    if (effectiveMove1 === 'ultimate') {
      // 绝招对绝招（加 ultimateBoost + 道义修正）
      const clash1 = Math.round(FINALS_CLASH_DAMAGE * (1 + (a1.ultimateBoost || 0)) * m1);
      const clash2 = Math.round(FINALS_CLASH_DAMAGE * (1 + (a2.ultimateBoost || 0)) * m2);
      const dmg1 = Math.max(5, clash2 - (a1.damageReduction || 0));
      const dmg2 = Math.max(5, clash1 - (a2.damageReduction || 0));
      return { result: 'both_hurt', hero1HpDelta: -dmg1, hero2HpDelta: -dmg2, narrative: '两大绝招正面交锋！天崩地裂！双方重伤！' };
    }
  }

  // 克制判定
  if (BEATS[effectiveMove1] === effectiveMove2) {
    const baseDmg = 20 + Math.round(matchup.hero1Attrs.innerForce * 0.3) + (a1.attackBoost || 0);
    const damage = finalDmg(baseDmg, m1, a2.damageReduction || 0);
    return { result: 'hero1_wins', hero1HpDelta: 0, hero2HpDelta: -damage, narrative: `完美克制！` };
  }
  if (BEATS[effectiveMove2] === effectiveMove1) {
    const baseDmg = 20 + Math.round(matchup.hero2Attrs.innerForce * 0.3) + (a2.attackBoost || 0);
    const damage = finalDmg(baseDmg, m2, a1.damageReduction || 0);
    return { result: 'hero2_wins', hero1HpDelta: -damage, hero2HpDelta: 0, narrative: `完美克制！` };
  }

  // 不应到达这里
  return { result: 'draw', hero1HpDelta: 0, hero2HpDelta: 0, narrative: '平局。' };
}
