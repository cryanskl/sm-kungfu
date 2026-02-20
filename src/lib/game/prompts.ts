import { GameHeroSnapshot } from '../types';

// ============================================================
// SecondMe Prompt 模板
// ============================================================

function heroContext(self: GameHeroSnapshot, heroes: GameHeroSnapshot[]): string {
  const alive = heroes.filter(h => !h.isEliminated);
  const topRep = [...alive].sort((a, b) => b.reputation - a.reputation).slice(0, 3);
  const allyName = self.allyHeroId
    ? heroes.find(h => h.heroId === self.allyHeroId)?.heroName || '无'
    : '无';

  return `你是「${self.heroName}」，${self.faction}门派，${self.catchphrase}
你的HP：${self.hp}/100，声望：${self.reputation}，热搜：${self.hot}
你的盟友：${allyName}
声望前三：${topRep.map((h, i) => `${i + 1}.${h.heroName}(${h.reputation})`).join('、')}
场上存活：${alive.length}人`;
}

// --- 通用回合决策 ---
export function roundPrompt(
  roundNum: number,
  self: GameHeroSnapshot,
  heroes: GameHeroSnapshot[],
  directorEvent: string,
  availableActions: string[],
): string {
  return `${heroContext(self, heroes)}

【第${roundNum}回合】${directorEvent}

这局很短（只有6回合），每一步都很关键。
可选行动：${availableActions.join(' / ')}

根据你的性格做出选择。返回 JSON：
{
  "action": "你的行动",
  "target": "目标英雄名（fight/ally/betray时必填，否则null）",
  "taunt": "对外宣言（15字内，武侠风格）",
  "reason": "内心独白（15字内）"
}
只返回上述 JSON，不要其他内容。`;
}

// --- R2 拜师宣言 ---
export function speechPrompt(self: GameHeroSnapshot): string {
  return `你是「${self.heroName}」，${self.faction}门派。
你正在武林大会上拜师少林方丈。请用一句话（15字以内）表达你为什么配做他的弟子。
要求：符合你的性格，可以霸气/搞笑/谦逊/中二，但不要现代网络用语。
只返回这一句话，不要引号和其他内容。`;
}

// --- R5 生死状 ---
export function deathPactPrompt(self: GameHeroSnapshot, heroes: GameHeroSnapshot[]): string {
  const rank = [...heroes]
    .filter(h => !h.isEliminated)
    .sort((a, b) => b.reputation - a.reputation)
    .findIndex(h => h.heroId === self.heroId) + 1;

  return `${heroContext(self, heroes)}

【第5回合 · 生死状】
生死状已开！签字后你的攻击翻倍、可用绝招，但输了立刻退场。
不签则安全，但观众会失望（声望和热搜都会下降）。

你的声望排名：第${rank}名

根据你的性格选择。返回 JSON：
{
  "sign_death_pact": true或false,
  "action": "fight/train/rest",
  "target": "对手名（如果选fight）",
  "taunt": "一句话（15字内）",
  "reason": "内心独白（15字内）"
}
只返回上述 JSON，不要其他内容。`;
}

// --- 开场狠话 ---
export function introPrompt(heroName: string, faction: string): string {
  return `你是「${heroName}」，${faction}门派的侠客。
你正在武林大会的开场亮相环节。请用一句狠话（20字以内）震慑全场。
要求：武侠风格，体现你的性格，不要现代网络用语。
只返回这一句话。`;
}

// --- R6 决赛出招 ---
export function finalsPrompt(self: GameHeroSnapshot, opponentName: string): string {
  return `你是「${self.heroName}」，正在武林盟主决赛中对阵「${opponentName}」。
你的HP：${self.hp}，对手正蓄势待发。

选择出招：
- attack（攻）：直接攻击，克制绝招
- defend（守）：以逸待劳，克制攻
- ultimate（绝招）：使出绝技，克制守
- bluff（诈）：虚张声势，误导对手

返回 JSON：
{ "move": "attack/defend/ultimate/bluff", "taunt": "一句话（15字内）" }
只返回 JSON。`;
}

