// ============================================================
// 角色编辑器 — AI 武林大会
// ============================================================

import type { Faction, PersonalityType, HeroAttributes, CharacterConfig, QuizQuestion } from '../types';
import { FACTION_BONUSES } from './constants';

// ============================================================
// 问卷题目
// ============================================================

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 'q1',
    question: '你路遇一伙山贼劫道，会如何应对？',
    options: [
      { label: '拔剑冲上去', effects: { strength: 5, constitution: 3 }, personalityHint: 'aggressive' },
      { label: '观察地形再行动', effects: { wisdom: 5, agility: 3 }, personalityHint: 'cautious' },
      { label: '假装投降暗中出手', effects: { charisma: 3, agility: 5 }, personalityHint: 'cunning' },
      { label: '看心情', effects: { charisma: 4, innerForce: 4 }, personalityHint: 'random' },
    ],
  },
  {
    id: 'q2',
    question: '你在绝壁上发现一本秘籍，但它被毒蛇守着。你会？',
    options: [
      { label: '直接抢', effects: { strength: 4, constitution: 4 }, factionHint: '少林' },
      { label: '用内力驱蛇', effects: { innerForce: 5, wisdom: 3 }, factionHint: '武当' },
      { label: '用轻功绕过', effects: { agility: 5, wisdom: 3 }, factionHint: '华山' },
      { label: '用食物引开蛇', effects: { wisdom: 5, charisma: 3 }, factionHint: '逍遥' },
    ],
  },
  {
    id: 'q3',
    question: '武林大会前夜，你会做什么准备？',
    options: [
      { label: '苦练到天亮', effects: { strength: 3, innerForce: 3, constitution: 2 }, personalityHint: 'aggressive' },
      { label: '打坐调息', effects: { innerForce: 5, wisdom: 3 }, personalityHint: 'cautious' },
      { label: '打探其他选手情报', effects: { wisdom: 4, charisma: 4 }, personalityHint: 'cunning' },
      { label: '喝酒放松', effects: { charisma: 5, constitution: 3 }, personalityHint: 'random' },
    ],
  },
  {
    id: 'q4',
    question: '你的盟友突然背叛你，你会？',
    options: [
      { label: '立刻反击', effects: { strength: 5, agility: 3 }, personalityHint: 'aggressive' },
      { label: '记住此仇来日报', effects: { wisdom: 5, innerForce: 3 }, personalityHint: 'cautious' },
      { label: '微笑应对暗中部署', effects: { charisma: 5, wisdom: 3 }, personalityHint: 'cunning' },
      { label: '无所谓', effects: { constitution: 5, charisma: 3 }, personalityHint: 'random' },
    ],
  },
  {
    id: 'q5',
    question: '如果可以选择一种超凡能力，你选？',
    options: [
      { label: '力劈华山', effects: { strength: 6, constitution: 2 }, factionHint: '少林' },
      { label: '凌波微步', effects: { agility: 6, innerForce: 2 }, factionHint: '峨眉' },
      { label: '读心术', effects: { wisdom: 6, charisma: 2 }, factionHint: '逍遥' },
      { label: '铁布衫', effects: { constitution: 6, strength: 2 }, factionHint: '丐帮' },
    ],
  },
];

// ============================================================
// 属性计算
// ============================================================

/**
 * 将角色配置 + 问卷答案 + SecondMe 基础值 → 最终属性
 *
 * 优先级：
 * 1. SecondMe shades → 基础值
 * 2. 问卷答案 → 叠加修正
 * 3. DIY 偏好 → 覆盖门派和性格
 * 4. 门派加成 → 最终应用
 */
export function computeFinalAttributes(
  baseAttrs: HeroAttributes,
  config: CharacterConfig | null,
  quizAnswers: number[] | null,
): { attrs: HeroAttributes; faction: Faction | null; personalityType: PersonalityType | null } {
  // 开始于基础值
  const attrs: HeroAttributes = { ...baseAttrs };
  let faction: Faction | null = null;
  let personalityType: PersonalityType | null = null;

  // 应用问卷修正
  if (quizAnswers && quizAnswers.length > 0) {
    const factionVotes = new Map<string, number>();
    const personalityVotes = new Map<string, number>();

    for (let i = 0; i < Math.min(quizAnswers.length, QUIZ_QUESTIONS.length); i++) {
      const q = QUIZ_QUESTIONS[i];
      const answerIdx = quizAnswers[i];
      if (answerIdx < 0 || answerIdx >= q.options.length) continue;

      const option = q.options[answerIdx];

      // 叠加属性修正
      for (const [key, value] of Object.entries(option.effects)) {
        if (key in attrs) {
          (attrs as any)[key] += value;
        }
      }

      // 收集门派投票
      if (option.factionHint) {
        factionVotes.set(option.factionHint, (factionVotes.get(option.factionHint) || 0) + 1);
      }
      // 收集性格投票
      if (option.personalityHint) {
        personalityVotes.set(option.personalityHint, (personalityVotes.get(option.personalityHint) || 0) + 1);
      }
    }

    // 从投票中推断门派/性格（如果用户没有手动选）
    if (factionVotes.size > 0) {
      faction = Array.from(factionVotes.entries()).sort((a, b) => b[1] - a[1])[0][0] as Faction;
    }
    if (personalityVotes.size > 0) {
      personalityType = Array.from(personalityVotes.entries()).sort((a, b) => b[1] - a[1])[0][0] as PersonalityType;
    }
  }

  // DIY 偏好覆盖（用户手动选了则优先）
  if (config) {
    if (config.preferredFaction) faction = config.preferredFaction;
    if (config.personalityPreference) personalityType = config.personalityPreference;

    // 战斗风格微调
    if (config.fightStyle === 'offensive') {
      attrs.strength += 3;
      attrs.innerForce += 2;
    } else if (config.fightStyle === 'defensive') {
      attrs.constitution += 3;
      attrs.agility += 2;
    } else if (config.fightStyle === 'balanced') {
      attrs.wisdom += 2;
      attrs.charisma += 2;
      attrs.constitution += 1;
    }
  }

  // 门派加成
  if (faction) {
    const bonus = FACTION_BONUSES[faction];
    if (bonus) {
      for (const [key, value] of Object.entries(bonus)) {
        if (key in attrs && typeof value === 'number') {
          (attrs as any)[key] += value;
        }
      }
    }
  }

  return { attrs, faction, personalityType };
}
