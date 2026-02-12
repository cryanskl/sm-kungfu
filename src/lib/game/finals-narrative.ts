import { FinalsMove } from '../types';

// ============================================================
// 角色专属招式名（金庸武侠风）
// ============================================================

const HERO_MOVES: Record<string, Record<string, string>> = {
  kongjian:      { attack: '大力金刚掌', defend: '金钟罩', ultimate: '龙爪手', bluff: '枯禅入定' },
  tieluohan:     { attack: '伏虎拳', defend: '铁臂功', ultimate: '罗汉伏魔功', bluff: '金刚怒目' },
  jielv:         { attack: '达摩剑法', defend: '韦陀掌', ultimate: '大力金刚指', bluff: '狮子吼' },
  saodi:         { attack: '无相劫指', defend: '般若掌', ultimate: '一指禅', bluff: '枯坐如山' },
  zhangsanfeng:  { attack: '太极拳', defend: '武当绵掌', ultimate: '太极神功', bluff: '四两拨千斤' },
  qingfeng:      { attack: '武当长拳', defend: '柔云剑法', ultimate: '纯阳无极功', bluff: '道法自然' },
  xuanming_l:    { attack: '玄冥神掌', defend: '寒冰真气', ultimate: '冰火两重天', bluff: '寒气逼人' },
  xuanming_r:    { attack: '玄冥神掌', defend: '寒冰护体', ultimate: '天地同寒', bluff: '冰封万里' },
  miejue:        { attack: '峨眉剑法', defend: '倚天剑势', ultimate: '金顶绵掌', bluff: '灭绝一怒' },
  zhiruo:        { attack: '九阴白骨爪', defend: '峨眉心法', ultimate: '摧心掌', bluff: '楚楚可怜' },
  xiaozhao:      { attack: '圣火令', defend: '乾坤大挪移', ultimate: '波斯明教秘术', bluff: '弱柳扶风' },
  guoxiang:      { attack: '落英神剑掌', defend: '天罗地网势', ultimate: '黯然销魂掌', bluff: '嬉笑怒骂' },
  dugu:          { attack: '独孤九剑·破剑式', defend: '独孤九剑·总诀式', ultimate: '独孤九剑·破气式', bluff: '无剑胜有剑' },
  linghuchong:   { attack: '独孤九剑', defend: '冲灵剑法', ultimate: '吸星大法', bluff: '醉酒剑法' },
  yuebuqun:      { attack: '华山剑法', defend: '紫霞神功', ultimate: '辟邪剑法', bluff: '君子之风' },
  fengqingyang:  { attack: '无招胜有招', defend: '破尽天下武功', ultimate: '独孤真意', bluff: '剑意杀人' },
  duanyu:        { attack: '六脉神剑', defend: '一阳指', ultimate: '六脉齐发', bluff: '凌波微步' },
  wangyuyan:     { attack: '看破武学', defend: '点评招式', ultimate: '看穿弱点', bluff: '以学识服人' },
  xuzhu:         { attack: '天山折梅手', defend: '小无相功', ultimate: '生死符', bluff: '误打误撞' },
  tianshan:      { attack: '天山六阳掌', defend: '八荒六合功', ultimate: '生死符·十方俱灭', bluff: '返老还童' },
  renwoxing:     { attack: '吸星大法', defend: '吸星反噬', ultimate: '天下归一', bluff: '霸气外露' },
  tianboguang:   { attack: '快刀', defend: '轻功闪避', ultimate: '一刀十三斩', bluff: '耍赖' },
  dongfang:      { attack: '葵花宝典·飞针', defend: '鬼影步', ultimate: '天外飞仙', bluff: '绣花针戏弄' },
  yangxiao:      { attack: '弹指神通', defend: '乾坤大挪移', ultimate: '大挪移第七层', bluff: '左右互搏' },
};

