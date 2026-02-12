// ============================================================
// 随机奇遇系统 — AI 武林大会
// 150+ 随机事件，按类别分组，权重控制稀有度
// ============================================================

export interface Encounter {
  id: string;
  category: string;
  narrative: (heroName: string) => string;
  effects: {
    hp?: number;
    reputation?: number;
    hot?: number;
    morality?: number;
    credit?: number;
  };
  martialArt?: { name: string; attackBonus: number; defenseBonus: number };
  weight: number;
  minRound?: number;
  maxRound?: number;
}

// ============================================================
// 奇遇 (Adventures) — 探索与成长
// ============================================================

const ADVENTURES: Encounter[] = [
  {
    id: 'adv_001',
    category: '奇遇',
    narrative: (h) => `${h}在深山洞穴中发现一卷古人遗留的武功秘籍，翻开第一页便觉内力涌动。`,
    effects: { reputation: 10, hp: 5 },
    weight: 8,
  },
  {
    id: 'adv_002',
    category: '奇遇',
    narrative: (h) => `${h}偶遇一位白须隐世高人，对方只伸出一指便将其弹开数丈，随后笑着指点了一招。`,
    effects: { reputation: 15, hp: -5 },
    weight: 6,
  },
  {
    id: 'adv_003',
    category: '奇遇',
    narrative: (h) => `${h}踩到一块松动的石砖，机关翻转，密室大门缓缓打开，里面金光闪闪。`,
    effects: { reputation: 10, hot: 10 },
    weight: 7,
  },
  {
    id: 'adv_004',
    category: '奇遇',
    narrative: (h) => `${h}攀上绝壁，在云雾缭绕处发现一株千年灵芝，服下后浑身舒泰。`,
    effects: { hp: 15, reputation: 5 },
    weight: 5,
  },
  {
    id: 'adv_005',
    category: '奇遇',
    narrative: (h) => `${h}于梦中见一剑仙凌空而至，传授三式剑意后化作清风消散。醒来时剑法已了然于胸。`,
    effects: { reputation: 12, hot: 8 },
    weight: 4,
    minRound: 2,
  },
  {
    id: 'adv_006',
    category: '奇遇',
    narrative: (h) => `${h}在瀑布后方发现了一处石刻，上面刻着一套呼吸吐纳之法，研习片刻便觉丹田温热。`,
    effects: { hp: 8, reputation: 5 },
    weight: 8,
  },
  {
    id: 'adv_007',
    category: '奇遇',
    narrative: (h) => `${h}在枯井底部捡到一本被水浸泡的残破手札，勉强辨认出几页心法要诀。`,
    effects: { reputation: 8 },
    weight: 9,
  },
  {
    id: 'adv_008',
    category: '奇遇',
    narrative: (h) => `${h}在古寺废墟中发现一面铜镜，镜中倒映出一段前人比武的影像，领悟颇深。`,
    effects: { reputation: 10, hot: 5 },
    weight: 7,
  },
  {
    id: 'adv_009',
    category: '奇遇',
    narrative: (h) => `${h}在竹林深处听到悠扬笛声，循声而去，却只见一支玉笛插在石缝中，吹之内力自行运转。`,
    effects: { hp: 10 },
    weight: 7,
  },
  {
    id: 'adv_010',
    category: '奇遇',
    narrative: (h) => `${h}不慎跌落山涧，却发现水底有一处温泉，浸泡后伤势竟缓解了大半。`,
    effects: { hp: 12, reputation: 3 },
    weight: 6,
  },
  {
    id: 'adv_011',
    category: '奇遇',
    narrative: (h) => `${h}在荒野中遇到一只通灵白猿，白猿引路至一处山洞，内藏前辈遗物。`,
    effects: { reputation: 12, hot: 5 },
    weight: 5,
  },
  {
    id: 'adv_012',
    category: '奇遇',
    narrative: (h) => `${h}夜间赶路时看见一棵古树上刻着一套掌法图谱，月光下细细揣摩，竟有所悟。`,
    effects: { reputation: 8, hp: 3 },
    weight: 8,
  },
  {
    id: 'adv_013',
    category: '奇遇',
    narrative: (h) => `${h}救下一只受伤的金雕，金雕痊愈后衔来一颗通红的果实，食之精力大增。`,
    effects: { hp: 10, morality: 5 },
    weight: 6,
  },
  {
    id: 'adv_014',
    category: '奇遇',
    narrative: (h) => `${h}在破庙避雨时，发现墙壁暗层中藏着一幅武功招式图，虽不完整，但已获益匪浅。`,
    effects: { reputation: 7 },
    weight: 9,
  },
  {
    id: 'adv_015',
    category: '奇遇',
    narrative: (h) => `${h}无意间踏入一片奇花异草遍布的山谷，花香沁人心脾，呼吸间内力缓缓增长。`,
    effects: { hp: 8, reputation: 5 },
    weight: 7,
  },
  {
    id: 'adv_016',
    category: '奇遇',
    narrative: (h) => `${h}在河边洗手时，水中浮起一块刻有文字的玉简，记载着一段失传的运气法门。`,
    effects: { reputation: 10 },
    weight: 7,
  },

  // ============================================================
  // 天灾 (Disasters) — 危险与损失
  // ============================================================

  {
    id: 'dis_001',
    category: '天灾',
    narrative: (h) => `山崩突至！${h}被落石击中肩膀，好在躲避及时才没有更严重的伤。`,
    effects: { hp: -12 },
    weight: 8,
  },
  {
    id: 'dis_002',
    category: '天灾',
    narrative: (h) => `${h}不慎踩中地面陷阱，三枚毒针射入小腿，毒性虽弱但疼痛难忍。`,
    effects: { hp: -10, reputation: -3 },
    weight: 8,
  },
  {
    id: 'dis_003',
    category: '天灾',
    narrative: (h) => `一条银环蛇从草丛窜出，一口咬在${h}脚踝上，幸好及时运功逼毒。`,
    effects: { hp: -8 },
    weight: 9,
  },
  {
    id: 'dis_004',
    category: '天灾',
    narrative: (h) => `暴雨如注，${h}在泥泞山路上滑倒，滚落数丈，浑身泥泞不堪。`,
    effects: { hp: -7, hot: -5 },
    weight: 9,
  },
  {
    id: 'dis_005',
    category: '天灾',
    narrative: (h) => `雷电击中${h}身旁大树，碎木飞溅划伤手臂，耳鸣不止。`,
    effects: { hp: -8, hot: 5 },
    weight: 7,
  },
  {
    id: 'dis_006',
    category: '天灾',
    narrative: (h) => `${h}行经枯桥时桥面断裂，坠入溪涧，冰冷刺骨的溪水浸透全身。`,
    effects: { hp: -10 },
    weight: 8,
  },
  {
    id: 'dis_007',
    category: '天灾',
    narrative: (h) => `突如其来的沙尘暴席卷而过，${h}被飞沙走石打得睁不开眼。`,
    effects: { hp: -6, reputation: -2 },
    weight: 8,
  },
  {
    id: 'dis_008',
    category: '天灾',
    narrative: (h) => `${h}误食了路边一种颜色鲜艳的野果，腹痛如绞，上吐下泻。`,
    effects: { hp: -10, hot: -3 },
    weight: 8,
  },
  {
    id: 'dis_009',
    category: '天灾',
    narrative: (h) => `地面突然塌陷，${h}跌入一个深坑，好不容易才攀爬出来。`,
    effects: { hp: -9 },
    weight: 7,
  },
  {
    id: 'dis_010',
    category: '天灾',
    narrative: (h) => `${h}在密林中被一群毒蜂围攻，虽奋力驱赶，仍被蛰了数处。`,
    effects: { hp: -8, reputation: -2 },
    weight: 8,
  },
  {
    id: 'dis_011',
    category: '天灾',
    narrative: (h) => `酷暑难耐，${h}中暑晕倒在路边，醒来时已是黄昏。`,
    effects: { hp: -7 },
    weight: 9,
  },
  {
    id: 'dis_012',
    category: '天灾',
    narrative: (h) => `狂风大作，${h}被吹落的巨石碎片击中后背，内伤不轻。`,
    effects: { hp: -12 },
    weight: 6,
    minRound: 3,
  },
  {
    id: 'dis_013',
    category: '天灾',
    narrative: (h) => `${h}在悬崖边练功时脚下松动，虽未坠落，但拉伤了筋骨。`,
    effects: { hp: -6, reputation: -3 },
    weight: 8,
  },
  {
    id: 'dis_014',
    category: '天灾',
    narrative: (h) => `一场冰雹突降，${h}来不及躲避，被砸得头破血流。`,
    effects: { hp: -10 },
    weight: 7,
  },
  {
    id: 'dis_015',
    category: '天灾',
    narrative: (h) => `${h}在夜间行路时不慎踩入猎人留下的兽夹，脚踝受伤。`,
    effects: { hp: -9 },
    weight: 8,
  },

  // ============================================================
  // 江湖逸事 (Jianghu Tales) — 声望与名气
  // ============================================================

  {
    id: 'jh_001',
    category: '江湖逸事',
    narrative: (h) => `${h}在路上遇到几个流氓欺负卖菜老妇，一出手便将他们打跑，围观百姓齐声叫好。`,
    effects: { reputation: 12, hot: 8, morality: 5 },
    weight: 8,
  },
  {
    id: 'jh_002',
    category: '江湖逸事',
    narrative: (h) => `一位走遍天下的江湖画师恰好路过，将${h}英姿飒爽的身影画了下来，此画后来流传甚广。`,
    effects: { hot: 15, reputation: 5 },
    weight: 7,
  },
  {
    id: 'jh_003',
    category: '江湖逸事',
    narrative: (h) => `茶馆说书人正在绘声绘色地讲述${h}昨日的壮举，满堂喝彩。`,
    effects: { hot: 12, reputation: 8 },
    weight: 8,
  },
  {
    id: 'jh_004',
    category: '江湖逸事',
    narrative: (h) => `丐帮弟子认出了${h}，连忙通报帮主。帮主亲自前来，以一壶好酒相赠。`,
    effects: { reputation: 10, hot: 5, credit: 5 },
    weight: 6,
  },
  {
    id: 'jh_005',
    category: '江湖逸事',
    narrative: (h) => `${h}收到一封武林大会邀请函——可惜打开一看，收件人并不是自己。有人认错人了。`,
    effects: { hot: 10, reputation: -3 },
    weight: 9,
  },
  {
    id: 'jh_006',
    category: '江湖逸事',
    narrative: (h) => `${h}在码头帮渔民抬船，不小心展示了惊人的臂力，渔民们敬若天人。`,
    effects: { reputation: 8, hot: 8 },
    weight: 8,
  },
  {
    id: 'jh_007',
    category: '江湖逸事',
    narrative: (h) => `市集上有人传唱一首新曲，歌词竟是讲述${h}行走江湖的故事，越传越广。`,
    effects: { hot: 15, reputation: 5 },
    weight: 6,
  },
  {
    id: 'jh_008',
    category: '江湖逸事',
    narrative: (h) => `${h}误入一场诗会，被迫即兴赋诗一首。诗虽粗糙，但豪气冲天，文人们纷纷鼓掌。`,
    effects: { hot: 10, reputation: 5 },
    weight: 8,
  },
  {
    id: 'jh_009',
    category: '江湖逸事',
    narrative: (h) => `一个走江湖的说书人把${h}打败恶霸的事迹编成了评书，在各大茶楼传播。`,
    effects: { hot: 12, reputation: 10 },
    weight: 7,
    minRound: 2,
  },
  {
    id: 'jh_010',
    category: '江湖逸事',
    narrative: (h) => `${h}无意中救了一位朝廷命官的女儿，官府贴出告示嘉奖此义举。`,
    effects: { reputation: 15, hot: 8, morality: 5 },
    weight: 5,
  },
  {
    id: 'jh_011',
    category: '江湖逸事',
    narrative: (h) => `${h}的一句豪言壮语被路过的侠客听到，连夜传遍了三个城镇。`,
    effects: { hot: 12 },
    weight: 9,
  },
  {
    id: 'jh_012',
    category: '江湖逸事',
    narrative: (h) => `${h}在桥头与一位老翁下棋，一盘棋下了三天三夜，引来无数围观者。`,
    effects: { hot: 10, reputation: 5 },
    weight: 7,
  },
  {
    id: 'jh_013',
    category: '江湖逸事',
    narrative: (h) => `${h}被一群小孩缠住讲故事，结果越讲越玄乎，"${h}大侠"的名号在村子里传开了。`,
    effects: { hot: 8, reputation: 3 },
    weight: 9,
  },
  {
    id: 'jh_014',
    category: '江湖逸事',
    narrative: (h) => `镖局总镖头途经此地，听闻${h}之名，特地留下拜帖求见。`,
    effects: { reputation: 10, credit: 5 },
    weight: 6,
    minRound: 3,
  },
  {
    id: 'jh_015',
    category: '江湖逸事',
    narrative: (h) => `${h}在城门口被人认出，一群武林后辈围过来请求签名——用剑在扇子上刻字。`,
    effects: { hot: 12, reputation: 5 },
    weight: 7,
  },

  // ============================================================
  // 机缘 (Fortune) — 幸运事件
  // ============================================================

  {
    id: 'fort_001',
    category: '机缘',
    narrative: (h) => `${h}在河边捡到一柄锈迹斑斑的古剑，拔出鞘后寒光四射，竟是一柄上古宝兵。`,
    effects: { reputation: 15, hot: 10 },
    weight: 4,
  },
  {
    id: 'fort_002',
    category: '机缘',
    narrative: (h) => `${h}误食了一颗来历不明的紫色果子，腹中如火烧——片刻之后却觉气力暴增。`,
    effects: { hp: 10, reputation: 8 },
    weight: 5,
  },
  {
    id: 'fort_003',
    category: '机缘',
    narrative: (h) => `一颗流星坠在${h}面前，砸裂了一块大石，石中竟藏着一枚玉髓。`,
    effects: { hp: 15, reputation: 10, hot: 10 },
    weight: 3,
    minRound: 2,
  },
  {
    id: 'fort_004',
    category: '机缘',
    narrative: (h) => `${h}迷路误入一处世外桃源，在此休憩一夜，伤势尽复，神清气爽。`,
    effects: { hp: 20, morality: 5 },
    weight: 3,
  },
  {
    id: 'fort_005',
    category: '机缘',
    narrative: (h) => `${h}从江湖骗子手中买了一瓶假药，喝下后居然真的有奇效——骗子自己都不信。`,
    effects: { hp: 12, hot: 8 },
    weight: 6,
  },
  {
    id: 'fort_006',
    category: '机缘',
    narrative: (h) => `${h}被蝴蝶引入一片竹海深处，发现一泓清泉，泉水入口甘甜，饮后百脉通畅。`,
    effects: { hp: 10 },
    weight: 6,
  },
  {
    id: 'fort_007',
    category: '机缘',
    narrative: (h) => `${h}在旧书摊上以三文钱买到一本发黄的册子，仔细一看竟是失传已久的经络图。`,
    effects: { reputation: 12, hp: 5 },
    weight: 5,
  },
  {
    id: 'fort_008',
    category: '机缘',
    narrative: (h) => `${h}在路边亭子中避雨时，发现石凳下藏着一个锦盒，内有一颗还阳丹。`,
    effects: { hp: 15 },
    weight: 4,
  },
  {
    id: 'fort_009',
    category: '机缘',
    narrative: (h) => `${h}无意间踩碎了一块奇石，石中流出一股暖流沿脚底涌入全身，内力大增。`,
    effects: { hp: 8, reputation: 8 },
    weight: 5,
  },
  {
    id: 'fort_010',
    category: '机缘',
    narrative: (h) => `一只仙鹤落在${h}肩头，口衔一粒红丸。${h}试着服下，顿觉耳聪目明。`,
    effects: { hp: 10, reputation: 5 },
    weight: 4,
    minRound: 3,
  },
  {
    id: 'fort_011',
    category: '机缘',
    narrative: (h) => `${h}从赌坊门口经过，顺手押了一把，竟连赢三局，引得满堂喝彩。`,
    effects: { hot: 10, reputation: 5 },
    weight: 7,
  },
  {
    id: 'fort_012',
    category: '机缘',
    narrative: (h) => `${h}在溪边洗脸时，一条锦鲤跃出水面撞到脸上——嘴里还叼着一枚金钱。`,
    effects: { hot: 8 },
    weight: 8,
  },
  {
    id: 'fort_013',
    category: '机缘',
    narrative: (h) => `${h}在坍塌的佛塔中发现了一尊中空的佛像，里面藏着一瓶千年蜂蜜，服后伤势渐愈。`,
    effects: { hp: 12, morality: 3 },
    weight: 5,
  },
  {
    id: 'fort_014',
    category: '机缘',
    narrative: (h) => `${h}被大风吹到了一棵千年古树下，树洞中居然藏着一壶陈年好酒，饮后暖意融融。`,
    effects: { hp: 8, hot: 5 },
    weight: 7,
  },
  {
    id: 'fort_015',
    category: '机缘',
    narrative: (h) => `${h}在废弃道观中打坐时，意外打通了任督二脉，修为更上一层楼。`,
    effects: { hp: 10, reputation: 12 },
    weight: 3,
    minRound: 3,
  },

  // ============================================================
  // 宝物 (Treasures) — 获得武功 (含 martialArt)
  // ============================================================

  {
    id: 'trs_001',
    category: '宝物',
    narrative: (h) => `${h}在石壁上发现了太极剑法的完整图谱！仔细研读后，剑法已入化境。`,
    effects: { reputation: 15, hot: 10 },
    martialArt: { name: '太极剑法', attackBonus: 5, defenseBonus: 4 },
    weight: 2,
    minRound: 2,
  },
  {
    id: 'trs_002',
    category: '宝物',
    narrative: (h) => `${h}在暗河尽头找到一本降龙十八掌的残谱，虽只习得三掌，已威力惊人。`,
    effects: { reputation: 18, hot: 12 },
    martialArt: { name: '降龙十八掌', attackBonus: 7, defenseBonus: 2 },
    weight: 1,
    minRound: 3,
  },
  {
    id: 'trs_003',
    category: '宝物',
    narrative: (h) => `${h}从古墓中悟出了六脉神剑的第一脉——少商剑，凌空一指，气劲破石。`,
    effects: { reputation: 20, hot: 15 },
    martialArt: { name: '六脉神剑', attackBonus: 8, defenseBonus: 1 },
    weight: 1,
    minRound: 4,
  },
  {
    id: 'trs_004',
    category: '宝物',
    narrative: (h) => `${h}在前朝皇陵深处找到了葵花宝典残本。犹豫再三……还是翻开了第一页。`,
    effects: { reputation: 15, hot: 20, morality: -10 },
    martialArt: { name: '葵花宝典', attackBonus: 8, defenseBonus: 0 },
    weight: 1,
    minRound: 3,
  },
  {
    id: 'trs_005',
    category: '宝物',
    narrative: (h) => `${h}偶遇独孤求败之墓，在刻满剑痕的石壁前顿悟了独孤九剑中的破剑式。`,
    effects: { reputation: 18, hot: 12 },
    martialArt: { name: '独孤九剑', attackBonus: 6, defenseBonus: 5 },
    weight: 1,
    minRound: 2,
  },
  {
    id: 'trs_006',
    category: '宝物',
    narrative: (h) => `${h}在少林藏经阁的夹层中发现了《易筋经》真本，闭关一日便觉脱胎换骨。`,
    effects: { reputation: 15, hp: 10 },
    martialArt: { name: '易筋经', attackBonus: 3, defenseBonus: 5 },
    weight: 2,
  },
  {
    id: 'trs_007',
    category: '宝物',
    narrative: (h) => `${h}在悬崖绝壁上发现了玉女心经的石刻，习得后身法飘逸如仙。`,
    effects: { reputation: 12, hot: 8 },
    martialArt: { name: '玉女心经', attackBonus: 4, defenseBonus: 4 },
    weight: 2,
  },
  {
    id: 'trs_008',
    category: '宝物',
    narrative: (h) => `${h}从一位临终老僧手中得到了一本九阳真经残页，修炼后内力绵绵不绝。`,
    effects: { reputation: 15, hp: 8 },
    martialArt: { name: '九阳真经', attackBonus: 4, defenseBonus: 4 },
    weight: 2,
    minRound: 2,
  },
  {
    id: 'trs_009',
    category: '宝物',
    narrative: (h) => `${h}在地下石室中找到了北冥神功的心法，试运行之，竟能吸纳天地灵气。`,
    effects: { reputation: 16, hp: 5 },
    martialArt: { name: '北冥神功', attackBonus: 5, defenseBonus: 3 },
    weight: 1,
    minRound: 3,
  },
  {
    id: 'trs_010',
    category: '宝物',
    narrative: (h) => `${h}在一座古墓的棺椁旁发现了一卷蛤蟆功秘籍，练了两招便觉霸道无比。`,
    effects: { reputation: 10, hot: 8 },
    martialArt: { name: '蛤蟆功', attackBonus: 6, defenseBonus: 2 },
    weight: 2,
  },
  {
    id: 'trs_011',
    category: '宝物',
    narrative: (h) => `${h}得到一位隐世剑客的指点，学会了辟邪剑法的起手三式。`,
    effects: { reputation: 12, hot: 10 },
    martialArt: { name: '辟邪剑法', attackBonus: 7, defenseBonus: 1 },
    weight: 1,
    minRound: 2,
  },
  {
    id: 'trs_012',
    category: '宝物',
    narrative: (h) => `${h}在武当后山发现了张三丰留下的太极拳法真意石刻，日夜揣摩终有所悟。`,
    effects: { reputation: 12, hp: 5 },
    martialArt: { name: '太极拳', attackBonus: 3, defenseBonus: 5 },
    weight: 2,
  },
  {
    id: 'trs_013',
    category: '宝物',
    narrative: (h) => `${h}在冰窟中发现一本寒冰真气的修炼之法，练成后掌风带着刺骨寒意。`,
    effects: { reputation: 10, hot: 5 },
    martialArt: { name: '寒冰真气', attackBonus: 5, defenseBonus: 3 },
    weight: 2,
  },
  {
    id: 'trs_014',
    category: '宝物',
    narrative: (h) => `${h}从一位云游僧人处习得了金刚不坏体的入门心法，皮肤泛起金光。`,
    effects: { reputation: 10, hp: 8 },
    martialArt: { name: '金刚不坏体', attackBonus: 2, defenseBonus: 5 },
    weight: 2,
  },
  {
    id: 'trs_015',
    category: '宝物',
    narrative: (h) => `${h}在峨眉金顶的雷劈木中发现了一卷佛光普照心经，修炼后攻守兼备。`,
    effects: { reputation: 12, hot: 8 },
    martialArt: { name: '佛光普照', attackBonus: 4, defenseBonus: 4 },
    weight: 2,
    minRound: 2,
  },

  // ============================================================
  // 陷阱 (Traps) — 负面 HP 事件
  // ============================================================

  {
    id: 'trap_001',
    category: '陷阱',
    narrative: (h) => `${h}一脚踩进猎人设下的铁夹，疼得大叫一声，花了好一会儿才掰开。`,
    effects: { hp: -10 },
    weight: 8,
  },
  {
    id: 'trap_002',
    category: '陷阱',
    narrative: (h) => `${h}误入一处弥漫着紫色迷雾的山谷，待逃出时已中毒颇深。`,
    effects: { hp: -12, reputation: -5 },
    weight: 6,
  },
  {
    id: 'trap_003',
    category: '陷阱',
    narrative: (h) => `${h}在客栈喝茶时被一个笑面虎下了迷药，醒来后头昏脑涨，钱袋也空了。`,
    effects: { hp: -8, credit: -5 },
    weight: 7,
  },
  {
    id: 'trap_004',
    category: '陷阱',
    narrative: (h) => `${h}在暗巷中被数枚暗器袭击，虽然躲过了要害，手臂上仍中了两枚飞镖。`,
    effects: { hp: -10 },
    weight: 8,
  },
  {
    id: 'trap_005',
    category: '陷阱',
    narrative: (h) => `${h}踩中了江湖老手布下的绊马索，摔了个狗啃泥，颜面尽失。`,
    effects: { hp: -5, hot: -8, reputation: -5 },
    weight: 7,
  },
  {
    id: 'trap_006',
    category: '陷阱',
    narrative: (h) => `${h}在山洞中触发了前人留下的毒烟机关，吸入不少毒气。`,
    effects: { hp: -12 },
    weight: 6,
  },
  {
    id: 'trap_007',
    category: '陷阱',
    narrative: (h) => `${h}被路边假装求助的江湖骗子引入包围圈，遭了一顿暗算。`,
    effects: { hp: -10, credit: -5, morality: -3 },
    weight: 6,
  },
  {
    id: 'trap_008',
    category: '陷阱',
    narrative: (h) => `${h}在树林中被绊了一跤，趁其不备一支毒箭从暗处射来。`,
    effects: { hp: -11 },
    weight: 7,
  },
  {
    id: 'trap_009',
    category: '陷阱',
    narrative: (h) => `${h}收到一封密信赴约，到了才发现是一个精心设计的圈套。`,
    effects: { hp: -8, credit: -8 },
    weight: 5,
    minRound: 2,
  },
  {
    id: 'trap_010',
    category: '陷阱',
    narrative: (h) => `${h}在废弃矿洞中探索时，头顶突然落下一块巨石，险些丧命。`,
    effects: { hp: -13 },
    weight: 5,
    minRound: 3,
  },
  {
    id: 'trap_011',
    category: '陷阱',
    narrative: (h) => `${h}接过路人递来的一碗水，喝下后才发现水中有麻痹之药。`,
    effects: { hp: -7, credit: -5 },
    weight: 7,
  },
  {
    id: 'trap_012',
    category: '陷阱',
    narrative: (h) => `${h}在竹林中被竹签阵困住，左冲右突间被扎了好几处。`,
    effects: { hp: -9 },
    weight: 7,
  },
  {
    id: 'trap_013',
    category: '陷阱',
    narrative: (h) => `${h}踩到了一处流沙陷阱，虽然拼命挣扎逃出，但体力消耗极大。`,
    effects: { hp: -8 },
    weight: 8,
  },
  {
    id: 'trap_014',
    category: '陷阱',
    narrative: (h) => `${h}在夜间赶路时，被一根几乎看不见的铁丝绊倒，滚下山坡。`,
    effects: { hp: -10, reputation: -3 },
    weight: 7,
  },
  {
    id: 'trap_015',
    category: '陷阱',
    narrative: (h) => `${h}打开一个上锁的箱子，里面弹出一团毒粉直扑面门。`,
    effects: { hp: -10 },
    weight: 7,
  },

  // ============================================================
  // NPC遭遇 (NPC Encounters) — 混合效果
  // ============================================================

  {
    id: 'npc_001',
    category: 'NPC遭遇',
    narrative: (h) => `${h}在路边遇到一位卖艺老人，两人切磋了几招，${h}学到了不少实战经验。`,
    effects: { reputation: 8, hp: -3 },
    weight: 8,
  },
  {
    id: 'npc_002',
    category: 'NPC遭遇',
    narrative: (h) => `一个神秘蒙面人突然从暗处飞出一掌，${h}勉强接住，但被震退数步。`,
    effects: { hp: -10, hot: 8 },
    weight: 7,
  },
  {
    id: 'npc_003',
    category: 'NPC遭遇',
    narrative: (h) => `${h}救下了一位遭遇山贼的商人，商人感恩戴德，赠上一袋金创药和盘缠。`,
    effects: { hp: 8, reputation: 10, morality: 5, credit: 5 },
    weight: 6,
  },
  {
    id: 'npc_004',
    category: 'NPC遭遇',
    narrative: (h) => `${h}走进一家酒馆，女老板热情好客地不断倒酒，${h}不知不觉喝多了……`,
    effects: { hp: -5, hot: 10, credit: -3 },
    weight: 8,
  },
  {
    id: 'npc_005',
    category: 'NPC遭遇',
    narrative: (h) => `一位武林前辈拦住${h}的去路，声称要考验后辈。一番过招后前辈微微点头，留下一句指点。`,
    effects: { reputation: 12, hp: -5, credit: 5 },
    weight: 5,
    minRound: 2,
  },
  {
    id: 'npc_006',
    category: 'NPC遭遇',
    narrative: (h) => `${h}在集市上被一个小偷摸了钱袋，追了三条街才追回来，还顺手教训了小偷一顿。`,
    effects: { hp: -3, hot: 8, morality: 3 },
    weight: 8,
  },
  {
    id: 'npc_007',
    category: 'NPC遭遇',
    narrative: (h) => `${h}遇到一位盲眼琴师，听了一曲后心神宁静，内伤竟有所好转。`,
    effects: { hp: 8, morality: 3 },
    weight: 7,
  },
  {
    id: 'npc_008',
    category: 'NPC遭遇',
    narrative: (h) => `一位自称"天下第二"的怪人向${h}发起挑战，两人激斗三十回合不分胜负，怪人大笑而去。`,
    effects: { reputation: 10, hp: -8, hot: 12 },
    weight: 4,
    minRound: 3,
  },
  {
    id: 'npc_009',
    category: 'NPC遭遇',
    narrative: (h) => `${h}在山中遇到一位采药老妇，老妇分了几味草药，敷在伤口上果然有奇效。`,
    effects: { hp: 10, morality: 3 },
    weight: 7,
  },
  {
    id: 'npc_010',
    category: 'NPC遭遇',
    narrative: (h) => `${h}被一群流浪儿围住要吃的，分了些干粮后，孩子们告诉了一条密道的位置。`,
    effects: { reputation: 5, morality: 5, hot: 3 },
    weight: 8,
  },
  {
    id: 'npc_011',
    category: 'NPC遭遇',
    narrative: (h) => `${h}在茶馆与一位陌生剑客对视，两人不发一言交手十招，各自负伤离去，却心生惺惺相惜。`,
    effects: { hp: -5, reputation: 10, hot: 8 },
    weight: 5,
  },
  {
    id: 'npc_012',
    category: 'NPC遭遇',
    narrative: (h) => `${h}帮一位赶路的老和尚挑了一段路的行李，老和尚临别赠了一颗舍利子。`,
    effects: { hp: 5, reputation: 5, morality: 5 },
    weight: 7,
  },
  {
    id: 'npc_013',
    category: 'NPC遭遇',
    narrative: (h) => `${h}被一位神秘女子搭讪，聊了几句才发现她是江湖上有名的女刺客——幸好对方只是路过。`,
    effects: { hot: 10, credit: -3 },
    weight: 6,
  },
  {
    id: 'npc_014',
    category: 'NPC遭遇',
    narrative: (h) => `一位铁匠请${h}试用他新打的兵器，${h}挥了几下，兵器虽钝但分量十足。`,
    effects: { reputation: 5 },
    weight: 9,
  },
  {
    id: 'npc_015',
    category: 'NPC遭遇',
    narrative: (h) => `${h}遇到一个自称是前朝公主的老妇人，听她讲了一段宫廷秘辛，真假难辨。`,
    effects: { hot: 8 },
    weight: 8,
  },
  {
    id: 'npc_016',
    category: 'NPC遭遇',
    narrative: (h) => `${h}被一位化缘僧人拉住，非要赠送一本佛经。${h}翻开一看，经文间竟夹着几页武功心法。`,
    effects: { reputation: 8, morality: 3 },
    weight: 6,
  },

  // ============================================================
  // 天象 (Celestial Events) — 区域效果
  // ============================================================

  {
    id: 'cel_001',
    category: '天象',
    narrative: (h) => `今夜月圆如盘，${h}在月光下运功，修炼效果竟比平日强了数倍。`,
    effects: { hp: 10, reputation: 8 },
    weight: 5,
  },
  {
    id: 'cel_002',
    category: '天象',
    narrative: (h) => `天降流星雨，${h}在星光之中打坐吐纳，丹田中涌起一股热流，内力暴增。`,
    effects: { reputation: 12, hot: 10 },
    weight: 4,
    minRound: 2,
  },
  {
    id: 'cel_003',
    category: '天象',
    narrative: (h) => `大雾弥漫，${h}在浓雾中行走，不慎与同伴走散，还被树枝刮伤了脸。`,
    effects: { hp: -5, reputation: -3 },
    weight: 8,
  },
  {
    id: 'cel_004',
    category: '天象',
    narrative: (h) => `日食突现，天地昏暗，${h}感到体内气血翻涌，邪劲不受控制地暴涨。`,
    effects: { reputation: 10, morality: -5 },
    weight: 4,
    minRound: 3,
  },
  {
    id: 'cel_005',
    category: '天象',
    narrative: (h) => `一场春雨过后，${h}看到山间出现了一道双虹，心旷神怡，伤势仿佛好了一些。`,
    effects: { hp: 8, morality: 3 },
    weight: 7,
  },
  {
    id: 'cel_006',
    category: '天象',
    narrative: (h) => `北风呼啸，${h}在寒风中硬撑着练功，虽冻得瑟瑟发抖，但意志更加坚定。`,
    effects: { reputation: 8, hp: -5 },
    weight: 7,
  },
  {
    id: 'cel_007',
    category: '天象',
    narrative: (h) => `电闪雷鸣之际，${h}感受到天地间的浩然之气，猛然间悟出一招霹雳掌。`,
    effects: { reputation: 12, hot: 8 },
    weight: 4,
    minRound: 2,
  },
  {
    id: 'cel_008',
    category: '天象',
    narrative: (h) => `一颗孤星划破夜空，${h}许下心愿。巧的是，第二天路上便捡到了一件宝物。`,
    effects: { reputation: 5, hot: 5 },
    weight: 7,
  },
  {
    id: 'cel_009',
    category: '天象',
    narrative: (h) => `罕见的极光降临此地，七彩光芒笼罩山头，${h}在光中打坐，气息平稳而悠长。`,
    effects: { hp: 12, reputation: 5 },
    weight: 3,
    minRound: 3,
  },
  {
    id: 'cel_010',
    category: '天象',
    narrative: (h) => `三日暴雨不歇，${h}被困在山洞中无法出行，只好闭目养神。`,
    effects: { hp: 5 },
    weight: 9,
  },

  // ============================================================
  // 秘境 (Secret Realms) — 高风险高回报
  // ============================================================

  {
    id: 'sec_001',
    category: '秘境',
    narrative: (h) => `${h}误入桃花阵，在花丛中迷失了方向。兜兜转转之后终于脱困，却发现武功竟有精进。`,
    effects: { hp: -8, reputation: 15, hot: 10 },
    weight: 3,
    minRound: 2,
  },
  {
    id: 'sec_002',
    category: '秘境',
    narrative: (h) => `${h}发现了一处隐蔽的地下洞府，洞中珍宝无数，但也布满了致命机关。`,
    effects: { hp: -10, reputation: 18, hot: 12 },
    weight: 2,
    minRound: 2,
  },
  {
    id: 'sec_003',
    category: '秘境',
    narrative: (h) => `${h}闯入前朝皇宫密道，在错综复杂的通道中找到了一间藏宝室。`,
    effects: { hp: -5, reputation: 15, hot: 10 },
    weight: 3,
    minRound: 3,
  },
  {
    id: 'sec_004',
    category: '秘境',
    narrative: (h) => `${h}在深山中发现了一座被藤蔓覆盖的古墓，里面的壁画暗藏武学至理。`,
    effects: { hp: -6, reputation: 14, hot: 8 },
    weight: 3,
    minRound: 2,
  },
  {
    id: 'sec_005',
    category: '秘境',
    narrative: (h) => `${h}跌入一处地下暗河，顺流漂到了一个晶莹剔透的水晶洞。洞壁上刻满了武功招式。`,
    effects: { hp: -10, reputation: 16, hot: 10 },
    weight: 2,
    minRound: 3,
  },
  {
    id: 'sec_006',
    category: '秘境',
    narrative: (h) => `${h}打开一扇石门，眼前是一座地底湖泊，湖心小岛上有一座破败的剑冢。`,
    effects: { hp: -8, reputation: 15, hot: 12 },
    weight: 2,
    minRound: 3,
  },
  {
    id: 'sec_007',
    category: '秘境',
    narrative: (h) => `${h}在断崖下发现一个被巨石封住的山洞，费尽九牛二虎之力打开后，里面是一处修炼圣地。`,
    effects: { hp: -12, reputation: 18 },
    weight: 2,
    minRound: 4,
  },
  {
    id: 'sec_008',
    category: '秘境',
    narrative: (h) => `${h}无意间走入一片被浓雾笼罩的竹林迷阵，在阵中苦战一日才脱身，但功力大有长进。`,
    effects: { hp: -7, reputation: 12, hot: 8 },
    weight: 3,
    minRound: 2,
  },
  {
    id: 'sec_009',
    category: '秘境',
    narrative: (h) => `${h}发现一座沉入湖底的佛塔，憋气潜入后在佛塔顶层找到一颗夜明珠和几卷经书。`,
    effects: { hp: -10, reputation: 14, hot: 10 },
    weight: 2,
    minRound: 3,
  },
  {
    id: 'sec_010',
    category: '秘境',
    narrative: (h) => `${h}在荒漠中发现了一座被黄沙半掩的古城，城中机关重重，但也暗藏机缘。`,
    effects: { hp: -8, reputation: 15, hot: 8 },
    weight: 3,
    minRound: 2,
  },

  // ============================================================
  // 医术 (Healing) — HP 恢复
  // ============================================================

  {
    id: 'heal_001',
    category: '医术',
    narrative: (h) => `${h}路遇一位游方郎中，郎中把脉后开了一剂汤药，${h}喝下后顿觉神清气爽。`,
    effects: { hp: 12 },
    weight: 8,
  },
  {
    id: 'heal_002',
    category: '医术',
    narrative: (h) => `${h}在山间采到了上等金创药的原料，自己配制后敷在伤口上，效果显著。`,
    effects: { hp: 10, reputation: 3 },
    weight: 8,
  },
  {
    id: 'heal_003',
    category: '医术',
    narrative: (h) => `${h}在溪边盘坐运功疗伤，竟无意间打通了一处堵塞的经脉，内伤好了大半。`,
    effects: { hp: 15, reputation: 5 },
    weight: 5,
  },
  {
    id: 'heal_004',
    category: '医术',
    narrative: (h) => `${h}找到了一处野温泉，泡了半个时辰，浑身酸痛尽消。`,
    effects: { hp: 10 },
    weight: 8,
  },
  {
    id: 'heal_005',
    category: '医术',
    narrative: (h) => `一位神医恰好路过此地，为${h}施针三十六处，气血立时畅通。`,
    effects: { hp: 18, reputation: 5 },
    weight: 3,
    minRound: 3,
  },
  {
    id: 'heal_006',
    category: '医术',
    narrative: (h) => `${h}从药铺买了一贴膏药，本以为是寻常物，不料贴上后伤口以肉眼可见的速度愈合。`,
    effects: { hp: 12 },
    weight: 7,
  },
  {
    id: 'heal_007',
    category: '医术',
    narrative: (h) => `${h}在山中挖到了一根百年人参，炖汤服下后元气大补。`,
    effects: { hp: 15 },
    weight: 5,
  },
  {
    id: 'heal_008',
    category: '医术',
    narrative: (h) => `${h}得到一颗少林大还丹，服后内伤尽愈，功力恢复如初。`,
    effects: { hp: 20 },
    weight: 2,
    minRound: 4,
  },
  {
    id: 'heal_009',
    category: '医术',
    narrative: (h) => `${h}在道观中学会了一套导引术，每日练习后伤势逐渐好转。`,
    effects: { hp: 8, reputation: 3 },
    weight: 8,
  },
  {
    id: 'heal_010',
    category: '医术',
    narrative: (h) => `一位苗疆女医为${h}敷上独门蛊药，刺痛过后伤口竟已结痂。`,
    effects: { hp: 12, hot: 3 },
    weight: 6,
  },

  // ============================================================
  // 酒馆 (Tavern) — 社交事件，影响 hot / reputation
  // ============================================================

  {
    id: 'tav_001',
    category: '酒馆',
    narrative: (h) => `${h}喝了三碗烈酒后酒后吐真言，把自己的秘密全说了出来，第二天传遍了整条街。`,
    effects: { hot: 15, reputation: -5, credit: -5 },
    weight: 7,
  },
  {
    id: 'tav_002',
    category: '酒馆',
    narrative: (h) => `${h}参加了酒馆的斗酒大赛，连干八碗不倒，赢得满堂喝彩和"千杯不醉"的美名。`,
    effects: { hot: 12, reputation: 10 },
    weight: 6,
  },
  {
    id: 'tav_003',
    category: '酒馆',
    narrative: (h) => `${h}在酒馆角落与一位素不相识的侠客对饮，两人意气相投，当即义结金兰。`,
    effects: { reputation: 8, credit: 8, hot: 5 },
    weight: 6,
  },
  {
    id: 'tav_004',
    category: '酒馆',
    narrative: (h) => `${h}在酒馆听到有人议论自己的坏话，一拍桌子站了起来——结果是夸自己的。`,
    effects: { hot: 10, reputation: 3 },
    weight: 8,
  },
  {
    id: 'tav_005',
    category: '酒馆',
    narrative: (h) => `${h}在酒馆弹琴助兴，一曲《广陵散》弹罢，满座寂然，随后掌声雷动。`,
    effects: { hot: 12, reputation: 8 },
    weight: 5,
  },
  {
    id: 'tav_006',
    category: '酒馆',
    narrative: (h) => `${h}跟酒馆老板打赌掰手腕，赢了三局后获赠一壶"醉仙酿"，据说有强身之效。`,
    effects: { hp: 5, hot: 8, reputation: 5 },
    weight: 7,
  },
  {
    id: 'tav_007',
    category: '酒馆',
    narrative: (h) => `${h}在酒馆与人争执，一言不合动起手来，虽占了上风，但也被椅子砸了一下。`,
    effects: { hp: -5, hot: 10, reputation: 5 },
    weight: 7,
  },
  {
    id: 'tav_008',
    category: '酒馆',
    narrative: (h) => `${h}醉后在酒馆门口耍了一套拳法，围观群众连声叫好，"醉拳高手"的名号不胫而走。`,
    effects: { hot: 15, reputation: 8 },
    weight: 5,
  },
  {
    id: 'tav_009',
    category: '酒馆',
    narrative: (h) => `酒馆里一位说书人突然指着${h}说："这位便是当年那位大侠！"全场目光齐刷刷看过来。`,
    effects: { hot: 12, reputation: 5 },
    weight: 7,
  },
  {
    id: 'tav_010',
    category: '酒馆',
    narrative: (h) => `${h}在酒馆后厨帮忙做了一道"剑削面"，刀工惊人，食客们纷纷打赏。`,
    effects: { hot: 8, reputation: 3, morality: 3 },
    weight: 8,
  },
  {
    id: 'tav_011',
    category: '酒馆',
    narrative: (h) => `${h}喝醉了趴在桌上睡着，醒来发现有人在自己衣服上画了一只王八，气得七窍生烟。`,
    effects: { hot: 10, reputation: -5 },
    weight: 8,
  },
  {
    id: 'tav_012',
    category: '酒馆',
    narrative: (h) => `${h}在酒馆中遇到一位从西域来的胡商，用一坛好酒换了一份藏宝图——不知真假。`,
    effects: { hot: 5, reputation: 5 },
    weight: 7,
  },
  {
    id: 'tav_013',
    category: '酒馆',
    narrative: (h) => `${h}在酒馆讲述自己过往的战绩，越讲越夸张，听众们却越听越起劲。`,
    effects: { hot: 12, reputation: 5, credit: -3 },
    weight: 7,
  },
  {
    id: 'tav_014',
    category: '酒馆',
    narrative: (h) => `${h}在酒馆偶遇旧友，两人回忆往昔，感慨万千，双双泪下。旁人皆被感动。`,
    effects: { hot: 8, reputation: 5, morality: 3 },
    weight: 6,
  },
  {
    id: 'tav_015',
    category: '酒馆',
    narrative: (h) => `${h}醉后放言"谁敢与我一战"，结果没人应战——因为大家都怕了。`,
    effects: { hot: 12, reputation: 8 },
    weight: 6,
    minRound: 3,
  },
];