// --- 封神榜背景故事（真人玩家） ---
export function bioPrompt(heroName: string, faction: string): string {
  return `你是「${heroName}」，${faction}门派的侠客。
请为自己写一段江湖背景故事（40-60字），武侠风格，介绍你的来历和特点。
要求：第三人称，不要现代用语，体现武侠世界观。
只返回这段背景故事，不要其他内容。`;
}

// --- 封神榜背景故事 fallback（SecondMe 生成失败时用模板兜底）---
const FACTION_BIO_TEMPLATES: Record<string, string[]> = {
  '少林': [
    '{name}自幼入少林，苦修二十年，铁拳铜臂，寺中武僧皆敬其三分。虽沉默寡言，出手必惊四座。',
    '{name}本是少林弃婴，由方丈亲自抚养长大。天赋异禀，三年便悟透罗汉拳精髓，江湖皆传其名。',
    '{name}曾是少林藏经阁杂役，无人知其来历。一朝出世，武功深不可测，令群豪侧目。',
  ],
  '武当': [
    '{name}少年时偶入武当山，得真人传授太极心法。性情淡然如水，出剑却快如惊雷。',
    '{name}武当山修道十载，悟得阴阳之理。下山之日，真人赠其古剑一柄，嘱其匡扶正义。',
    '{name}本是世家子弟，因厌倦纷争遁入武当。太极剑法初成，便有行走江湖之念。',
  ],
  '峨眉': [
    '{name}峨眉金顶长大，师承峨眉绝学。外柔内刚，一手峨眉刺法出神入化，江湖少有敌手。',
    '{name}自幼随师在峨眉修行，性格刚烈果决。虽年纪尚轻，剑术已入化境，不容小觑。',
    '{name}峨眉弟子中的异类，不拘礼法，独创一路奇诡剑法。师门长辈对其又爱又恨。',
  ],
  '华山': [
    '{name}华山论剑中崭露头角的新秀，剑法凌厉，招招致命。虽年少轻狂，实力不容小觑。',
    '{name}华山派剑气二宗之争中脱颖而出，独辟蹊径，自创一路剑意。人称"华山怪才"。',
    '{name}自幼在华山绝壁上练剑，以飞鸟为师。其剑法轻灵飘逸，如行云流水，不落痕迹。',
  ],
  '逍遥': [
    '{name}逍遥派传人，精通奇门遁甲之术。行事飘忽不定，江湖中人难窥其真面目。',
    '{name}师承逍遥，学贯百家。琴棋书画无一不精，武功更是深藏不露，文武双全。',
    '{name}逍遥门下最年轻的弟子，天资聪颖。虽入门日浅，悟性却远超同辈。',
  ],
  '大理': [
    '{name}大理段氏旁支，虽不习六脉神剑，却自悟一身独特内力。为人洒脱，行侠仗义。',
    '{name}出身大理皇族，不恋荣华富贵，偏要闯荡江湖。一身段氏剑法，尽显皇家风范。',
    '{name}大理天龙寺俗家弟子，习得一阳指三成功力。下山历练，誓要在武林闯出名堂。',
  ],
  '魔教': [
    '{name}魔教中特立独行之辈，不服教规，只信拳头。虽被正道不齿，却有自己的江湖道义。',
    '{name}少年时被魔教收养，习得一身诡异武功。亦正亦邪，江湖中人对其褒贬不一。',
    '{name}魔教新一代翘楚，武功路数阴狠凌厉。虽名为魔教中人，行事自有章法。',
  ],
};

const GENERIC_BIO_TEMPLATES = [
  '{name}出身{faction}，性情独特。初出茅庐便敢闯武林大会，胆识过人，前途不可限量。',
  '{name}行走江湖多年，{faction}门下弟子。为人低调却暗藏锋芒，知其深浅者寥寥无几。',
  '{name}本是乡野少年，偶入{faction}门下，苦练成才。一朝入世，便要在武林闯出天地。',
];