const FACTION_MOVES: Record<string, Record<string, string>> = {
  '少林':       { attack: '少林长拳', defend: '金钟罩', ultimate: '少林绝学', bluff: '佛门心法' },
  '武当':       { attack: '太极拳', defend: '武当剑法', ultimate: '武当绝学', bluff: '道家心法' },
  '峨眉':       { attack: '峨眉剑法', defend: '峨眉心法', ultimate: '峨眉绝学', bluff: '柔中带刚' },
  '华山':       { attack: '华山剑法', defend: '紫霞功', ultimate: '华山绝学', bluff: '气剑之争' },
  '魔教':       { attack: '魔教秘术', defend: '护体神功', ultimate: '魔教至高武学', bluff: '邪门歪道' },
  '逍遥':       { attack: '逍遥拳', defend: '北冥神功', ultimate: '逍遥绝学', bluff: '逍遥游' },
  '大理段氏':   { attack: '一阳指', defend: '段氏身法', ultimate: '六脉神剑', bluff: '凌波微步' },
  '曼陀山庄':   { attack: '武学点评', defend: '身法闪避', ultimate: '看穿弱点', bluff: '博学多识' },
  '无门无派':   { attack: '自创武学', defend: '硬功护体', ultimate: '绝世武功', bluff: '出其不意' },
};

export function getMoveName(npcTemplateId: string | null, faction: string, move: FinalsMove): string {
  if (npcTemplateId && HERO_MOVES[npcTemplateId]?.[move]) {
    return HERO_MOVES[npcTemplateId][move];
  }
  return FACTION_MOVES[faction]?.[move] || FACTION_MOVES['无门无派'][move];
}

// ============================================================
// 内心独白
// ============================================================

const HERO_THOUGHTS: Record<string, string[]> = {
  saodi:        ['万法皆空……', '不可伤人性命……但也不可输。', '多年修行，今日一试。'],
  dugu:         ['终于有个对手了。', '能挡住一招吗？', '有点意思……'],
  duanyu:       ['怎么又要打……', '六脉神剑……发！……啊又不受控了。', '爹爹，保佑孩儿。'],
  xuzhu:        ['阿弥陀佛，小僧不想打架……', '又是这种情况……', '梦姑教的那招……'],
  linghuchong:  ['哈哈，有趣！', '独孤前辈，弟子借九剑一用。', '打完去喝酒！'],
  zhangsanfeng: ['太极之道，阴阳流转……', '年轻人有朝气，但还需磨练。', '以不变应万变。'],
  renwoxing:    ['天下武功，皆可吸收！', '不服？吸了你内力看你服不服！', '纵横江湖，何惧何人！'],
  dongfang:     ['一根绣花针足矣。', '速度，才是武学的至高境界。', '无聊……快点结束吧。'],
  miejue:       ['魔教中人，该杀！', '师父在上，弟子定不辱命！', '峨眉正道，不容亵渎！'],
  zhiruo:       ['对不起……但我不能输。', '师父说过，慈不掌兵。', '我也不想这样……'],
  yuebuqun:     ['呵呵，还需继续演。', '辟邪剑法，天下无敌。', '岳某……从不留活口。'],
  tianshan:     ['一群废物！', '不堪一击。', '让你见识什么叫真正的武功！'],
  fengqingyang: ['剑在心中……', '破尽天下武功，唯此一剑。', '不必出手，胜负已分。'],
  kongjian:     ['施主，贫僧忍你很久了。', '阿弥陀佛……', '金刚之力，护法之心。'],
  tieluohan:    ['少林功夫，正大光明！', '正面对决！', '一拳定乾坤！'],
  jielv:        ['破戒者，受死。', '佛门清净地！', '老衲替天行道。'],
  qingfeng:     ['道法自然……', '随缘随缘。', '天意如此。'],
  guoxiang:     ['好有趣！', '来都来了，打一场嘛！', '大侠你太帅了！'],
  xiaozhao:     ['我信公子……', '小昭虽弱，但不会退缩。', '为了公子……'],
  wangyuyan:    ['这一招的破绽在……', '有趣，这招式倒是少见。', '打打杀杀有什么意思呢。'],
  tianboguang:  ['嘿嘿，看我快刀！', '柿子捡软的捏。', '别跑啊！'],
  yangxiao:     ['明教左使，不屑群殴。', '一对一，来。', '别让我看不起你。'],
  xuanming_l:   ['兄弟，一起上！', '寒冰掌！', '看我们联手！'],
  xuanming_r:   ['哥哥在哪我在哪。', '玄冥神掌！', '谁敢动我哥哥！'],
};

