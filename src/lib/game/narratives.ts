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
  (name: string) => `${name}在古松下舞剑百遍，身剑合一。`,
  (name: string) => `${name}双掌抵地，将真气灌入大地又收回，循环不息。`,
  (name: string) => `${name}以指代笔，在沙地上反复演练剑招，收放自如。`,
  (name: string) => `${name}负石登山，以苦修之法锤炼体魄。`,
  (name: string) => `${name}闭关一日，出关时眼中多了一分锐利。`,
  (name: string) => `${name}在深潭边凝视水面，从涟漪中悟出步法玄机。`,
  (name: string) => `${name}取木为桩，练了三百拳，拳拳带风。`,
  (name: string) => `${name}吐纳之间，周身穴道微微发热，功力又深一层。`,
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
  (name: string) => `${name}枕着包袱在草地上呼呼大睡，鼾声如雷。`,
  (name: string) => `${name}让客栈伙计打来热水泡脚，浑身舒坦。`,
  (name: string) => `${name}在河畔垂钓，半日未上一条鱼，心境却平和了许多。`,
  (name: string) => `${name}嚼了两粒丹药，闭目养神，气色渐复。`,
  (name: string) => `${name}在破庙中生了堆篝火，烤着干粮慢慢恢复。`,
  (name: string) => `${name}对着明月独酌三杯，伤痛似乎淡了几分。`,
  (name: string) => `${name}找了一处避风的山洞，蜷缩着补了一觉。`,
  (name: string) => `${name}将伤口用草药包扎好，躺在草垛上歇息。`,
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
  (att: string, def: string, dmg: number) => `${att}怒喝"受死！"，双掌齐出拍向${def}，震得地面龟裂！${dmg}伤害！`,
  (att: string, def: string, dmg: number) => `${att}暗运内力，一指点向${def}命门穴！${def}闷哼一声，损失${dmg}HP！`,
  (att: string, def: string, dmg: number) => `${att}身形如鬼魅般闪至${def}身后，一掌劈下！${def}猝不及防，${dmg}伤害！`,
  (att: string, def: string, dmg: number) => `${att}抄起地上碎石掷向${def}，随即欺身而上，连出三拳！${dmg}伤害！`,
  (att: string, def: string, dmg: number) => `${att}与${def}四目相对，杀气弥漫。${att}率先出手，一记重拳！${dmg}伤害！`,
  (att: string, def: string, dmg: number) => `${att}脚踏七星步，剑走偏锋直取${def}咽喉！${def}侧身勉强躲过要害，仍受${dmg}伤害！`,
  (att: string, def: string, dmg: number) => `${att}双拳连环出击，拳风呼啸如雷！${def}格挡不住，被轰退数丈！${dmg}伤害！`,
  (att: string, def: string, dmg: number) => `"今日不分胜负誓不罢休！"${att}猛扑向${def}，刀光一闪，${dmg}伤害！`,
];

// --- 围攻 ---
const GANG_UP_NARRATIVES = [
  (names: string, def: string, dmg: number) => `${names}围攻${def}！总伤害${dmg}！`,
  (names: string, def: string, dmg: number) => `${names}联手夹击${def}！${def}腹背受敌，累计${dmg}伤害！`,
  (names: string, def: string, dmg: number) => `${names}从四面八方包围${def}！招招致命，共造成${dmg}伤害！`,
  (names: string, def: string, dmg: number) => `${names}默契配合，将${def}打得毫无还手之力！${dmg}伤害！`,
  (names: string, def: string, dmg: number) => `${names}形成合围之势，${def}左支右绌，苦不堪言！${dmg}伤害！`,
  (names: string, def: string, dmg: number) => `${names}同时出手，刀光剑影交织成网！${def}无路可退，承受${dmg}伤害！`,
  (names: string, def: string, dmg: number) => `"一起上！"${names}蜂拥而至，${def}以一敌多，终究力有不逮！${dmg}伤害！`,
  (names: string, def: string, dmg: number) => `${names}前后夹击，${def}虽奋力抵抗，仍被打得连连后退！${dmg}伤害！`,
];

// --- 反击 ---
const COUNTER_NARRATIVES = [
  (def: string, att: string, dmg: number) => `${def}反击！${att}受到${dmg}反伤！`,
  (def: string, att: string, dmg: number) => `${def}绝境爆发，一掌震退${att}！${att}受伤${dmg}！`,
  (def: string, att: string, dmg: number) => `${def}以退为进，趁隙反击${att}！造成${dmg}反伤！`,
  (def: string, att: string, dmg: number) => `${def}怒吼一声，气势暴涨！${att}猝不及防，受创${dmg}！`,
  (def: string, att: string, dmg: number) => `${def}虚晃一招引${att}露出破绽，随即反手一击！${dmg}反伤！`,
  (def: string, att: string, dmg: number) => `"你也尝尝这滋味！"${def}借力打力，${att}被自己的劲力震飞！${dmg}反伤！`,
  (def: string, att: string, dmg: number) => `${def}双臂交叉硬挡一击，随即膝顶${att}腹部！${att}痛呼出声，${dmg}反伤！`,
  (def: string, att: string, dmg: number) => `${def}侧身闪过攻击，顺势一肘击中${att}后背！${dmg}反伤！`,
];

