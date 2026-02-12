import { GameHero, MartialArt, FinalsMove } from '../types';
import {
  MIN_DAMAGE, ULTIMATE_MULTIPLIER, DEATH_PACT_MULTIPLIER,
  GANG_UP_DEFENSE_BONUS, WANTED_DEFENSE_BONUS, WANTED_COUNTER_BONUS,
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
  let power = strength * 0.4 + innerForce * 0.3 + martialBonus;

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

export function rollSixMeridianSword(): boolean {
  return Math.random() < 0.3;
}

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

  // 诈的处理
  let effectiveMove1 = move1;
  let effectiveMove2 = move2;

  if (move1 === 'bluff') {
    const bluffChance = BLUFF_BASE_CHANCE
      + matchup.hero1Attrs.wisdom * BLUFF_WISDOM_FACTOR
      + matchup.hero1Credit * BLUFF_CREDIT_FACTOR;
    if (Math.random() < bluffChance) {
      // 诈成功：对手出了被克制的招
      const counterOf = Object.entries(BEATS).find(([, v]) => v === move2)?.[0];
      if (counterOf) effectiveMove2 = counterOf as FinalsMove;
      effectiveMove1 = 'attack'; // 诈成功等于完美克制
    } else {
      effectiveMove1 = 'attack'; // 诈失败视为出攻
    }
  }
  if (move2 === 'bluff') {
    const bluffChance = BLUFF_BASE_CHANCE
      + matchup.hero2Attrs.wisdom * BLUFF_WISDOM_FACTOR
      + matchup.hero2Credit * BLUFF_CREDIT_FACTOR;
    if (Math.random() < bluffChance) {
      const counterOf = Object.entries(BEATS).find(([, v]) => v === move1)?.[0];
      if (counterOf) effectiveMove1 = counterOf as FinalsMove;
      effectiveMove2 = 'attack';
    } else {
      effectiveMove2 = 'attack';
    }
  }

  // 同招
  if (effectiveMove1 === effectiveMove2) {
    if (effectiveMove1 === 'attack') {
      // 比力量
      if (matchup.hero1Attrs.strength > matchup.hero2Attrs.strength) {
        return { result: 'hero1_wins', hero1HpDelta: 0, hero2HpDelta: -15, narrative: '双方硬碰硬，力量更强者占据上风！' };
      } else if (matchup.hero1Attrs.strength < matchup.hero2Attrs.strength) {
        return { result: 'hero2_wins', hero1HpDelta: -15, hero2HpDelta: 0, narrative: '双方硬碰硬，力量更强者占据上风！' };
      }
      return { result: 'draw', hero1HpDelta: -5, hero2HpDelta: -5, narrative: '势均力敌，双方各退一步！' };
    }
    if (effectiveMove1 === 'defend') {
      return { result: 'draw', hero1HpDelta: 5, hero2HpDelta: 5, narrative: '双方以守为攻，各自调息。' };
    }
    if (effectiveMove1 === 'ultimate') {
      return { result: 'both_hurt', hero1HpDelta: -FINALS_CLASH_DAMAGE, hero2HpDelta: -FINALS_CLASH_DAMAGE, narrative: '两大绝招正面交锋！天崩地裂！双方重伤！' };
    }
  }

  // 克制判定
  if (BEATS[effectiveMove1] === effectiveMove2) {
    const damage = 20 + Math.round(matchup.hero1Attrs.innerForce * 0.3);
    return { result: 'hero1_wins', hero1HpDelta: 0, hero2HpDelta: -damage, narrative: `完美克制！` };
  }
  if (BEATS[effectiveMove2] === effectiveMove1) {
    const damage = 20 + Math.round(matchup.hero2Attrs.innerForce * 0.3);
    return { result: 'hero2_wins', hero1HpDelta: -damage, hero2HpDelta: 0, narrative: `完美克制！` };
  }

  // 不应到达这里
  return { result: 'draw', hero1HpDelta: 0, hero2HpDelta: 0, narrative: '平局。' };
}
