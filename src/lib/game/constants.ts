// ============================================================
// 游戏平衡常量
// ============================================================

// --- 基础数值 ---
export const INITIAL_BALANCE = 10000;
export const BET_AMOUNTS = [100, 500, 1000] as const;
export const BET_RANK_PAYOUTS: Record<number, number> = { 1: 2, 2: 1, 3: 0.5 };
export const INITIAL_HP = 100;
export const INITIAL_MORALITY = 50;
export const INITIAL_CREDIT = 50;
export const MAX_SEATS = 12;
export const TOTAL_ROUNDS = 6;
export const COUNTDOWN_SECONDS = 30;

// --- 时间（秒）---
export const INTRO_DURATION = 25;
export const ROUND_DURATION = 35;
export const ENDING_DURATION = 25;
export const BETWEEN_GAMES_DURATION = 60;

// --- 战斗 ---
export const MIN_DAMAGE = 5;
export const ULTIMATE_MULTIPLIER = 1.8;
export const DEATH_PACT_MULTIPLIER = 2.0;
export const GANG_UP_DEFENSE_BONUS = 1.4;
export const WANTED_DEFENSE_BONUS = 1.5;
export const WANTED_COUNTER_BONUS = 1.3;
export const REVENGE_DAMAGE_BONUS = 1.5;
export const COUNTER_BASE_CHANCE = 0.2;

// --- 回复 ---
export const TRAIN_HP_RECOVERY = 10;
export const REST_HP_RECOVERY = 20;

// --- 声望 ---
export const REP = {
  PK_WIN: 50,
  PK_LOSE: 10,
  KILL: 30,
  TRAIN: 10,
  EXPLORE_REWARD: 20,
  SCRAMBLE_WIN: 40,
  ALLY: 15,
  BETRAY: -10,
  SURVIVE_WANTED: 60,
  SIGN_DEATH_PACT: 20,
} as const;

// --- Hot ---
export const HOT = {
  SPEECH_MIN: 10,
  SPEECH_MAX: 30,
  BETRAY: 20,
  REVENGE: 25,
  OUTNUMBERED_WIN: 30,
  COMEBACK: 30,
  HIGHLIGHT: 20,
  SIGN_DEATH_PACT: 15,
  SKIP_DEATH_PACT: -10,
  QUOTE: 10,
} as const;

// --- R1 残卷 ---
export const R1_SCROLL_SLOTS = 3;
export const R1_SCROLL_ATTACK_BONUS = 8;
export const R1_SCROLL_REPUTATION = 30;
export const R1_SCRAMBLE_LOSE_HP = 10;
export const R1_SCRAMBLE_LOSE_REP = 10;
export const R1_FALLBACK_ATTACK_BONUS = 4;  // 保底弱化版

// --- R2 方丈收徒 ---
export const R2_MASTER_ATTR_BONUS = 3;

// --- R3 背叛 ---
export const R3_BETRAY_RESOURCE_STEAL = 0.3;
export const R3_BETRAY_MORALITY_COST = 20;
export const R3_BETRAY_CREDIT_COST = 30;

// --- R5 生死状 ---
export const R5_SKIP_REP_PENALTY = 5;

// --- R6 决赛 ---
export const FINALS_TOP_REPUTATION = 2;
export const FINALS_TOP_HOT = 2;
export const FINALS_ROUNDS = 3;
export const BLUFF_BASE_CHANCE = 0.3;
export const BLUFF_WISDOM_FACTOR = 0.01;
export const BLUFF_CREDIT_FACTOR = 0.005;
export const FINALS_CLASH_DAMAGE = 30;  // 绝招对绝招

// --- 属性映射 ---
export const BASE_ATTRIBUTE = 10;
export const MAX_PERSONALITY_BONUS = 20;
export const TOTAL_ATTRIBUTE_BUDGET = 90;  // 总属性点约 80-100

// --- 门派属性加成 ---
export const FACTION_BONUSES: Record<string, Partial<Record<string, number>>> = {
  '少林': { strength: 5, constitution: 5 },
  '武当': { innerForce: 5, wisdom: 5 },
  '华山': { strength: 5, agility: 5 },
  '峨眉': { agility: 5, innerForce: 5 },
  '逍遥': { wisdom: 5, charisma: 5 },
  '丐帮': { constitution: 5, charisma: 5 },
  '魔教': { strength: 5, innerForce: 5 },
};

// --- 本局主题词池 ---
export const GAME_THEMES = [
  '背叛之夜', '血雨腥风', '龙争虎斗', '风云再起',
  '群雄逐鹿', '刀光剑影', '惊天一战', '生死擂台',
  '英雄末路', '乱世枭雄', '冰火交锋', '笑傲江湖',
  '铁血丹心', '剑指苍穹', '暗流涌动', '天下第一',
];

// --- 回合间八卦彩蛋 ---
export const GOSSIP_LINES = [
  '有人在华山之巅看到一道剑气……',
  '少林寺伙食堂今日加菜——为即将到来的恶战壮行',
  '江湖传言：某位大侠昨夜梦到了独孤九剑的第十式',
  '客栈老板偷偷下注了三两银子',
  '一只白鸽飞过擂台上空，不知带来什么消息',
  '远处传来阵阵雷声，似乎天象也在为今日助阵',
  '有人在后山发现了一把生锈的铁剑，不知属于哪位前辈',
  '擂台下的瓜子已经卖完了三筐',
];

// --- 赛季称号 ---
export const TITLES = {
  CHAMPION: { name: '武林盟主', icon: '🏆', points: 100 },
  RUNNER_UP: { name: '绝世高手', icon: '⚔️', points: 60 },
  TOP_4: { name: '一代宗师', icon: '🗡️', points: 30 },
  KILLER: { name: '杀神', icon: '💀', points: 15 },
  TANK: { name: '不倒翁', icon: '🛡️', points: 15 },
  SCHEMER: { name: '纵横家', icon: '🎭', points: 15 },
  CLUTCH: { name: '天命之人', icon: '🍀', points: 20 },
  DARK_HORSE: { name: '黑马', icon: '🌟', points: 20 },
  TRASH_TALKER: { name: '嘴强王者', icon: '🎤', points: 15 },
  HOT_TOPIC: { name: '热搜体质', icon: '🧨', points: 15 },
  PARTICIPANT: { name: '江湖豪杰', icon: '⚔️', points: 10 },
} as const;
