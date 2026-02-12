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
  // 弹幕天意关键词（带效果暗示）
  [/下毒/g, '💀 有人在暗中下毒……'],
  [/翻盘|逆袭/g, '🔄 逆天改命！'],
  [/双倍|加倍|翻倍/g, '✨ 天道加持！'],
  [/混战|大乱斗/g, '💥 天下大乱！'],
  [/休战|和平/g, '🕊️ 和平万岁！'],
  [/决斗|PK/gi, '⚔️ 来一场痛快的决斗！'],
  [/神兵|宝物|神器/g, '🗡️ 天降神兵！'],
  // 更多趣味转换
  [/吃瓜/g, '坐观风云变幻'],
  [/弱爆了/g, '三岁小童都打得过！'],
  [/秀/g, '好一个花拳绣腿！'],
  [/稳/g, '稳如泰山！'],
  [/快跑|run/gi, '三十六计走为上！'],
  [/复仇|报仇/g, '此仇不报非好汉！'],
  [/真香/g, '口嫌体正直！'],
  [/上大分/g, '一飞冲天！'],
  [/太惨了/g, '苍天无眼……'],
  [/完蛋/g, '大势已去……'],
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

export function influenceAwareDanmakuColor(text: string): 'white' | 'gold' | 'cyan' | 'red' {
  if (/下毒|毒|poison/i.test(text)) return 'red';
  if (/加油|支持|gogo/i.test(text)) return 'gold';
  if (/翻盘|逆袭|翻倍|双倍/i.test(text)) return 'cyan';
  return randomDanmakuColor();
}
