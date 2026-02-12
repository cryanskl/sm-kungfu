// ============================================================
// 弹幕文本转换：现代用语 → 武侠风
// ============================================================

const WUXIA_DICT: [RegExp, string][] = [
  [/^666+$/i, '此招妙哉！'],
  [/^nb|牛[逼比]|niubi$/i, '好一个盖世英雄！'],
  [/^gg$/i, '大势已去，英雄末路……'],
  [/^awsl|啊我死了$/i, '在下心甘情愿，死而无憾！'],
  [/^yyds|永远的神$/i, '千秋万载，一统江湖！'],
  [/^6$/i, '好手段！'],
  [/^[?？]+$/i, '此事蹊跷……'],
  [/^hh+|哈哈+$/i, '哈哈哈，痛快！'],
  [/加油/g, '少侠加把劲'],
  [/^冲[!！]*$/i, '杀——！'],
  [/打他|打她|揍他/g, '给这厮一点颜色看看！'],
  [/太强了|好强/g, '深不可测！'],
  [/太弱了|菜/g, '不过如此……'],
  [/^完了$/i, '江湖凶险……'],
  [/背叛|叛徒/g, '无耻之徒！'],
  [/结盟|联盟|盟友/g, '英雄所见略同！'],
  [/^lol|笑死$/i, '笑煞老夫！'],
  [/rip|安息/gi, '一路走好，来世再续江湖缘。'],
  [/^[!！]+$/i, '且慢！'],
  [/躺平|摆烂/g, '无为而治，亦是一种境界。'],
  [/^第一|冠军$/i, '武林至尊，号令天下！'],
  [/暴击|爆击/g, '石破天惊！'],
  [/闪避|闪了/g, '身法如鬼，无影无踪！'],
  [/支持|加油|gogo/gi, '少侠威武！'],
];

export function transformDanmaku(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';

  for (const [pattern, replacement] of WUXIA_DICT) {
    if (pattern.test(trimmed)) {
      return replacement;
    }
  }

  // 未匹配：包裹为围观群众喊话
  return `围观群众喊道：「${trimmed}」`;
}

export function randomDanmakuColor(): 'white' | 'gold' | 'cyan' {
  const r = Math.random();
  if (r < 0.6) return 'white';
  if (r < 0.85) return 'gold';
  return 'cyan';
}
