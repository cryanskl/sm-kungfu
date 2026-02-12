// ============================================================
// 自动解说弹幕生成
// ============================================================

import { DanmakuItem, GameEvent, GameHeroSnapshot } from '@/lib/types';

const FIGHT_TEMPLATES = [
  '好一招！{A}对{B}造成{dmg}点伤害！',
  '{A}出手如电！{B}承受了{dmg}点伤害！',
  '精彩对决！{A}猛攻{B}，造成{dmg}伤害！',
  '{A}势如破竹！{B}硬吃{dmg}点伤害！',
  '漂亮！{A}一击命中{B}，{dmg}伤害！',
  '这一招太狠了！{A}打得{B}连退三步！{dmg}伤害！',
  '{A}虎入羊群！{B}猝不及防，{dmg}伤害入骨！',
  '好家伙！{A}暴揍{B}！{dmg}点伤害拉满！',
  '痛痛痛！{B}被{A}打了{dmg}伤害，脸都歪了！',
  '666！{A}一顿操作猛如虎，{B}掉了{dmg}血！',
  '{A}这招教科书级别！{B}吃了{dmg}伤害！',
  '打起来了打起来了！{A}对{B}造成{dmg}伤害！精彩！',
];

const BETRAY_TEMPLATES = [
  '卑鄙！{A}竟然背叛了{B}！',
  '震惊！{A}反水了！{B}措手不及！',
  '无耻之徒！{A}背刺{B}！',
  '武德？不存在的！{A}出卖了{B}！',
  '什么？{A}居然对{B}下黑手！真没人性！',
  '笑嘻嘻转身捅刀！{A}太阴了！{B}哭晕！',
  '背叛！{A}对{B}使了卑鄙的暗招！江湖险恶啊！',
  '绝了！{A}翻脸比翻书还快！{B}措手不及！',
  '{A}：我从未见过如此厚颜无耻之人（对镜自赏）！{B}怒了！',
  '叛徒！{A}无情无义！{B}怒发冲冠！',
];

const ELIMINATED_TEMPLATES = [
  '{A}已被淘汰！第{n}位出局！',
  '可惜！{A}就此退场！这是第{n}位淘汰者！',
  '{A}倒下了！还剩几人能笑到最后？',
  '又一人出局！{A}遗憾离场！',
  '{A}：我还会回来的！（第{n}位淘汰）',
  '倒！{A}血条清零，第{n}位出局！下次加油！',
  '{A}：蚌埠住了……这是第{n}位淘汰者！',
  '一路走好！{A}倒在了武林大会上，第{n}位出局！',
  '呜呜呜{A}被淘汰了！第{n}位出局，心疼！',
  '大势已去！{A}无力回天，第{n}个离场！',
];

const CHAMPION_TEMPLATES = [
  '恭喜{A}荣登武林盟主！天下第一！',
  '{A}称霸武林！无人可挡！',
  '新一代盟主诞生！{A}威震江湖！',
  '绝了！{A}登顶武林之巅！YYDS！',
  '全场起立！{A}就是新任武林盟主！',
  '一战封神！{A}问鼎天下！太强了！',
  '恐怖如斯！{A}实至名归，武林盟主非你莫属！',
  '{A}：这个武林盟主，我当定了！众人：服！',
  '历史见证！{A}登基武林盟主！撒花！',
  '王者降临！{A}荣耀加冕，天下第一！',
];

const ALLY_TEMPLATES = [
  '{A}与{B}结为同盟！强强联手！',
  '好事！{A}和{B}联手了！',
  '{A}与{B}化敌为友，结成联盟！',
  '卧龙凤雏！{A}和{B}联手了！有好戏看了！',
  '双剑合璧！{A}与{B}强强联合！',
  '{A}和{B}组CP了！这阵容无敌！',
  '联盟达成！{A}和{B}一笑泯恩仇！',
  '互相抱大腿！{A}与{B}联手，这下麻烦了！',
  '{A}和{B}结盟了！其他人瑟瑟发抖中……',
  '好家伙！{A}与{B}手拉手，这谁顶得住！',
];