export function generateFallbackBio(heroName: string, faction: string): string {
  const templates = FACTION_BIO_TEMPLATES[faction] || GENERIC_BIO_TEMPLATES;
  const tpl = templates[Math.floor(Math.random() * templates.length)];
  return tpl.replace(/\{name\}/g, heroName).replace(/\{faction\}/g, faction);
}

// --- 导演事件描述 ---
type DirectorEvent = {
  title: string;
  description: string;
  flavor: string;
  availableActions: string[];
};

// 每回合变体池：R1-R4 各有 2-3 个变体，R5/R6 机制绑定不变
const DIRECTOR_EVENT_VARIANTS: Record<number, DirectorEvent[]> = {
  1: [
    {
      title: '残卷落地',
      description: '《九阴真经》残卷从天而降！只够3人拿！选explore去抢，选fight硬夺！',
      flavor: '一阵狂风吹过擂台，三卷泛黄的经书从天际飘落——正是失传百年的《九阴真经》残卷！各路英雄瞬间红了眼，一场腥风血雨在所难免。',
      availableActions: ['fight', 'explore', 'train', 'ally'],
    },
    {
      title: '藏宝图现世',
      description: '一张古老藏宝图被风吹到擂台上！选explore寻宝，选fight抢夺，选ally合伙！',
      flavor: '不知从何处飘来一张残破羊皮地图，上面标注着某位前辈高人的毕生收藏。宝藏只有一份，但觊觎者却有十二位——夺宝大战即刻打响！',
      availableActions: ['fight', 'explore', 'ally', 'train'],
    },
    {
      title: '毒泉涌现',
      description: '擂台下涌出五色毒泉！选train运功抵御，选explore采毒为己用，选fight趁乱偷袭！',
      flavor: '大地震颤，擂台四角涌出五色斑斓的毒泉，毒雾弥漫。有人捂鼻后退，有人却眼放精光——这五毒之精若能炼化，便是至强的暗器毒药。乱局之下，各怀心思。',
      availableActions: ['train', 'explore', 'fight', 'ally'],
    },
  ],
  2: [
    {
      title: '方丈收徒',
      description: '少林方丈今日只收一名关门弟子！选train发表拜师宣言，其他人自由行动。',
      flavor: '少林方丈空闻大师亲临擂台，目光如炬扫过众人。他宣布：今日只收一名关门弟子，传授毕生绝学。各路英雄纷纷摩拳擦掌，一时间拜师宣言此起彼伏。',
      availableActions: ['train', 'fight', 'explore', 'ally'],
    },
    {
      title: '论武大会',
      description: '武当张真人设擂论武！选train切磋武学，选fight实战比拼，选ally以武会友！',
      flavor: '一位白发老道飘然而至，正是武当张三丰真人。他在擂台中央盘膝而坐："今日不论门派，只论武道。"各路英雄纷纷施展毕生绝学，一场武学盛宴拉开帷幕。',
      availableActions: ['train', 'fight', 'ally', 'explore'],
    },
  ],
  3: [
    {
      title: '盟约公开',
      description: '导演组公开所有联盟关系！背叛按钮已开放——偷走盟友30%资源！',
      flavor: '一封密信被人截获，所有同盟关系大白于天下！昔日的盟友此刻面面相觑——是继续携手，还是趁机反戈一击？背叛的暗影笼罩着每一个人。',
      availableActions: ['fight', 'ally', 'betray', 'train'],
    },
    {
      title: '无间风云',
      description: '有人在各派安插了内应！背叛可获双倍声望，但失败代价也更大！',
      flavor: '一名蒙面人在暗处散布密报：各门各派中都潜伏着对方的卧底！一时间人人自危，信任崩塌。在这尔虞我诈的乱局中，是坚守道义还是趁火打劫？',
      availableActions: ['betray', 'fight', 'ally', 'train'],
    },
    {
      title: '英雄宴',
      description: '主办方设宴犒赏群雄！宴席上暗流涌动——是把酒言欢还是杯酒藏刀？',
      flavor: '擂台变为宴席，美酒佳肴堆满长桌。主办方笑道："今日只谈风月，不论恩仇。"然而觥筹交错之间，刀光在袖中若隐若现。这一杯酒，是敬英雄，还是送行酒？',
      availableActions: ['ally', 'betray', 'fight', 'train'],
    },
  ],
  4: [
    {
      title: '通缉令',
      description: '声望第一被挂上江湖通缉令！击败他获50声望！但通缉犯有侠义光环加持！',
      flavor: '城门口贴出了一张鲜红的通缉令——声望最高者赫然在列！赏金丰厚，引得众人蠢蠢欲动。但通缉犯岂是易与之辈？侠义光环护身，实力更胜一筹。',
      availableActions: ['fight', 'train', 'ally', 'rest'],
    },
    {
      title: '天降横财',
      description: '一只金雕从天而降，爪中抓着三件神兵！选explore争夺，选fight围猎金雕！',
      flavor: '一声鹰啸划破长空，一只浑身金羽的巨雕盘旋而下，利爪中紧攥三件闪烁寒光的兵器。传说这是前朝武林盟主的随身宝物——谁能抢到手，便是天意所归。',
      availableActions: ['explore', 'fight', 'train', 'rest'],
    },
    {
      title: '武林公审',
      description: '六扇门突然介入！声望最高者被审！其他人可声援或落井下石！',
      flavor: '一队官兵鱼贯而入，为首的铁面判官冷声宣布："奉朝廷旨意，声望最高者涉嫌江湖作乱，即刻受审！"群雄哗然——是仗义执言，还是趁机踩一脚？',
      availableActions: ['fight', 'ally', 'train', 'rest'],
    },
  ],
};

