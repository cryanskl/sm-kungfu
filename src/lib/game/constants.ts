// ============================================================
// 游戏平衡常量
// ============================================================

// --- 基础数值 ---
export const INITIAL_BALANCE = 10000;
export const BET_AMOUNTS = [100, 500, 1000] as const;
export const BET_RANK_PAYOUTS: Record<number, number> = { 1: 2, 2: 1, 3: 0.5 };
export const INITIAL_HP = 80;
export const INITIAL_MORALITY = 50;
export const INITIAL_CREDIT = 50;
export const MAX_SEATS = 12;
export const TOTAL_ROUNDS = 6;
export const COUNTDOWN_SECONDS = 30;

// --- 时间（秒）---
export const INTRO_DURATION = 25;
export const ROUND_DURATION = 30;
export const ENDING_DURATION = 25;
export const BETWEEN_GAMES_DURATION = 30;

// --- 批处理显示时长（秒）：前端按时间线渲染预计算结果 ---
export const ROUND_DISPLAY_SECONDS = 35;       // R1-R5 每回合显示
export const SEMIFINALS_DISPLAY_SECONDS = 20;   // 半决赛显示
export const FINAL_DISPLAY_SECONDS = 20;        // 决赛显示
export const ENDING_DISPLAY_SECONDS = 15;       // 封神榜显示

/**
 * 根据 display_started_at 后经过的秒数，计算当前该显示第几回合。
 * 返回 0 = 尚未开始，1-5 = R1-R5，6 = 半决赛，7 = 决赛
 */
export function computeDisplayRound(elapsedSec: number): number {
  if (elapsedSec < 0) return 0;
  // R1-R5: 每回合 ROUND_DISPLAY_SECONDS 秒
  for (let r = 1; r <= 5; r++) {
    const threshold = r * ROUND_DISPLAY_SECONDS;
    if (elapsedSec < threshold) return r;
  }
  // 半决赛: 5 * ROUND_DISPLAY_SECONDS 后
  const semiStart = 5 * ROUND_DISPLAY_SECONDS;
  if (elapsedSec < semiStart + SEMIFINALS_DISPLAY_SECONDS) return 6;
  // 已超过半决赛显示时间
  return 6;
}

// --- 战斗 ---
export const MIN_DAMAGE = 8;
export const ULTIMATE_MULTIPLIER = 1.8;
export const DEATH_PACT_MULTIPLIER = 2.0;
export const GANG_UP_DEFENSE_BONUS = 1.4;
export const WANTED_DEFENSE_BONUS = 1.5;
export const WANTED_COUNTER_BONUS = 1.3;
export const REVENGE_DAMAGE_BONUS = 1.5;
export const COUNTER_BASE_CHANCE = 0.2;

// --- 回复 ---
export const TRAIN_HP_RECOVERY = 5;
export const REST_HP_RECOVERY = 12;

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

// --- 神兵助战 ---
export const ARTIFACT_SELECTION_DURATION = 10;
export const ARTIFACT_POOL_SIZE = 8;

import type { ArtifactDef } from '../types';