const DIRECTOR_TEMPLATES = [
  '天降奇遇！江湖又要变天了！',
  '好家伙！这剧情转折绝了！',
  '导演出手了！又有大事要发生！',
  '注意！江湖风云突变！',
  '情况有变！所有人打起精神！',
  '哇哦！这个展开没想到！好刺激！',
  '大新闻！大新闻！武林又出大事了！',
  '精彩！这一局越来越好看了！',
];

const WELCOME_TEMPLATES = [
  '江湖传闻，{name}已到！各位小心了！',
  '{name}驾到！武林大会又添一位高手！',
  '哇！{name}来了！这下有好戏看了！',
  '{name}入座！今日武林，必有一战！',
  '欢迎{name}！英雄请就坐！',
  '{name}闪亮登场！全场肃静！',
  '报！{name}已至！各路英豪请注意！',
  '{name}款款入场，气场两米八！',
  '有请{name}！江湖地位不可小觑！',
  '{name}驾到，武林大会正式热闹起来了！',
  '噫！{name}也来了？这届大会卧虎藏龙啊！',
  '{name}入席！看这架势，来者不善！',
  '掌声欢迎{name}！今日一战定乾坤！',
  '{name}到场！各位做好准备，大战将至！',
  '好家伙！{name}居然也来了！稳了稳了！',
  '{name}缓缓入座，一股高手气息扑面而来！',
  '恭迎{name}！武林大会因你更精彩！',
  '{name}来了！我已经开始期待了！',
  '注意！{name}已就位！这位可不好惹！',
  '{name}驾临！今日群英荟萃！',
  '传说中的{name}！终于等到你了！',
  '{name}现身！江湖又要变天了！',
  '哇哦！{name}也来凑热闹了！好！',
  '{name}：诸位，久等了！（帅气入座）',
  '快看！{name}来了！这位实力深不可测！',
  '{name}入场！气势如虹，不怒自威！',
  '恭候{name}多时！请上座！',
  '{name}终于到了！大家翘首以盼呢！',
  '一代宗师{name}驾到！后排的站起来看看！',
  '{name}飘然而至！好一个江湖儿女！',
];

let eliminationCount = 0;

export function resetEliminationCount() {
  eliminationCount = 0;
}

/**
 * Generate a welcome danmaku when a hero takes a seat during countdown.
 */
export function generateWelcomeDanmaku(heroName: string): DanmakuItem {
  const tpl = WELCOME_TEMPLATES[Math.floor(Math.random() * WELCOME_TEMPLATES.length)];
  const text = tpl.replace(/\{name\}/g, heroName);
  return {
    id: `welcome-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    wuxiaText: text,
    color: Math.random() < 0.5 ? 'gold' : 'cyan',
    createdAt: new Date().toISOString(),
  };
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fillTemplate(tpl: string, vars: Record<string, string | number>): string {
  let result = tpl;
  for (const [k, v] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return result;
}

/**
 * Generate a commentary danmaku for an event.
 * Returns null for events that don't warrant commentary.
 */
export function generateCommentary(
  event: Partial<GameEvent>,
  heroes: GameHeroSnapshot[],
): DanmakuItem | null {
  // Only comment on notable events
  if ((event.priority ?? 0) < 5) return null;

  const heroName = (id: string | null | undefined): string => {
    if (!id) return '无名';
    return heroes.find(h => h.heroId === id)?.heroName || '无名';
  };

  const type = event.eventType;
  let text = '';
  let color: DanmakuItem['color'] = 'red';

  if (type === 'fight' || type === 'gang_up' || type === 'scramble') {
    const dmg = Math.abs(event.hpDelta || 0);
    text = fillTemplate(pick(FIGHT_TEMPLATES), {
      A: heroName(event.heroId),
      B: heroName(event.targetHeroId),
      dmg,
    });
    color = 'gold';
  } else if (type === 'betray') {
    text = fillTemplate(pick(BETRAY_TEMPLATES), {
      A: heroName(event.heroId),
      B: heroName(event.targetHeroId),
    });
    color = 'red';
  } else if (type === 'eliminated') {
    eliminationCount++;
    text = fillTemplate(pick(ELIMINATED_TEMPLATES), {
      A: heroName(event.heroId),
      n: eliminationCount,
    });
    color = 'red';
  } else if (type === 'champion') {
    text = fillTemplate(pick(CHAMPION_TEMPLATES), {
      A: heroName(event.heroId),
    });
    color = 'gold';
  } else if (type === 'ally_formed') {
    text = fillTemplate(pick(ALLY_TEMPLATES), {
      A: heroName(event.heroId),
      B: heroName(event.targetHeroId),
    });
    color = 'cyan';
  } else if (type === 'director_event') {
    text = pick(DIRECTOR_TEMPLATES);
    color = 'gold';
  } else {
    return null;
  }

  return {
    id: `commentary-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    wuxiaText: `【解说】${text}`,
    color,
    isCommentary: true,
    createdAt: new Date().toISOString(),
  };
}

