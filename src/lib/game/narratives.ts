// ============================================================
// 叙事话术模板池 — 让每回合文字不重复
// ============================================================

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// --- 修炼 ---
const TRAIN_NARRATIVES = [
  (name: string) => `${name}潜心修炼，内力精进。`,
  (name: string) => `${name}闭目调息，真气在经脉中缓缓流转。`,
  (name: string) => `${name}独坐山巅，参悟武学至理。`,
  (name: string) => `${name}在瀑布下苦练，招式愈发凌厉。`,
  (name: string) => `${name}盘膝运功，丹田气海翻涌。`,
  (name: string) => `${name}以枯叶为剑，反复演练招式。`,
  (name: string) => `${name}面壁静坐，心境又上一层。`,
  (name: string) => `${name}仰望星辰，领悟了一丝剑意。`,
  (name: string) => `${name}在密林中打坐，周身灵气环绕。`,
  (name: string) => `${name}以石为纸，默写心法口诀。`,
];

// --- 休息 ---
const REST_NARRATIVES = [
  (name: string) => `${name}在客栈歇息，恢复体力。`,
  (name: string) => `${name}找了棵老树靠着打盹，养精蓄锐。`,
  (name: string) => `${name}在溪边饮酒小憩，伤势渐愈。`,
  (name: string) => `${name}躺在客栈屋顶数星星，伤口慢慢愈合。`,
  (name: string) => `${name}点了一桌好菜，大快朵颐恢复元气。`,
  (name: string) => `${name}泡了个温泉，浑身筋骨舒展开来。`,
  (name: string) => `${name}盘腿疗伤，内息渐趋平稳。`,
  (name: string) => `${name}在茶馆品茶歇脚，静待时机。`,
];

// --- 1v1 战斗 ---
const FIGHT_NARRATIVES = [
  (att: string, def: string, dmg: number) => `${att}挑战${def}！造成${dmg}伤害！`,
  (att: string, def: string, dmg: number) => `${att}一剑刺向${def}，${def}闪避不及，受创${dmg}！`,
  (att: string, def: string, dmg: number) => `${att}与${def}交手三招，${def}落于下风，损失${dmg}HP！`,
  (att: string, def: string, dmg: number) => `${att}出其不意偷袭${def}，一击命中！${dmg}伤害！`,
  (att: string, def: string, dmg: number) => `${att}大喝一声，掌风直扑${def}！${def}硬接一掌，受创${dmg}！`,
  (att: string, def: string, dmg: number) => `${att}使出看家本领，将${def}逼退数步！造成${dmg}伤害！`,
  (att: string, def: string, dmg: number) => `${att}飞身跃起，凌空一脚踢中${def}！${dmg}伤害！`,
  (att: string, def: string, dmg: number) => `${att}与${def}缠斗数合，最终占据上风，造成${dmg}伤害！`,
  (att: string, def: string, dmg: number) => `${att}拔剑出鞘，电光石火间${def}已中一剑！${dmg}伤害！`,
  (att: string, def: string, dmg: number) => `${att}运起十成功力，一拳轰向${def}！${def}后退三步，损失${dmg}HP！`,
];

// --- 围攻 ---
const GANG_UP_NARRATIVES = [
  (names: string, def: string, dmg: number) => `${names}围攻${def}！总伤害${dmg}！`,
  (names: string, def: string, dmg: number) => `${names}联手夹击${def}！${def}腹背受敌，累计${dmg}伤害！`,
  (names: string, def: string, dmg: number) => `${names}从四面八方包围${def}！招招致命，共造成${dmg}伤害！`,
  (names: string, def: string, dmg: number) => `${names}默契配合，将${def}打得毫无还手之力！${dmg}伤害！`,
];