export const ARTIFACTS: ArtifactDef[] = [
  // 兵器 weapon
  { id: 'yitian_sword', name: '倚天剑', category: 'weapon', price: 800, multiplier: 1.8, description: '削铁如泥的神兵', effect: { attackBoost: 12 }, icon: '🗡️' },
  { id: 'tulong_blade', name: '屠龙刀', category: 'weapon', price: 800, multiplier: 2.5, description: '号令天下的宝刀', effect: { attackBoost: 12 }, icon: '🔪' },
  { id: 'xuantie_sword', name: '玄铁重剑', category: 'weapon', price: 600, multiplier: 2.0, description: '重剑无锋，大巧不工', effect: { attackBoost: 8 }, icon: '⚔️' },
  { id: 'bixie_sword', name: '辟邪剑', category: 'weapon', price: 500, multiplier: 3.0, description: '天下武功唯快不破', effect: { attackBoost: 6 }, icon: '🏹' },
  { id: 'hanbing_iron', name: '寒冰铁', category: 'weapon', price: 300, multiplier: 3.0, description: '冰寒入骨的暗器', effect: { attackBoost: 5 }, icon: '❄️' },
  // 防具 armor
  { id: 'jinsi_armor', name: '金丝软甲', category: 'armor', price: 800, multiplier: 1.8, description: '刀枪不入的宝甲', effect: { defenseBoost: 8, damageReduction: 5 }, icon: '🛡️' },
  { id: 'tiancan_robe', name: '天蚕宝衣', category: 'armor', price: 600, multiplier: 2.2, description: '百毒不侵的蚕丝衣', effect: { defenseBoost: 6, damageReduction: 3 }, icon: '👘' },
  { id: 'ruanjia', name: '护心软甲', category: 'armor', price: 400, multiplier: 2.5, description: '护住要害的软甲', effect: { defenseBoost: 5, damageReduction: 2 }, icon: '🦺' },
  { id: 'iron_vest', name: '铁布衫', category: 'armor', price: 300, multiplier: 2.5, description: '外功护体之术', effect: { defenseBoost: 5 }, icon: '🥋' },
  // 秘籍 technique
  { id: 'qiankun', name: '乾坤大挪移', category: 'technique', price: 1000, multiplier: 2.5, description: '借力打力的绝世心法', effect: { attackBoost: 5, defenseBoost: 5, ultimateBoost: 0.3 }, icon: '📜' },
  { id: 'lingbo', name: '凌波微步', category: 'technique', price: 800, multiplier: 1.5, description: '飘逸灵动的身法', effect: { defenseBoost: 4, bluffBoost: 0.1, damageReduction: 3 }, icon: '💨' },
  { id: 'jiuyin', name: '九阴真经', category: 'technique', price: 900, multiplier: 2.2, description: '天下武学总纲', effect: { attackBoost: 6, ultimateBoost: 0.2 }, icon: '📖' },
  { id: 'jiuyang', name: '九阳神功', category: 'technique', price: 900, multiplier: 2.0, description: '至刚至阳的内功', effect: { hpBonus: 20, attackBoost: 4 }, icon: '☀️' },
  { id: 'beiming', name: '北冥神功', category: 'technique', price: 600, multiplier: 2.5, description: '吸纳内力的奇功', effect: { attackBoost: 4, defenseBoost: 3 }, icon: '🌊' },
  // 丹药 healing
  { id: 'dahuan_pill', name: '大还丹', category: 'healing', price: 800, multiplier: 1.5, description: '起死回生的神丹', effect: { hpBonus: 40 }, icon: '💊' },
  { id: 'heiyu_paste', name: '黑玉断续膏', category: 'healing', price: 500, multiplier: 2.0, description: '接骨续筋的神药', effect: { hpBonus: 25 }, icon: '🧴' },
  { id: 'xuegong_pill', name: '雪蚕丸', category: 'healing', price: 400, multiplier: 2.8, description: '修复内伤的蚕丸', effect: { hpBonus: 20 }, icon: '🐛' },
  { id: 'shexiang_pill', name: '麝香保心丹', category: 'healing', price: 300, multiplier: 2.8, description: '续命保心的丹药', effect: { hpBonus: 15, defenseBoost: 2 }, icon: '💗' },
  // 奇物 accessory
  { id: 'biyu_flute', name: '碧玉箫', category: 'accessory', price: 500, multiplier: 2.8, description: '惑人心智的奇箫', effect: { bluffBoost: 0.15 }, icon: '🎵' },
  { id: 'xuantie_mask', name: '玄铁面具', category: 'accessory', price: 400, multiplier: 3.0, description: '隐藏情绪的面具', effect: { bluffBoost: 0.12 }, icon: '🎭' },
  { id: 'yupei', name: '龙纹玉佩', category: 'accessory', price: 300, multiplier: 3.5, description: '安定心神的玉佩', effect: { bluffBoost: 0.1 }, icon: '🐉' },
];

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
  '风起云涌', '一剑封喉', '绝处逢生', '万剑归宗',
  '侠骨柔情', '夜雨连刀', '断肠崖前', '以武会友',
  '华山论剑', '少林封禅', '武当夺旗', '峨眉之巅',
  '魔教入侵', '丐帮大会', '逍遥争锋', '六扇门令',
  '残阳如血', '夺命十三剑', '最后的江湖', '天命难违',
  '剑胆琴心', '大漠孤烟', '水月洞天', '鬼谷迷踪',
];