const PERSONALITY_THOUGHTS: Record<string, string[]> = {
  aggressive:  ['此战必胜！', '拳头说话！', '杀意已起，无人可挡！', '生死看淡，不服就干！'],
  cautious:    ['沉住气，以静制动……', '不可大意，先寻破绽。', '稳扎稳打。', '此人不弱，需谨慎。'],
  cunning:     ['呵呵，先让他得意……', '虚虚实实，真假难辨。', '他以为我会正面出招？', '兵不厌诈。'],
  random:      ['管他的，先打了再说！', '有意思，试试这招！', '跟着感觉走！', '随心所欲！'],
};

export function getInnerThought(npcTemplateId: string | null, personalityType: string): string {
  if (npcTemplateId && HERO_THOUGHTS[npcTemplateId]) {
    const pool = HERO_THOUGHTS[npcTemplateId];
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const pool = PERSONALITY_THOUGHTS[personalityType] || PERSONALITY_THOUGHTS['random'];
  return pool[Math.floor(Math.random() * pool.length)];
}

// ============================================================
// 蓄势描述（准备出招时的叙事）
// ============================================================

const READY_TEMPLATES: Record<string, string[]> = {
  attack:  [
    '{name}大喝一声，双掌灌注真气，催动「{move}」！',
    '{name}踏步上前，拳风呼啸，使出「{move}」！',
    '{name}目光如电，一招「{move}」直取要害！',
  ],
  defend: [
    '{name}气沉丹田，以「{move}」严守门户！',
    '{name}双臂环抱，「{move}」护住周身！',
    '{name}屏息凝神，「{move}」蓄势待发！',
  ],
  ultimate: [
    '{name}周身气劲暴涨！绝学「{move}」倾力而出！',
    '{name}怒吼一声，「{move}」惊天动地！',
    '{name}眼中精光大盛——「{move}」！全力一击！',
  ],
  bluff: [
    '{name}嘴角微扬，施展「{move}」虚晃一枪！',
    '{name}身形飘忽，以「{move}」迷惑对手！',
    '{name}故作破绽，暗中运使「{move}」！',
  ],
};

export function getReadyNarrative(heroName: string, moveName: string, move: FinalsMove): string {
  const pool = READY_TEMPLATES[move] || READY_TEMPLATES['attack'];
  const template = pool[Math.floor(Math.random() * pool.length)];
  return template.replace('{name}', heroName).replace('{move}', moveName);
}

// ============================================================
// 交锋叙事
// ============================================================

export function getClashNarrative(
  h1Name: string, h2Name: string,
  m1Name: string, m2Name: string,
  move1: FinalsMove, move2: FinalsMove,
  result: string,
): string {
  // 同招
  if (move1 === move2 || (move1 !== 'bluff' && move2 !== 'bluff' && move1 === move2)) {
    if (move1 === 'attack' || (move1 !== 'defend' && move1 !== 'ultimate')) {
      if (result === 'hero1_wins') return `「${m1Name}」与「${m2Name}」正面交锋！内力相撞，${h1Name}更胜一筹，震退${h2Name}！`;
      if (result === 'hero2_wins') return `「${m1Name}」与「${m2Name}」硬碰硬！${h2Name}力压${h1Name}，一掌将其击退！`;
      return `「${m1Name}」对「${m2Name}」！两人硬碰硬，势均力敌，各退一步！`;
    }
    if (move1 === 'defend') return `${h1Name}与${h2Name}各守门户，双方暗中调息运气，为下一招蓄势。`;
    if (move1 === 'ultimate') return `「${m1Name}」对撞「${m2Name}」！两大绝学正面冲突，天崩地裂！方圆十丈草木尽毁，双方重伤吐血！`;
  }

  // 克制
  if (result === 'hero1_wins') {
    const pool = [
      `「${m1Name}」直捣黄龙！${h2Name}的「${m2Name}」应对不及，被一招击退！`,
      `${h1Name}看穿对方招式——「${m1Name}」巧破「${m2Name}」！${h2Name}踉跄后退，口角溢血！`,
      `「${m1Name}」势不可挡！${h2Name}「${m2Name}」全然无用，连退数步，险象环生！`,
    ];
    return pool[Math.floor(Math.random() * pool.length)];
  }
  if (result === 'hero2_wins') {
    const pool = [
      `「${m2Name}」后发先至！${h1Name}的「${m1Name}」功亏一篑，反被${h2Name}击中要害！`,
      `${h2Name}不慌不忙——「${m2Name}」恰好克制「${m1Name}」！${h1Name}中招，踉跄后退！`,
      `「${m2Name}」一招得手！${h1Name}的「${m1Name}」被完美化解，败退三步！`,
    ];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  return `「${m1Name}」与「${m2Name}」不分上下，双方缠斗数合，各自退开！`;
}

// ============================================================
// 战后嘲讽/反应
// ============================================================

const WIN_TAUNTS: Record<string, string[]> = {
  dugu:         ['不过如此。', '还有谁？', '一招已够。'],
  saodi:        ['阿弥陀佛，得罪了。', '施主，承让。'],
  linghuchong:  ['哈哈哈，痛快！', '再来一招？'],
  renwoxing:    ['天下武功，尽归老夫！', '哈哈哈哈！'],
  dongfang:     ['无趣。', '太慢了。', '就这？'],
  zhangsanfeng: ['年轻人，还需修炼。', '太极之道，不可偏废。'],
  miejue:       ['不堪一击！', '峨眉正道！'],
  tianshan:     ['废物！', '不堪一击。'],
  yuebuqun:     ['承让承让。', '岳某侥幸。'],
  fengqingyang: ['不必多言。', '剑意到了。'],
  duanyu:       ['啊？又赢了？', '在下侥幸……'],
  xuzhu:        ['阿弥陀佛……又赢了？', '小僧不敢当……'],
  zhiruo:       ['对不起。', '别怪我。'],
  guoxiang:     ['好玩好玩！', '再来再来！'],
  tianboguang:  ['嘿嘿嘿……', '快刀的快，你学不来。'],
  yangxiao:     ['别让我看不起你。', '明教左使，名不虚传。'],
};

const LOSE_REACTIONS: Record<string, string[]> = {
  dugu:         ['有趣……终于等到了。', '好！再来！'],
  saodi:        ['贫僧修行不够……', '阿弥陀佛……'],
  linghuchong:  ['嘿，还挺厉害！', '下次再战！'],
  renwoxing:    ['可恶！', '你等着！'],
  dongfang:     ['竟然能伤到我？', '有趣。'],
  tianshan:     ['你！不可能！', '混蛋！'],
  duanyu:       ['啊？又输了？', '不打了不打了……'],
  xuzhu:        ['小僧技不如人……', '阿弥陀佛……'],
  zhangsanfeng: ['老道失策。', '后生可畏。'],
  miejue:       ['可恶的邪魔！', '这不可能！'],
  yuebuqun:     ['竟然……', '岳某看走眼了。'],
};

export function getWinTaunt(npcTemplateId: string | null): string {
  if (npcTemplateId && WIN_TAUNTS[npcTemplateId]) {
    const pool = WIN_TAUNTS[npcTemplateId];
    return pool[Math.floor(Math.random() * pool.length)];
  }
  return ['好！', '承让。', '还有谁？'][Math.floor(Math.random() * 3)];
}

export function getLoseReaction(npcTemplateId: string | null): string {
  if (npcTemplateId && LOSE_REACTIONS[npcTemplateId]) {
    const pool = LOSE_REACTIONS[npcTemplateId];
    return pool[Math.floor(Math.random() * pool.length)];
  }
  return ['可恶……', '还会再来的！', '……'][Math.floor(Math.random() * 3)];
}
