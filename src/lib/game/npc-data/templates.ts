import { NpcTemplate, GameTrait } from '../../types';

// ============================================================
// 24 个预设 NPC 角色
// ============================================================

export const NPC_TEMPLATES: NpcTemplate[] = [
  // ─── 少林（4人）───
  {
    id: 'kongjian', heroName: '空见神僧', faction: '少林', personalityType: 'cautious',
    catchphrase: '施主，贫僧忍你很久了。',
    signatureLines: ['阿弥陀佛……', '施主请自重。', '贫僧不想动手。', '忍无可忍，无需再忍！'],
    strength: 18, innerForce: 22, agility: 10, wisdom: 20, constitution: 25, charisma: 15,
    actionWeights: { fight: 5, train: 40, explore: 20, ally: 25, betray: 0, rest: 10 },
  },
  {
    id: 'tieluohan', heroName: '铁罗汉', faction: '少林', personalityType: 'aggressive',
    catchphrase: '少林功夫，堂堂正正！',
    signatureLines: ['来！正面对决！', '少林弟子，从不偷袭！', '拳脚上见真章！'],
    strength: 25, innerForce: 15, agility: 12, wisdom: 10, constitution: 28, charisma: 10,
    actionWeights: { fight: 50, train: 20, explore: 10, ally: 15, betray: 0, rest: 5 },
  },
  {
    id: 'jielv', heroName: '戒律院首座', faction: '少林', personalityType: 'aggressive',
    catchphrase: '破戒者，受死。',
    signatureLines: ['违反戒律者，杀无赦。', '佛门清净地，岂容你放肆！', '老衲替天行道。'],
    strength: 22, innerForce: 18, agility: 14, wisdom: 16, constitution: 22, charisma: 8,
    actionWeights: { fight: 40, train: 25, explore: 10, ally: 15, betray: 0, rest: 10 },
  },
  {
    id: 'saodi', heroName: '扫地僧', faction: '少林', personalityType: 'cautious',
    catchphrase: '……',
    signatureLines: ['……', '施主，何必执着。', '万法皆空。'],
    strength: 30, innerForce: 30, agility: 20, wisdom: 28, constitution: 25, charisma: 10,
    actionWeights: { fight: 0, train: 70, explore: 10, ally: 0, betray: 0, rest: 20 },
    // 特殊：前4轮全修炼，R5签生死状一招秒人
    signDeathPactAlways: true,
  },

  // ─── 武当（4人）───
  {
    id: 'zhangsanfeng', heroName: '张三丰', faction: '武当', personalityType: 'cautious',
    catchphrase: '年轻人，不要急。',
    signatureLines: ['以柔克刚。', '太极之道，在于圆融。', '且慢，让老道看看。'],
    strength: 15, innerForce: 28, agility: 16, wisdom: 28, constitution: 18, charisma: 20,
    actionWeights: { fight: 10, train: 45, explore: 15, ally: 20, betray: 0, rest: 10 },
  },
  {
    id: 'qingfeng', heroName: '清风道长', faction: '武当', personalityType: 'random',
    catchphrase: '道法自然，随缘吧。',
    signatureLines: ['无为而治。', '天意如此。', '随缘随缘。', '道可道，非常道。'],
    strength: 14, innerForce: 22, agility: 18, wisdom: 24, constitution: 14, charisma: 16,
    actionWeights: { fight: 25, train: 25, explore: 25, ally: 25, betray: 0, rest: 0 },
  },
  {
    id: 'xuanming_l', heroName: '玄冥二老·左', faction: '武当', personalityType: 'cunning',
    catchphrase: '兄弟，上！',
    signatureLines: ['兄弟，一起上！', '寒冰掌！', '看我们兄弟联手！'],
    strength: 20, innerForce: 22, agility: 16, wisdom: 14, constitution: 18, charisma: 10,
    pairedWith: 'xuanming_r',
    actionWeights: { fight: 35, train: 15, explore: 10, ally: 35, betray: 0, rest: 5 },
  },
  {
    id: 'xuanming_r', heroName: '玄冥二老·右', faction: '武当', personalityType: 'cunning',
    catchphrase: '哥哥说打谁就打谁。',
    signatureLines: ['哥哥在哪我在哪。', '玄冥神掌！', '谁敢动我哥哥！'],
    strength: 20, innerForce: 22, agility: 16, wisdom: 12, constitution: 20, charisma: 8,
    pairedWith: 'xuanming_l',
    actionWeights: { fight: 35, train: 15, explore: 10, ally: 35, betray: 0, rest: 5 },
  },

  // ─── 峨眉（4人）───
  {
    id: 'miejue', heroName: '灭绝师太', faction: '峨眉', personalityType: 'aggressive',
    catchphrase: '魔教中人，人人得而诛之！',
    signatureLines: ['休要多言，剑下说话！', '峨眉正道，不与邪魔为伍！', '哼！'],
    strength: 20, innerForce: 22, agility: 18, wisdom: 14, constitution: 16, charisma: 8,
    actionWeights: { fight: 55, train: 15, explore: 10, ally: 15, betray: 0, rest: 5 },
  },
  {
    id: 'zhiruo', heroName: '周芷若', faction: '峨眉', personalityType: 'cunning',
    catchphrase: '别怪我心狠。',
    signatureLines: ['我不想这样的……', '师父教我，不可心慈手软。', '对不起。'],
    strength: 14, innerForce: 24, agility: 22, wisdom: 18, constitution: 12, charisma: 22,
    betrayRound: 3,
    actionWeights: { fight: 15, train: 20, explore: 15, ally: 40, betray: 0, rest: 10 },
  },
  {
    id: 'xiaozhao', heroName: '小昭', faction: '峨眉', personalityType: 'cautious',
    catchphrase: '我信你。',
    signatureLines: ['公子，小昭在这里。', '我不会离开的。', '你说什么就是什么。'],
    strength: 8, innerForce: 18, agility: 20, wisdom: 16, constitution: 10, charisma: 28,
    neverFight: true,
    actionWeights: { fight: 0, train: 30, explore: 30, ally: 35, betray: 0, rest: 5 },
  },
  {
    id: 'guoxiang', heroName: '郭襄', faction: '峨眉', personalityType: 'random',
    catchphrase: '来都来了，打一场嘛！',
    signatureLines: ['好有趣！', '大侠，咱们过过招？', '哈哈哈，好好玩！'],
    strength: 16, innerForce: 18, agility: 24, wisdom: 14, constitution: 14, charisma: 24,
    actionWeights: { fight: 40, train: 10, explore: 25, ally: 20, betray: 0, rest: 5 },
  },

  // ─── 华山（4人）───
  {
    id: 'dugu', heroName: '独孤求败', faction: '无门无派', personalityType: 'aggressive',
    catchphrase: '生平求一败而不可得。',
    signatureLines: ['来。', '不够。', '还有谁？', '生平求一败而不可得。'],
    strength: 30, innerForce: 25, agility: 22, wisdom: 15, constitution: 20, charisma: 12,
    alwaysFightStrongest: true,
    actionWeights: { fight: 90, train: 5, explore: 0, ally: 0, betray: 0, rest: 5 },
  },
  {
    id: 'linghuchong', heroName: '令狐冲', faction: '华山', personalityType: 'random',
    catchphrase: '来来来，先喝一杯再打！',
    signatureLines: ['酒来！', '打完这场喝一杯？', '独孤九剑，破！', '哈哈哈哈！'],
    strength: 22, innerForce: 18, agility: 26, wisdom: 12, constitution: 14, charisma: 22,
    actionWeights: { fight: 40, train: 10, explore: 20, ally: 20, betray: 5, rest: 5 },
  },
  {
    id: 'yuebuqun', heroName: '岳不群', faction: '华山', personalityType: 'cunning',
    catchphrase: '岳某向来以和为贵。（微笑）',
    signatureLines: ['各位同道，岳某一心向善。', '误会，都是误会。', '识时务者为俊杰。'],
    strength: 18, innerForce: 20, agility: 18, wisdom: 22, constitution: 14, charisma: 24,
    betrayRound: 3,
    signDeathPactAlways: true,
    actionWeights: { fight: 10, train: 15, explore: 10, ally: 55, betray: 0, rest: 10 },
  },
  {
    id: 'fengqingyang', heroName: '风清扬', faction: '华山', personalityType: 'cautious',
    catchphrase: '剑在心中，不在手中。',
    signatureLines: ['无招胜有招。', '不必多言。', '剑意，不在剑上。'],
    strength: 25, innerForce: 28, agility: 28, wisdom: 25, constitution: 18, charisma: 12,
    neverFight: true, // 只在被攻击时反击
    actionWeights: { fight: 0, train: 50, explore: 20, ally: 10, betray: 0, rest: 20 },
  },

  // ─── 逍遥/大理（4人）───
  {
    id: 'duanyu', heroName: '段誉', faction: '大理段氏', personalityType: 'cautious',
    catchphrase: '在下不善武功……啊？',
    signatureLines: ['在下大理段誉……', '打打杀杀的不好吧？', '啊？又赢了？'],
    strength: 10, innerForce: 28, agility: 14, wisdom: 18, constitution: 12, charisma: 26,
    neverFight: true,
    actionWeights: { fight: 0, train: 20, explore: 25, ally: 50, betray: 0, rest: 5 },
  },
  {
    id: 'wangyuyan', heroName: '王语嫣', faction: '曼陀山庄', personalityType: 'cautious',
    catchphrase: '打打杀杀有什么意思呢？',
    signatureLines: ['这一招是"拈花指"。', '你们不要打了嘛。', '我只看，不动手。'],
    strength: 5, innerForce: 15, agility: 14, wisdom: 28, constitution: 8, charisma: 30,
    neverFight: true,
    actionWeights: { fight: 0, train: 40, explore: 40, ally: 15, betray: 0, rest: 5 },
  },
  {
    id: 'xuzhu', heroName: '虚竹', faction: '少林', personalityType: 'random',
    catchphrase: '又……又赢了？小僧也不知怎么回事。',
    signatureLines: ['阿弥陀佛……', '小僧不敢……', '这个……好像不太合适吧？', '啊？'],
    strength: 16, innerForce: 26, agility: 18, wisdom: 14, constitution: 16, charisma: 18,
    actionWeights: { fight: 25, train: 25, explore: 25, ally: 25, betray: 0, rest: 0 },
    // 特殊：luck_bonus = 1.5
  },
  {
    id: 'tianshan', heroName: '天山童姥', faction: '逍遥', personalityType: 'cunning',
    catchphrase: '一群废物！',
    signatureLines: ['废物！', '就这？', '不堪一击。', '哼，无聊。'],
    strength: 22, innerForce: 28, agility: 24, wisdom: 22, constitution: 14, charisma: 6,
    actionWeights: { fight: 45, train: 15, explore: 15, ally: 5, betray: 15, rest: 5 },
  },

  // ─── 魔教（4人）───
  {
    id: 'renwoxing', heroName: '任我行', faction: '魔教', personalityType: 'aggressive',
    catchphrase: '天下武功，唯我独尊！',
    signatureLines: ['吸星大法！', '谁敢不服？', '天下都是老夫的！'],
    strength: 26, innerForce: 26, agility: 16, wisdom: 18, constitution: 20, charisma: 18,
    actionWeights: { fight: 50, train: 15, explore: 10, ally: 15, betray: 5, rest: 5 },
  },
  {
    id: 'tianboguang', heroName: '田伯光', faction: '无门无派', personalityType: 'cunning',
    catchphrase: '欺负弱的怎么了？这叫效率。',
    signatureLines: ['柿子当然捡软的捏。', '别跑啊！', '嘿嘿嘿……'],
    strength: 18, innerForce: 12, agility: 28, wisdom: 10, constitution: 16, charisma: 6,
    actionWeights: { fight: 55, train: 10, explore: 15, ally: 10, betray: 5, rest: 5 },
    // 特殊：专门偷袭HP最低的
  },
  {
    id: 'dongfang', heroName: '东方不败', faction: '魔教', personalityType: 'cunning',
    catchphrase: '你们太弱了，无趣。',
    signatureLines: ['绣花针，够了。', '百无聊赖。', '也就这样了？'],
    strength: 20, innerForce: 30, agility: 30, wisdom: 20, constitution: 12, charisma: 16,
    actionWeights: { fight: 40, train: 20, explore: 15, ally: 5, betray: 15, rest: 5 },
  },
  {
    id: 'yangxiao', heroName: '杨逍', faction: '魔教', personalityType: 'aggressive',
    catchphrase: '明教左使，不屑群殴。',
    signatureLines: ['一对一，来。', '别让我看不起你。', '杨某不需要帮手。'],
    strength: 24, innerForce: 22, agility: 20, wisdom: 16, constitution: 18, charisma: 14,
    actionWeights: { fight: 55, train: 15, explore: 10, ally: 5, betray: 10, rest: 5 },
  },
];