// --- 开战倒计时古诗词（每5秒轮换） ---
export const COUNTDOWN_POEMS = [
  { verse: '十步杀一人，千里不留行', source: '李白《侠客行》' },
  { verse: '醉卧沙场君莫笑，古来征战几人回', source: '王翰《凉州词》' },
  { verse: '黄沙百战穿金甲，不破楼兰终不还', source: '王昌龄《从军行》' },
  { verse: '男儿何不带吴钩，收取关山五十州', source: '李贺《南园》' },
  { verse: '但使龙城飞将在，不教胡马度阴山', source: '王昌龄《出塞》' },
  { verse: '壮志饥餐胡虏肉，笑谈渴饮匈奴血', source: '岳飞《满江红》' },
  { verse: '三杯吐然诺，五岳倒为轻', source: '李白《侠客行》' },
  { verse: '宁为百夫长，胜作一书生', source: '杨炯《从军行》' },
  { verse: '会挽雕弓如满月，西北望，射天狼', source: '苏轼《江城子》' },
  { verse: '千古江山，英雄无觅孙仲谋处', source: '辛弃疾《永遇乐》' },
  { verse: '了却君王天下事，赢得生前身后名', source: '辛弃疾《破阵子》' },
  { verse: '想当年，金戈铁马，气吞万里如虎', source: '辛弃疾《永遇乐》' },
  { verse: '大鹏一日同风起，扶摇直上九万里', source: '李白《上李邕》' },
  { verse: '长风破浪会有时，直挂云帆济沧海', source: '李白《行路难》' },
  { verse: '天生我材必有用，千金散尽还复来', source: '李白《将进酒》' },
  { verse: '仰天大笑出门去，我辈岂是蓬蒿人', source: '李白《南陵别儿童入京》' },
  { verse: '一身转战三千里，一剑曾当百万师', source: '王维《老将行》' },
  { verse: '报君黄金台上意，提携玉龙为君死', source: '李贺《雁门太守行》' },
  { verse: '风萧萧兮易水寒，壮士一去兮不复还', source: '荆轲《易水歌》' },
  { verse: '人生自古谁无死，留取丹心照汗青', source: '文天祥《过零丁洋》' },
  { verse: '醉里挑灯看剑，梦回吹角连营', source: '辛弃疾《破阵子》' },
  { verse: '八百里分麾下炙，五十弦翻塞外声', source: '辛弃疾《破阵子》' },
  { verse: '落日照大旗，马鸣风萧萧', source: '杜甫《后出塞》' },
  { verse: '功名万里外，心事一杯中', source: '高适《送李侍御赴安西》' },
  { verse: '葡萄美酒夜光杯，欲饮琵琶马上催', source: '王翰《凉州词》' },
  { verse: '古来青史谁不见，今见功名胜古人', source: '岑参《轮台歌》' },
  { verse: '孰知不向边庭苦，纵死犹闻侠骨香', source: '王维《少年行》' },
  { verse: '射人先射马，擒贼先擒王', source: '杜甫《前出塞》' },
  { verse: '不破不立，不塞不流，不止不行', source: '韩愈《原道》' },
  { verse: '莫愁前路无知己，天下谁人不识君', source: '高适《别董大》' },
];

// --- 回合间加载提示（等待服务端结算时显示） ---
export const LOADING_LINES = [
  '各路英雄正在运筹帷幄',
  '江湖暗流涌动中',
  '武林局势正在变幻',
  '侠客们正在密谋下一步行动',
  '各门各派正在调兵遣将',
  '一场腥风血雨即将来临',
  '天下大势正在重新洗牌',
  '命运的齿轮已经转动',
  '暗处的棋局正在展开',
  '有人在磨剑，有人在祈祷',
  '风起云涌，大战在即',
  '江湖从不平静',
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
  '药铺老板娘今天免费发金创药——嗅到了商机',
  '茶馆说书人已经开始编新段子了',
  '听说有人在暗中买通了裁判……但这里没有裁判',
  '一个神秘人在暗处记录着每一场比试……',
  '丐帮弟子在场外支起了花生摊，生意火爆',
  '有人看到一只黑猫从擂台下窜过，不知是吉是凶',
  '据说今晚的月亮格外圆，适合修炼内功',
  '一位老翁在场边下棋，对比试毫不在意',
  '镖局的人在外面围了三圈，全来看热闹的',
  '有个小孩说他以后也要参加武林大会',
  '几个书生在争论到底谁会赢，差点自己打起来',
  '酒馆伙计说今天的酒免费——庆祝武林大会开幕',
  '有消息称六扇门的人也混在观众席里',
  '铁匠铺今天不打铁了，全体歇业来看比赛',
  '一位算命先生掐指一算，说今日有血光之灾',
  '据说冠军能获得一柄传说中的神兵利器……也可能只是传说',
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
