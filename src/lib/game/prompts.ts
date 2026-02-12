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

// --- 导演事件描述 ---
export const DIRECTOR_EVENTS: Record<number, {
  title: string;
  description: string;
  flavor: string;
  availableActions: string[];
}> = {
  1: {
    title: '残卷落地',
    description: '《九阴真经》残卷从天而降！只够3人拿！选explore去抢，选fight硬夺！',
    flavor: '一阵狂风吹过擂台，三卷泛黄的经书从天际飘落——正是失传百年的《九阴真经》残卷！各路英雄瞬间红了眼，一场腥风血雨在所难免。',
    availableActions: ['fight', 'explore', 'train', 'ally'],
  },
  2: {
    title: '方丈收徒',
    description: '少林方丈今日只收一名关门弟子！选train发表拜师宣言，其他人自由行动。',
    flavor: '少林方丈空闻大师亲临擂台，目光如炬扫过众人。他宣布：今日只收一名关门弟子，传授毕生绝学。各路英雄纷纷摩拳擦掌，一时间拜师宣言此起彼伏。',
    availableActions: ['train', 'fight', 'explore', 'ally'],
  },
  3: {
    title: '盟约公开',
    description: '导演组公开所有联盟关系！背叛按钮已开放——偷走盟友30%资源！',
    flavor: '一封密信被人截获，所有同盟关系大白于天下！昔日的盟友此刻面面相觑——是继续携手，还是趁机反戈一击？背叛的暗影笼罩着每一个人。',
    availableActions: ['fight', 'ally', 'betray', 'train'],
  },
  4: {
    title: '通缉令',
    description: '声望第一被挂上江湖通缉令！击败他获50声望！但通缉犯有侠义光环加持！',
    flavor: '城门口贴出了一张鲜红的通缉令——声望最高者赫然在列！赏金丰厚，引得众人蠢蠢欲动。但通缉犯岂是易与之辈？侠义光环护身，实力更胜一筹。',
    availableActions: ['fight', 'train', 'ally', 'rest'],
  },
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