// --- 结盟 ---
const ALLY_NARRATIVES = [
  (a: string, b: string) => `${a}与${b}结为同盟！`,
  (a: string, b: string) => `${a}与${b}歃血为盟，誓同进退！`,
  (a: string, b: string) => `${a}向${b}递出酒杯，二人结为莫逆之交！`,
  (a: string, b: string) => `${a}与${b}相视一笑，达成默契联盟！`,
  (a: string, b: string) => `${a}拱手抱拳："今日起，你我肝胆相照！"${b}欣然应允。`,
  (a: string, b: string) => `${a}与${b}在月下对饮三杯，从此以兄弟相称！`,
  (a: string, b: string) => `${a}将随身佩剑赠予${b}，${b}回赠一枚玉佩，二人结盟！`,
  (a: string, b: string) => `${a}与${b}击掌为誓：不求同年同月生，但求并肩闯江湖！`,
];

// --- 背叛 ---
const BETRAY_NARRATIVES = [
  (a: string, b: string, rep: number) => `${a}背叛了盟友${b}！偷走${rep}声望！江湖震动！`,
  (a: string, b: string, rep: number) => `${a}暗中下毒手，背刺盟友${b}！掠走${rep}声望！`,
  (a: string, b: string, rep: number) => `${a}翻脸无情，将${b}的${rep}声望据为己有！`,
  (a: string, b: string, rep: number) => `${a}趁${b}不备，抽刀相向！窃取${rep}声望，同盟破裂！`,
  (a: string, b: string, rep: number) => `"对不住了。"${a}冷笑一声，将${b}推下悬崖！掠夺${rep}声望！`,
  (a: string, b: string, rep: number) => `${a}在酒中下了迷药，${b}昏睡之际被洗劫一空！${rep}声望易主！`,
  (a: string, b: string, rep: number) => `${a}面带笑容递过毒酒，${b}毫无防备饮下——${rep}声望被夺！`,
  (a: string, b: string, rep: number) => `昔日的誓言化为泡影！${a}对${b}反戈一击，${rep}声望被强取！天下皆惊！`,
];

// --- 淘汰 ---
const ELIMINATED_NARRATIVES = [
  (name: string) => `${name}重伤退场！`,
  (name: string) => `${name}伤重不支，含恨退场！`,
  (name: string) => `${name}气血耗尽，被抬下擂台！`,
  (name: string) => `${name}倒地不起，本届武林大会之旅到此为止。`,
  (name: string) => `${name}一口鲜血喷出，再无战力，黯然离场。`,
  (name: string) => `${name}单膝跪地，摇了摇头："今日……技不如人。"随后被弟子搀扶下台。`,
  (name: string) => `${name}强撑着站起来，又重重倒下。这次，再也没有站起来。`,
  (name: string) => `${name}拱手向四方行礼："承让。"说罢转身踉跄离去，背影萧索。`,
  (name: string) => `${name}口吐鲜血，仰天长叹："此生恨短，未能称霸武林！"`,
  (name: string) => `裁判高举红旗——${name}伤势过重，被判退出比赛！`,
];

// --- 残卷争夺胜出 ---
const SCRAMBLE_WIN_NARRATIVES = [
  (name: string, art: string, bonus: number) => `${name}抢到残卷！获得「${art}」（攻击+${bonus}）`,
  (name: string, art: string, bonus: number) => `${name}身手敏捷，一把夺下残卷！习得「${art}」！攻击+${bonus}！`,
  (name: string, art: string, bonus: number) => `${name}在混战中脱颖而出，残卷到手！「${art}」攻击+${bonus}！`,
  (name: string, art: string, bonus: number) => `${name}飞身跃过众人头顶，凌空一抓便将残卷收入怀中！「${art}」攻击+${bonus}！`,
  (name: string, art: string, bonus: number) => `${name}以巧劲拨开所有竞争者，残卷落入掌中！习得「${art}」，攻击+${bonus}！`,
  (name: string, art: string, bonus: number) => `千钧一发之际，${name}指尖触到残卷边缘，顺势一卷——到手！「${art}」攻击+${bonus}！`,
];

// --- 残卷争夺失败 ---
const SCRAMBLE_LOSE_NARRATIVES = [
  (name: string, hp: number) => `${name}混战落败，损失${hp}HP`,
  (name: string, hp: number) => `${name}争抢残卷不成，反被波及，损失${hp}HP`,
  (name: string, hp: number) => `${name}扑了个空，还挨了一肘，失去${hp}HP`,
  (name: string, hp: number) => `${name}眼看残卷就要到手，却被人一脚踹开！损失${hp}HP`,
  (name: string, hp: number) => `${name}在人群中被挤得东倒西歪，残卷没抢到，还被踩了一脚！-${hp}HP`,
  (name: string, hp: number) => `${name}奋力一跃却抓了个空，摔了个结结实实！损失${hp}HP`,
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