// R5/R6 固定不变（机制绑定）
const FIXED_EVENTS: Record<number, DirectorEvent> = {
  5: {
    title: '生死状',
    description: '生死状已开！签字攻击翻倍+绝招解锁，但输了直接退场！不签则安全但掉声望。',
    flavor: '擂台中央摆出了一张血红的生死状。签字者攻击翻倍、绝招解锁，但败者立刻退场，绝无翻盘之机。不签者虽得安全，却将被观众视为怯懦之辈。是生是死，一念之间。',
    availableActions: ['fight', 'train', 'rest'],
  },
  6: {
    title: '盟主加冕战',
    description: '声望前2+热搜前2=四强！半决赛+决赛，一招定胜负！',
    flavor: '号角响彻云霄，最终的时刻到来！声望与热搜各取前二，四位绝世高手踏上盟主争夺战的擂台。攻守绝诈，一招定乾坤！武林至尊之位，今日必有所归。',
    availableActions: ['attack', 'defend', 'ultimate', 'bluff'],
  },
};

// 根据 gameId 确定性选择变体
function pickVariant(gameId: string, roundNumber: number): DirectorEvent {
  if (FIXED_EVENTS[roundNumber]) return FIXED_EVENTS[roundNumber];
  const variants = DIRECTOR_EVENT_VARIANTS[roundNumber];
  if (!variants || variants.length === 0) return FIXED_EVENTS[5]; // fallback
  let hash = 0;
  const seed = `${gameId}:director:${roundNumber}`;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return variants[Math.abs(hash) % variants.length];
}

// 兼容旧代码：默认使用第一个变体
export const DIRECTOR_EVENTS: Record<number, DirectorEvent> = {
  1: DIRECTOR_EVENT_VARIANTS[1][0],
  2: DIRECTOR_EVENT_VARIANTS[2][0],
  3: DIRECTOR_EVENT_VARIANTS[3][0],
  4: DIRECTOR_EVENT_VARIANTS[4][0],
  5: FIXED_EVENTS[5],
  6: FIXED_EVENTS[6],
};

// 需要 gameId 的调用方用这个
export function getDirectorEvent(roundNumber: number, gameId?: string): DirectorEvent {
  if (!gameId) return DIRECTOR_EVENTS[roundNumber];
  return pickVariant(gameId, roundNumber);
}
