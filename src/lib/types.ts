// ============================================================
// AI 武林大会 · 核心类型定义
// ============================================================

// --- 英雄 ---

export type PersonalityType = 'aggressive' | 'cautious' | 'cunning' | 'random';

export type Faction =
  | '少林' | '武当' | '华山' | '峨眉'
  | '逍遥' | '丐帮' | '魔教'
  | '无门无派' | '大理段氏' | '曼陀山庄';

export interface HeroAttributes {
  strength: number;     // 力量
  innerForce: number;   // 内力
  agility: number;      // 轻功
  wisdom: number;       // 智慧
  constitution: number; // 体质
  charisma: number;     // 魅力
}

export interface Hero {
  id: string;
  userId: string | null;       // SecondMe userId，NPC 为 null
  isNpc: boolean;
  npcTemplateId: string | null;

  heroName: string;
  title: string;
  faction: Faction;
  personalityType: PersonalityType;
  catchphrase: string;
  avatarUrl: string | null;

  // 六维属性
  strength: number;
  innerForce: number;
  agility: number;
  wisdom: number;
  constitution: number;
  charisma: number;

  // 赛季累计
  seasonPoints: number;
  totalWins: number;
  totalGames: number;

  createdAt: string;
}

// --- 对局中的英雄状态 ---

export interface GameHero {
  id: string;
  gameId: string;
  heroId: string;
  seatNumber: number;

  // 运行时状态
  hp: number;
  reputation: number;    // 声望
  hot: number;           // 热搜指数
  morality: number;      // 武德
  credit: number;        // 信用

  // 本局获得
  martialArts: MartialArt[];
  allyHeroId: string | null;
  hasDeathPact: boolean;
  hasUltimate: boolean;

  // 结果
  finalRank: number | null;
  title: string | null;
  isEliminated: boolean;
  eliminationRound: number | null;

  // 关联的英雄信息（join 查询时填充）
  hero?: Hero;
}

export interface MartialArt {
  name: string;
  attackBonus: number;
  defenseBonus: number;
}

// --- 对局 ---

export type GameStatus =
  | 'waiting'     // 等待入场
  | 'countdown'   // 30 秒倒计时
  | 'intro'       // 开场点名
  | 'batch_processing' // 后台批处理中（R1-R5 + semifinals）
  | 'round_1' | 'round_2' | 'round_3' | 'round_4' | 'round_5' | 'round_6'
  | 'semifinals'  // 半决赛
  | 'artifact_selection' // 神兵助战（10秒观众投注）
  | 'final'       // 决赛
  | 'ending'      // 封神榜
  | 'ended';      // 已结束

export interface Game {
  id: string;
  gameNumber: number;
  status: GameStatus;
  currentRound: number;
  theme: string | null;
  startedAt: string | null;
  endedAt: string | null;
  championHeroId: string | null;
  createdAt: string;
}

// --- 事件 ---

export type EventType =
  | 'director_event'   // 导演事件
  | 'decision'         // AI 决策
  | 'fight'            // 战斗
  | 'betray'           // 背叛
  | 'ally_formed'      // 结盟
  | 'train'            // 修炼
  | 'explore'          // 探索
  | 'rest'             // 休息
  | 'scramble'         // 争夺战
  | 'gang_up'          // 围攻
  | 'eliminated'       // 淘汰
  | 'level_up'         // 升级
  | 'comeback'         // 逆转
  | 'hot_news'         // 热搜
  | 'speech'           // 宣言
  | 'champion'         // 盟主
  | 'title_award';     // 称号颁发

export interface GameEvent {
  id: string;
  gameId: string;
  round: number;
  sequence: number;

  eventType: EventType;
  priority: number;       // 演出优先级 1-8
  heroId: string | null;
  targetHeroId: string | null;

  action: string | null;
  data: Record<string, any>;
  narrative: string;        // 武侠风叙事
  taunt: string | null;     // 对外宣言
  innerThought: string | null;  // 内心独白

  reputationDelta: number;
  hotDelta: number;
  hpDelta: number;

  createdAt: string;

  // 前端展示用（join 填充）
  heroName?: string;
  targetHeroName?: string;
}

// --- AI 决策 ---

export type ActionType = 'fight' | 'train' | 'explore' | 'ally' | 'betray' | 'rest';
export type FinalsMove = 'attack' | 'defend' | 'ultimate' | 'bluff';

export interface Decision {
  action: ActionType;
  target: string | null;
  taunt: string;
  reason: string;
  signDeathPact?: boolean;
}

export interface FinalsDecision {
  move: FinalsMove;
  taunt: string;
}

// --- 世界快照（观众轮询用）---

export interface GameState {
  gameId: string | null;
  gameNumber: number;
  status: GameStatus;
  currentRound: number;
  phase: 'waiting' | 'director' | 'decision' | 'resolution' | 'update' | 'intro' | 'finals' | 'artifact_selection' | 'ending';
  theme: string | null;

  heroes: GameHeroSnapshot[];
  recentEvents: GameEvent[];
  reputationRanking: RankEntry[];
  hotRanking: RankEntry[];

  nextRoundPreview: string | null;
  countdownSeconds: number | null;
  championName: string | null;

  seasonLeaderboard: SeasonEntry[];
  bettingPool: BettingPool | null;
  danmaku: DanmakuItem[];

  // 上局回顾（等待界面展示）
  lastGameTop8: RankEntry[];
  lastGameHighlights: HighlightEvent[];

  // 结算展示
  betWinners: BetWinner[];
  balanceRanking: BalanceEntry[];

  // 神兵助战
  artifactPool: ArtifactPoolState | null;

  // 武林周刊统计
  battleStats?: import('@/lib/game/battle-stats').BattleStats;

