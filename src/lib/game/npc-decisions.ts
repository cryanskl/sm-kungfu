import { Decision, ActionType, GameHeroSnapshot, NpcTemplate, GameTrait } from '../types';
import { NPC_TEMPLATES } from './npc-data/templates';

// ============================================================
// NPC 本地决策（不调 API）
// ============================================================

interface NpcDecisionContext {
  roundNumber: number;
  heroes: GameHeroSnapshot[];  // 本局所有英雄状态
  selfHeroId: string;
  template: NpcTemplate;
  gameTrait: GameTrait | null;
  allyHeroId: string | null;
  allyHeroName: string | null;
  lastAttackedBy: string | null;  // 上回合被谁攻击了
}

export function getNpcDecision(ctx: NpcDecisionContext): Decision {
  const { roundNumber, heroes, selfHeroId, template, gameTrait, allyHeroId, allyHeroName, lastAttackedBy } = ctx;
  const self = heroes.find(h => h.heroId === selfHeroId)!;
  const alive = heroes.filter(h => !h.isEliminated && h.heroId !== selfHeroId);

  if (alive.length === 0) {
    return { action: 'rest', target: null, taunt: '……', reason: '无人可战。' };
  }

  // --- 特殊 NPC 逻辑 ---

  // 扫地僧：前4轮全修炼
  if (template.id === 'saodi' && roundNumber <= 4) {
    return { action: 'train', target: null, taunt: '……', reason: '万法皆空。' };
  }

  // R5 生死状：signDeathPactAlways 的 NPC 必签 + 赌徒特质必签
  if (roundNumber === 5) {
    const shouldSign = template.signDeathPactAlways || gameTrait?.name === '赌徒';
    if (shouldSign) {
      const strongest = getTopReputation(alive);
      return {
        action: 'fight', target: strongest.heroName,
        taunt: randomPick(template.signatureLines),
        reason: '生死有命。',
        signDeathPact: true,
      };
    }
  }

  // 岳不群/周芷若：指定回合必背叛
  if (template.betrayRound === roundNumber && allyHeroId) {
    return {
      action: 'betray', target: allyHeroName || getRandomAlive(alive).heroName,
      taunt: randomPick(template.signatureLines),
      reason: '时机到了。',
    };
  }

  // 独孤求败：永远打声望最高的
  if (template.alwaysFightStrongest) {
    const strongest = getTopReputation(alive);
    return {
      action: 'fight', target: strongest.heroName,
      taunt: randomPick(template.signatureLines),
      reason: '只有最强的才值得我出手。',
    };
  }

  // 王语嫣/段誉/风清扬/小昭：从不主动打人
  if (template.neverFight) {
    const action = weightedRandom(template.actionWeights);
    const target = action === 'ally' ? getRandomAlive(alive).heroName : null;
    return {
      action, target,
      taunt: randomPick(template.signatureLines),
      reason: '不想打架。',
    };
  }

  // 田伯光：偷袭HP最低的
  if (template.id === 'tianboguang') {
    const weakest = getLowestHp(alive);
    return {
      action: 'fight', target: weakest.heroName,
      taunt: '欺负弱的怎么了？这叫效率。',
      reason: '柿子捡软的捏。',
    };
  }

  // 玄冥二老：优先和搭档结盟
  if (template.pairedWith) {
    // 精确匹配搭档：通过 npc_template_id 查找
    const partner = alive.find(h => {
      // 在 snapshots 中无法直接获取 npc_template_id，通过名字匹配
      const partnerTemplate = NPC_TEMPLATES.find(t => t.id === template.pairedWith);
      return partnerTemplate && h.heroName === partnerTemplate.heroName;
    });
    if (partner && !allyHeroId) {
      return {
        action: 'ally', target: partner.heroName,
        taunt: randomPick(template.signatureLines),
        reason: '兄弟同心。',
      };
    }
    // 已结盟 → 打最强的
    const strongest = getTopReputation(alive);
    return {
      action: 'fight', target: strongest.heroName,
      taunt: '兄弟，一起上！',
      reason: '联手无敌。',
    };
  }

  // --- 局内变异特质修正 ---

  const weights = { ...template.actionWeights };

  // 复仇心切：被攻击后必fight
  if (gameTrait?.name === '复仇心切' && lastAttackedBy) {
    const attacker = alive.find(h => h.heroId === lastAttackedBy);
    if (attacker) {
      return {
        action: 'fight', target: attacker.heroName,
        taunt: '还我来！',
        reason: '血债血偿。',
      };
    }
  }

  // 惜命：HP<50 时只 rest/train
  if (gameTrait?.name === '惜命' && self.hp < 50) {
    const action = Math.random() < 0.5 ? 'rest' : 'train';
    return {
      action, target: null,
      taunt: randomPick(template.signatureLines),
      reason: '留得青山在。',
    };
  }

  // 装弱：前3轮只train
  if (gameTrait?.name === '装弱' && roundNumber <= 3) {
    return {
      action: 'train', target: null,
      taunt: randomPick(template.signatureLines),
      reason: '蓄力中……',
    };
  }

  // 应用特质权重修正
  if (gameTrait?.modifyWeights) {
    for (const [key, delta] of Object.entries(gameTrait.modifyWeights)) {
      const k = key as ActionType;
      weights[k] = Math.max(0, (weights[k] || 0) + (delta || 0));
    }
  }

  // R3 特殊：如果有盟友，给 betray 一些概率
  if (roundNumber === 3 && allyHeroId) {
    weights.betray = Math.max(weights.betray || 0, 15);
  }

  // --- 通用决策 ---
  const action = weightedRandom(weights);
  let target: string | null = null;

  if (action === 'fight') {
    // 优先打声望高的（60%概率），否则随机
    target = Math.random() < 0.6
      ? getTopReputation(alive).heroName
      : getRandomAlive(alive).heroName;
  } else if (action === 'ally') {
    // 优先选声望高的结盟
    target = getTopReputation(alive).heroName;
  } else if (action === 'betray' && allyHeroName) {
    target = allyHeroName;
  } else if (action === 'betray' && !allyHeroName) {
    // 没有盟友无法背叛，改为 fight
    target = getRandomAlive(alive).heroName;
    return {
      action: 'fight', target,
      taunt: randomPick(template.signatureLines),
      reason: '既然无人可叛，那就打吧。',
    };
  }

  return {
    action, target,
    taunt: randomPick(template.signatureLines),
    reason: '江湖路远。',
  };
}

// --- 工具函数 ---

function getTopReputation(heroes: GameHeroSnapshot[]): GameHeroSnapshot {
  return heroes.reduce((max, h) => h.reputation > max.reputation ? h : max, heroes[0]);
}

function getLowestHp(heroes: GameHeroSnapshot[]): GameHeroSnapshot {
  return heroes.reduce((min, h) => h.hp < min.hp ? h : min, heroes[0]);
}

function getRandomAlive(heroes: GameHeroSnapshot[]): GameHeroSnapshot {
  return heroes[Math.floor(Math.random() * heroes.length)];
}

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedRandom(weights: Record<string, number>): ActionType {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  if (total === 0) return 'train';

  let roll = Math.random() * total;
  for (const [action, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return action as ActionType;
  }
  return entries[0][0] as ActionType;
}