// ============================================================
// 局内变异特质
// ============================================================

export const GAME_TRAITS: GameTrait[] = [
  { name: '暴躁', effect: 'fight 概率 +30%', modifyWeights: { fight: 30 } },
  { name: '多疑', effect: '不会 ally，betray 概率 +20%', modifyWeights: { ally: -100, betray: 20 } },
  { name: '惜命', effect: 'HP<50 时只 rest/train', modifyWeights: {} },
  { name: '嘴炮', effect: 'Hot +5/回合', modifyWeights: {} },
  { name: '赌徒', effect: 'R5 必签生死状', modifyWeights: {} },
  { name: '社交达人', effect: 'ally 概率 +40%', modifyWeights: { ally: 40 } },
  { name: '复仇心切', effect: '被攻击后下回合必 fight 攻击者', modifyWeights: {} },
  { name: '装弱', effect: '前3轮只 train，R4 起攻击力 ×1.5', modifyWeights: {} },
];

// 随机选取 N 个不重复的 NPC
export function pickRandomNpcs(count: number, exclude: string[] = []): NpcTemplate[] {
  const available = NPC_TEMPLATES.filter(t => !exclude.includes(t.id));
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// 随机分配局内特质
export function pickRandomTrait(): GameTrait {
  return GAME_TRAITS[Math.floor(Math.random() * GAME_TRAITS.length)];
}