  // 弹幕天意
  audienceInfluence: AudienceInfluence | null;

  // 候补队列
  queueCount: number;

  // 批处理同步广播
  displayRound?: number;
  batchProgress?: { processedThrough: number; startedAt: string; lastUpdatedAt: string };
  displayStartedAt?: string;

  updatedAt: string;
}

export interface GameHeroSnapshot {
  heroId: string;
  heroName: string;
  faction: Faction;
  personalityType: PersonalityType;
  seatNumber: number;
  hp: number;
  maxHp: number;
  reputation: number;
  hot: number;
  morality: number;
  credit: number;
  isEliminated: boolean;
  allyHeroId: string | null;
  allyHeroName: string | null;
  martialArts: MartialArt[];
  hasDeathPact: boolean;
  isNpc: boolean;
  catchphrase: string;
  avatarUrl: string | null;

  // 六维属性（前端展示用）
  strength: number;
  innerForce: number;
  agility: number;
  wisdom: number;
  constitution: number;
  charisma: number;

  bio?: string;  // 封神榜背景故事
}

export interface RankEntry {
  heroId: string;
  heroName: string;
  faction: Faction;
  value: number;
  rank: number;
}

export interface SeasonEntry {
  heroId: string;
  heroName: string;
  faction: Faction;
  seasonPoints: number;
  championCount: number;
  totalGames: number;
}

// --- 上局精彩事件（简化版，用于等待界面展示） ---

export interface HighlightEvent {
  round: number;
  eventType: string;
  narrative: string;
  heroName?: string;
  priority: number;
}

// --- NPC 模板 ---

export interface NpcTemplate {
  id: string;
  heroName: string;
  faction: Faction;
  personalityType: PersonalityType;
  catchphrase: string;
  signatureLines: string[];
  backstory?: string;            // 封神榜背景故事

  // 六维属性
  strength: number;
  innerForce: number;
  agility: number;
  wisdom: number;
  constitution: number;
  charisma: number;

  // 行为标记
  alwaysFightStrongest?: boolean;
  neverFight?: boolean;
  pairedWith?: string;        // 搭档 NPC ID
  betrayRound?: number;       // 几回合必背叛
  signDeathPactAlways?: boolean;

  // 决策权重
  actionWeights: Record<ActionType, number>;
}

export interface GameTrait {
  name: string;
  effect: string;
  modifyWeights?: Partial<Record<ActionType, number>>;
}

// --- SecondMe API ---

// SecondMe API 实际返回格式（参考 develop-docs.second.me）
export interface SecondMeUserInfo {
  userId: string;            // 官方文档：string 类型
  name: string;
  email?: string;
  avatar?: string;           // 注意：是 avatar，不是 avatarUrl
  bio?: string;
  selfIntroduction?: string;
  profileCompleteness?: number;
  route?: string;
}

// --- P2: 押注 ---
export interface BettingPool {
  totalPool: number;
  heroPools: Record<string, { heroName: string; amount: number; betCount: number }>;
  isOpen: boolean;
}

export interface BetWinner {
  displayName: string; // 英雄名 or audience_id 前8位
  betHeroName: string; // 押注的目标英雄
  amount: number;
  payout: number;
  rank: number;        // 目标英雄排名 1/2/3
  multiplier?: number; // 神兵倍率（展示用）
}

export interface BalanceEntry {
  heroName: string;
  faction: string;
  balance: number;
  rank: number;
}

// --- P2: 弹幕 ---
export interface DanmakuItem {
  id: string;
  wuxiaText: string;
  color: 'white' | 'gold' | 'cyan' | 'red';
  isCommentary?: boolean;
  createdAt: string;
}

// --- 神兵助战 ---

export type ArtifactCategory = 'weapon' | 'armor' | 'technique' | 'healing' | 'accessory';

export interface ArtifactEffect {
  attackBoost?: number;      // 攻击加成
  defenseBoost?: number;     // 防御加成
  hpBonus?: number;          // 决赛前HP加成
  ultimateBoost?: number;    // 绝招伤害倍率加成（0.3 = +30%）
  bluffBoost?: number;       // 诈的成功率加成
  damageReduction?: number;  // 固定伤害减免
}

export interface ArtifactDef {
  id: string;
  name: string;
  category: ArtifactCategory;
  price: number;
  multiplier: number;          // 赢了返回 price × multiplier
  description: string;
  effect: ArtifactEffect;
  icon: string;
}

export interface ArtifactGiftSummary {
  audienceId: string;
  displayName: string;
  artifactId: string;
  artifactName: string;
  amount: number;
}

export interface ArtifactPoolState {
  finalists: {
    heroId: string;
    heroName: string;
    totalValue: number;
    giftCount: number;
    artifacts: ArtifactGiftSummary[];
  }[];
  availableArtifacts: ArtifactDef[];
  totalPrizePool: number;  // intro下注 + 神器购买
  introBetTotal: number;
  isOpen: boolean;
}

// Shades API 返回的兴趣标签
export interface SecondMeShade {
  id: number;
  shadeName: string;                      // 标签名称
  shadeIcon?: string;
  confidenceLevel: string;                // "VERY_HIGH" | "HIGH" | "MEDIUM" | "LOW" | "VERY_LOW"
  shadeDescription?: string;
  shadeContent?: string;
  sourceTopics?: string[];
  shadeNamePublic?: string;
  shadeDescriptionPublic?: string;
  shadeContentPublic?: string;
  hasPublicContent?: boolean;
}

// --- 弹幕天意：观众影响力 ---
export interface AudienceInfluence {
  counters: Record<string, number>;
  heroTargets: Record<string, Record<string, number>>;
  lastResetRound: number;
  activeEffects: string[];
}