// ============================================================
// 汇总所有奇遇
// ============================================================

export const ENCOUNTERS: Encounter[] = ADVENTURES;

// ============================================================
// 随机抽取函数
// ============================================================

/**
 * 按权重随机抽取若干个奇遇，分配给不同英雄
 * @param round     当前回合 (1-5)
 * @param heroNames 候选英雄名单
 * @param count     要抽取的奇遇数量
 * @returns         抽取结果数组
 */
export function rollEncounters(
  round: number,
  heroNames: string[],
  count: number,
): { heroName: string; encounter: Encounter }[] {
  if (heroNames.length === 0 || count <= 0) return [];

  // 按回合过滤可用奇遇
  const eligible = ENCOUNTERS.filter((e) => {
    if (e.minRound !== undefined && round < e.minRound) return false;
    if (e.maxRound !== undefined && round > e.maxRound) return false;
    return true;
  });

  if (eligible.length === 0) return [];

  // 计算权重总和
  const totalWeight = eligible.reduce((sum, e) => sum + e.weight, 0);

  // 加权随机选取一个奇遇（不放回抽样用索引标记）
  function weightedPick(pool: Encounter[]): Encounter {
    const poolWeight = pool.reduce((sum, e) => sum + e.weight, 0);
    let roll = Math.random() * poolWeight;
    for (const enc of pool) {
      roll -= enc.weight;
      if (roll <= 0) return enc;
    }
    return pool[pool.length - 1];
  }

  // 随机打乱英雄顺序
  const shuffledHeroes = [...heroNames].sort(() => Math.random() - 0.5);
  const actualCount = Math.min(count, shuffledHeroes.length);

  const results: { heroName: string; encounter: Encounter }[] = [];
  const usedEncounterIds = new Set<string>();

  for (let i = 0; i < actualCount; i++) {
    // 尝试选取一个未使用的奇遇
    let remainingPool = eligible.filter((e) => !usedEncounterIds.has(e.id));
    if (remainingPool.length === 0) {
      // 如果所有奇遇都用完了，重新开放（极端情况）
      remainingPool = eligible;
      usedEncounterIds.clear();
    }

    const encounter = weightedPick(remainingPool);
    usedEncounterIds.add(encounter.id);

    results.push({
      heroName: shuffledHeroes[i],
      encounter,
    });
  }

  return results;
}