// --- 反击 ---
const COUNTER_NARRATIVES = [
  (def: string, att: string, dmg: number) => `${def}反击！${att}受到${dmg}反伤！`,
  (def: string, att: string, dmg: number) => `${def}绝境爆发，一掌震退${att}！${att}受伤${dmg}！`,
  (def: string, att: string, dmg: number) => `${def}以退为进，趁隙反击${att}！造成${dmg}反伤！`,
  (def: string, att: string, dmg: number) => `${def}怒吼一声，气势暴涨！${att}猝不及防，受创${dmg}！`,
];

// --- 结盟 ---
const ALLY_NARRATIVES = [
  (a: string, b: string) => `${a}与${b}结为同盟！`,
  (a: string, b: string) => `${a}与${b}歃血为盟，誓同进退！`,
  (a: string, b: string) => `${a}向${b}递出酒杯，二人结为莫逆之交！`,
  (a: string, b: string) => `${a}与${b}相视一笑，达成默契联盟！`,
];

// --- 背叛 ---
const BETRAY_NARRATIVES = [
  (a: string, b: string, rep: number) => `${a}背叛了盟友${b}！偷走${rep}声望！江湖震动！`,
  (a: string, b: string, rep: number) => `${a}暗中下毒手，背刺盟友${b}！掠走${rep}声望！`,
  (a: string, b: string, rep: number) => `${a}翻脸无情，将${b}的${rep}声望据为己有！`,
  (a: string, b: string, rep: number) => `${a}趁${b}不备，抽刀相向！窃取${rep}声望，同盟破裂！`,
];

// --- 淘汰 ---
const ELIMINATED_NARRATIVES = [
  (name: string) => `${name}重伤退场！`,
  (name: string) => `${name}伤重不支，含恨退场！`,
  (name: string) => `${name}气血耗尽，被抬下擂台！`,
  (name: string) => `${name}倒地不起，本届武林大会之旅到此为止。`,
  (name: string) => `${name}一口鲜血喷出，再无战力，黯然离场。`,
];

// --- 残卷争夺胜出 ---
const SCRAMBLE_WIN_NARRATIVES = [
  (name: string, art: string, bonus: number) => `${name}抢到残卷！获得「${art}」（攻击+${bonus}）`,
  (name: string, art: string, bonus: number) => `${name}身手敏捷，一把夺下残卷！习得「${art}」！攻击+${bonus}！`,
  (name: string, art: string, bonus: number) => `${name}在混战中脱颖而出，残卷到手！「${art}」攻击+${bonus}！`,
];

// --- 残卷争夺失败 ---
const SCRAMBLE_LOSE_NARRATIVES = [
  (name: string, hp: number) => `${name}混战落败，损失${hp}HP`,
  (name: string, hp: number) => `${name}争抢残卷不成，反被波及，损失${hp}HP`,
  (name: string, hp: number) => `${name}扑了个空，还挨了一肘，失去${hp}HP`,
];

// 导出便捷函数
export const narratives = {
  train: (name: string) => pick(TRAIN_NARRATIVES)(name),
  rest: (name: string) => pick(REST_NARRATIVES)(name),
  fight: (att: string, def: string, dmg: number) => pick(FIGHT_NARRATIVES)(att, def, dmg),
  gangUp: (names: string, def: string, dmg: number) => pick(GANG_UP_NARRATIVES)(names, def, dmg),
  counter: (def: string, att: string, dmg: number) => pick(COUNTER_NARRATIVES)(def, att, dmg),
  ally: (a: string, b: string) => pick(ALLY_NARRATIVES)(a, b),
  betray: (a: string, b: string, rep: number) => pick(BETRAY_NARRATIVES)(a, b, rep),
  eliminated: (name: string) => pick(ELIMINATED_NARRATIVES)(name),
  scrambleWin: (name: string, art: string, bonus: number) => pick(SCRAMBLE_WIN_NARRATIVES)(name, art, bonus),
  scrambleLose: (name: string, hp: number) => pick(SCRAMBLE_LOSE_NARRATIVES)(name, hp),
};