// === 封神榜庆祝弹幕 ===

const CELEBRATION_TEMPLATES = [
  '恭喜道友！武林大会圆满结束！',
  '恭贺新盟主登基！撒花撒花！',
  '精彩绝伦！这届大会太好看了！',
  '道友威武！来日再战！',
  '好一场龙争虎斗！痛快！',
  '恭喜恭喜！江湖再会！',
  '贺！新盟主威震四方！',
  '此战当载入武林史册！',
  '各位道友辛苦了！下次再来！',
  '英雄不问出处！恭喜各位！',
  '武林盟主实至名归！',
  '好戏已落幕，江湖路还长！',
  '道友们后会有期！',
  '这一战，看得热血沸腾！',
  '盟主威武！我辈楷模！',
  '来日方长，英雄再聚！',
  '可喜可贺！武林又添一段佳话！',
  '今日一别，他日江湖再见！',
  '好一个武林盟主！心服口服！',
  '下一届我也要上场！等着我！',
  '天下英雄尽入毂中，精彩至极！',
  '这届大会名不虚传！',
  '恭喜各位道友全身而退（大概）！',
  '盟主请收下我的膝盖！',
  '各路英豪请受我一拜！',
];

/**
 * Generate a batch of celebratory danmaku for the 封神榜 screen.
 * Returns an array of DanmakuItems to be staggered over time.
 */
export function generateCelebrationDanmaku(championName?: string): DanmakuItem[] {
  const items: DanmakuItem[] = [];
  const used = new Set<number>();
  const count = 12 + Math.floor(Math.random() * 6); // 12-17 messages

  for (let i = 0; i < count; i++) {
    let idx: number;
    do {
      idx = Math.floor(Math.random() * CELEBRATION_TEMPLATES.length);
    } while (used.has(idx) && used.size < CELEBRATION_TEMPLATES.length);
    used.add(idx);

    let text = CELEBRATION_TEMPLATES[idx];
    // Occasionally personalize with champion name
    if (championName && Math.random() < 0.3) {
      const personalTemplates = [
        `恭喜${championName}荣登盟主！`,
        `${championName}威武！天下第一！`,
        `${championName}实至名归！`,
        `为${championName}喝彩！`,
        `${championName}yyds！`,
      ];
      text = personalTemplates[Math.floor(Math.random() * personalTemplates.length)];
    }

    items.push({
      id: `celebration-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      wuxiaText: text,
      color: Math.random() < 0.4 ? 'gold' : Math.random() < 0.5 ? 'cyan' : 'white',
      createdAt: new Date().toISOString(),
    });
  }

  return items;
}
