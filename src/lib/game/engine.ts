import { supabaseAdmin } from '../supabase';
import { GameEvent, GameHeroSnapshot, Decision, ActionType, GameStatus } from '../types';
import { SecondMeClient, parseAiResponse } from './secondme-client';
import { getNpcDecision } from './npc-decisions';
import { calculateDamage, rollInitiative, rollCounterAttack, applyLuckBonus } from './combat';
import { roundPrompt, speechPrompt, deathPactPrompt, DIRECTOR_EVENTS } from './prompts';
import { NPC_TEMPLATES, pickRandomTrait, GAME_TRAITS } from './npc-data/templates';
import * as C from './constants';
import { narratives } from './narratives';
import { rollEncounters } from './encounters';

// 确定性 trait 分配：同一局同一 NPC 始终得到同一特质（技术要点：随机种子与可复现）
function getStableTrait(gameId: string, npcId: string): typeof GAME_TRAITS[0] {
  let hash = 0;
  const seed = `${gameId}:${npcId}`;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return GAME_TRAITS[Math.abs(hash) % GAME_TRAITS.length];
}

// ============================================================
// 游戏引擎
// ============================================================

interface RoundResult {
  events: Partial<GameEvent>[];
  roundNumber: number;
  heroSnapshots: GameHeroSnapshot[];
}

// --- 处理一个回合（幂等）---
export async function processRound(gameId: string, roundNumber: number): Promise<RoundResult> {
  const t0 = Date.now();
  console.log(`[Engine] ▶ processRound game=${gameId.slice(0,8)} round=${roundNumber}`);

  // 幂等锁：尝试将 status 从 expected 改为 processing
  // R1 的前置状态是 'intro'（start API 设置的），R2-R5 的前置状态是 'round_N'
  // R6 不走 processRound（由 finals API 处理），这里做防御性拦截
  if (roundNumber === 6) {
    console.log(`[Engine] ■ round=6 should use /api/engine/finals, skipping processRound`);
    const snapshots = await getHeroSnapshots(gameId);
    return { events: [], roundNumber, heroSnapshots: snapshots };
  }

  const expectedStatus = roundNumber === 1 ? 'intro' : `round_${roundNumber}`;
  const { data: game, error } = await supabaseAdmin
    .from('games')
    .update({ status: `processing_${roundNumber}`, current_round: roundNumber })
    .eq('id', gameId)
    .eq('status', expectedStatus)
    .select()
    .single();

  if (error || !game) {
    // 检查是否卡在 processing（崩溃恢复）
    const { data: stuckGame } = await supabaseAdmin
      .from('games')
      .select('status, current_round')
      .eq('id', gameId)
      .single();

    if (stuckGame?.status === `processing_${roundNumber}`) {
      // 检查是否卡了超过 30 秒（通过 game_state.updated_at 判断）
      const { data: gs } = await supabaseAdmin
        .from('game_state').select('updated_at').eq('id', 'current').single();
      const lastUpdate = gs?.updated_at ? new Date(gs.updated_at).getTime() : 0;
      const stuckSeconds = (Date.now() - lastUpdate) / 1000;

      if (stuckSeconds > 30) {
        // 超时恢复：回滚到 expectedStatus 让下次请求重新处理
        console.warn(`[Engine] ⚠ round=${roundNumber} stuck in processing for ${stuckSeconds.toFixed(0)}s, resetting`);
        await supabaseAdmin.from('games')
          .update({ status: expectedStatus })
          .eq('id', gameId)
          .eq('status', `processing_${roundNumber}`);
        // 返回空让前端重试
        const snapshots = await getHeroSnapshots(gameId);
        return { events: [], roundNumber, heroSnapshots: snapshots };
      }
    }

    // 已经在处理或已完成，返回缓存的事件
    const { data: cachedEvents } = await supabaseAdmin
      .from('game_events')
      .select('*')
      .eq('game_id', gameId)
      .eq('round', roundNumber)
      .order('sequence', { ascending: true });

    const snapshots = await getHeroSnapshots(gameId);
    console.log(`[Engine] ■ round=${roundNumber} already processed (idempotent cache hit), ${(cachedEvents||[]).length} events`);
    return { events: cachedEvents || [], roundNumber, heroSnapshots: snapshots };
  }

  // 获取所有英雄状态
  const { data: gameHeroes } = await supabaseAdmin
    .from('game_heroes')
    .select('*, hero:heroes(*)')
    .eq('game_id', gameId)
    .order('seat_number');

  if (!gameHeroes || gameHeroes.length === 0) {
    throw new Error('No heroes in game');
  }

  const snapshots = gameHeroesToSnapshots(gameHeroes);
  const aliveSnapshots = snapshots.filter(h => !h.isEliminated);

  // 1. 收集所有决策
  const decisions = await collectDecisions(gameId, roundNumber, gameHeroes, snapshots);

  // 2. 结算
  const events = await resolveRound(gameId, roundNumber, decisions, gameHeroes, snapshots);

  // 3. 写入事件
  if (events.length > 0) {
    await supabaseAdmin.from('game_events').insert(
      events.map((e, i) => ({
        game_id: gameId,
        round: roundNumber,
        sequence: i,
        event_type: e.eventType,
        priority: e.priority,
        hero_id: e.heroId,
        target_hero_id: e.targetHeroId,
        action: e.action,
        data: e.data,
        narrative: e.narrative,
        taunt: e.taunt,
        inner_thought: e.innerThought,
        reputation_delta: e.reputationDelta,
        hot_delta: e.hotDelta,
        hp_delta: e.hpDelta,
      }))
    );
  }

  // 4. 设置下一个状态
  // R5 结束后直接进 semifinals（R6 由 finals API 处理，不走 processRound）
  const nextStatus = roundNumber < 5 ? `round_${roundNumber + 1}` : 'semifinals';
  await supabaseAdmin
    .from('games')
    .update({ status: nextStatus, current_round: roundNumber })
    .eq('id', gameId);

  // 5. 更新 game_state 缓存（使用 nextStatus 保持一致）
  const finalSnapshots = await getHeroSnapshots(gameId);
  await updateGameStateCache(gameId, roundNumber, events, finalSnapshots, nextStatus);

  console.log(`[Engine] ✓ round=${roundNumber} done in ${Date.now()-t0}ms, ${events.length} events, next=${nextStatus}`);
  return { events, roundNumber, heroSnapshots: finalSnapshots };
}

// ============================================================
// 收集决策
// ============================================================

async function collectDecisions(
  gameId: string,
  roundNumber: number,
  gameHeroes: any[],
  snapshots: GameHeroSnapshot[],
): Promise<Map<string, Decision>> {
  const decisions = new Map<string, Decision>();
  const directorEvent = DIRECTOR_EVENTS[roundNumber];
  const aliveHeroes = gameHeroes.filter((gh: any) => !gh.is_eliminated);

  const promises = aliveHeroes.map(async (gh: any) => {
    const hero = gh.hero;
    const snapshot = snapshots.find(s => s.heroId === gh.hero_id)!;

    let decision: Decision;

    if (hero.is_npc) {
      // NPC 本地计算
      const template = NPC_TEMPLATES.find(t => t.id === hero.npc_template_id);
      if (template) {
        decision = getNpcDecision({
          roundNumber,
          heroes: snapshots,
          selfHeroId: gh.hero_id,
          template,
          gameTrait: getStableTrait(gameId, hero.npc_template_id || hero.id),
          allyHeroId: gh.ally_hero_id,
          allyHeroName: snapshots.find(s => s.heroId === gh.ally_hero_id)?.heroName || null,
          lastAttackedBy: null, // TODO: 从上回合事件中读取
        });
      } else {
        decision = { action: 'train', target: null, taunt: '……', reason: '……' };
      }
    } else {
      // 真人：调 SecondMe API
      try {
        let client = new SecondMeClient(hero.access_token || '');

        let prompt: string;
        if (roundNumber === 5) {
          prompt = deathPactPrompt(snapshot, snapshots);
        } else {
          prompt = roundPrompt(
            roundNumber, snapshot, snapshots,
            directorEvent.description,
            directorEvent.availableActions,
          );
        }

        decision = await client.getDecision(prompt);

        // 如果返回的是默认 fallback（可能 token 过期），尝试刷新
        if (decision.action === 'train' && decision.taunt === '……' && hero.refresh_token) {
          const refreshed = await SecondMeClient.refreshToken(hero.refresh_token);
          if (refreshed) {
            // 更新数据库中的 token
            await supabaseAdmin.from('heroes').update({
              access_token: refreshed.accessToken,
              refresh_token: refreshed.refreshToken,
            }).eq('id', hero.id);
            // 用新 token 重试
            client = new SecondMeClient(refreshed.accessToken);
            decision = await client.getDecision(prompt);
          }
        }
      } catch (err) {
        console.error(`[Engine] Hero ${hero.hero_name} API error:`, err);
        // API 失败 fallback
        decision = { action: 'train', target: null, taunt: '……', reason: '无法通讯。' };
      }
    }

    // 验证 target 是否存在
    if (decision.target) {
      const targetExists = snapshots.some(
        s => s.heroName === decision.target && !s.isEliminated
      );
      if (!targetExists) {
        const alive = snapshots.filter(s => !s.isEliminated && s.heroId !== gh.hero_id);
        decision.target = alive.length > 0
          ? alive[Math.floor(Math.random() * alive.length)].heroName
          : null;
      }
    }

    decisions.set(gh.hero_id, decision);
  });

  await Promise.allSettled(promises);
  return decisions;
}

// ============================================================
// 结算回合
// ============================================================

async function resolveRound(
  gameId: string,
  roundNumber: number,
  decisions: Map<string, Decision>,
  gameHeroes: any[],
  snapshots: GameHeroSnapshot[],
): Promise<Partial<GameEvent>[]> {
  const events: Partial<GameEvent>[] = [];
  const updates: Map<string, Record<string, any>> = new Map();

  // 初始化更新记录
  for (const gh of gameHeroes) {
    updates.set(gh.hero_id, {});
  }

  const getSnapshot = (heroId: string) => snapshots.find(s => s.heroId === heroId)!;
  const getHeroIdByName = (name: string) => snapshots.find(s => s.heroName === name)?.heroId;
  const alive = snapshots.filter(s => !s.isEliminated);

  // --- 导演事件 ---
  events.push({
    eventType: 'director_event',
    priority: 8,
    narrative: `【第${roundNumber}回合 · ${DIRECTOR_EVENTS[roundNumber].title}】${DIRECTOR_EVENTS[roundNumber].flavor || DIRECTOR_EVENTS[roundNumber].description}`,
    data: { roundNumber, title: DIRECTOR_EVENTS[roundNumber].title },
  } as any);

  // --- 分类决策 ---
  const fighters: { heroId: string; target: string; decision: Decision }[] = [];
  const trainers: string[] = [];
  const explorers: string[] = [];
  const allyers: { heroId: string; target: string }[] = [];
  const betrayers: { heroId: string; target: string }[] = [];
  const resters: string[] = [];

  for (const [heroId, decision] of decisions) {
    const snapshot = getSnapshot(heroId);
    if (snapshot.isEliminated) continue;

    // 记录决策事件
    events.push({
      eventType: 'decision',
      priority: 1,
      heroId,
      action: decision.action,
      taunt: decision.taunt,
      innerThought: decision.reason,
      narrative: `${snapshot.heroName}：「${decision.taunt}」`,
      data: { action: decision.action, target: decision.target },
    } as any);

    const targetId = decision.target ? getHeroIdByName(decision.target) : null;

    switch (decision.action) {
      case 'fight':
        if (targetId) fighters.push({ heroId, target: targetId, decision });
        break;
      case 'train':
        trainers.push(heroId);
        break;
      case 'explore':
        explorers.push(heroId);
        break;
      case 'ally':
        if (targetId) allyers.push({ heroId, target: targetId });
        break;
      case 'betray':
        if (targetId) betrayers.push({ heroId, target: targetId });
        break;
      case 'rest':
        resters.push(heroId);
        break;
    }

    // R5 生死状
    if (roundNumber === 5 && decision.signDeathPact) {
      await supabaseAdmin
        .from('game_heroes')
        .update({ has_death_pact: true, has_ultimate: true })
        .eq('game_id', gameId)
        .eq('hero_id', heroId);

      addDelta(updates, heroId, 'reputation', C.REP.SIGN_DEATH_PACT);
      addDelta(updates, heroId, 'hot', C.HOT.SIGN_DEATH_PACT);
    }
  }

  // --- R1 残卷争夺 ---
  if (roundNumber === 1 && explorers.length > 0) {
    const scrambleEvents = resolveScramble(explorers, snapshots, updates);
    events.push(...scrambleEvents);
  } else if (roundNumber === 1 && explorers.length === 0) {
    // 保底：残卷碎裂，随机3个修炼者获得弱化版
    const lucky = trainers.slice(0, 3);
    for (const heroId of lucky) {
      const name = getSnapshot(heroId).heroName;
      const martialArt = { name: '九阴残片', attackBonus: C.R1_FALLBACK_ATTACK_BONUS, defenseBonus: 0 };
      events.push({
        eventType: 'explore',
        priority: 3,
        heroId,
        narrative: `残卷碎裂！碎片飞向修炼中的${name}！获得残卷碎片（攻击+${C.R1_FALLBACK_ATTACK_BONUS}）`,
        data: { martialArt },
        reputationDelta: 15,
      } as any);
      addDelta(updates, heroId, 'reputation', 15);
      addMartialArt(updates, heroId, martialArt);
    }
  }

  // --- R2 方丈收徒 ---
  if (roundNumber === 2 && trainers.length > 0) {
    // 所有选 train 的人发表宣言，按 taunt 长度+随机评分（简化版）
    const speeches = trainers.map(heroId => {
      const d = decisions.get(heroId);
      const taunt = d?.taunt || '……';
      // 评分：taunt 字数 × 2 + 随机 0~20 + 魅力 × 0.5
      const snap = getSnapshot(heroId);
      const score = Math.min(taunt.length, 15) * 2 + Math.floor(Math.random() * 20) + Math.round(snap.charisma * 0.5);
      return { heroId, taunt, score, name: snap.heroName };
    }).sort((a, b) => b.score - a.score);

    // 评分最高者拜师成功
    const winner = speeches[0];
    events.push({
      eventType: 'speech',
      priority: 5,
      heroId: winner.heroId,
      narrative: `🙏 ${winner.name}拜师宣言：「${winner.taunt}」—— 方丈大悦，收为关门弟子！全属性+${C.R2_MASTER_ATTR_BONUS}！`,
      data: { speechScore: winner.score, isMaster: true },
      reputationDelta: 20,
      hotDelta: 20,
    } as any);
    addDelta(updates, winner.heroId, 'reputation', 20);
    addDelta(updates, winner.heroId, 'hot', 20);

    // 其他宣言展示
    for (let i = 1; i < speeches.length; i++) {
      const s = speeches[i];
      const hotBonus = Math.max(5, 15 - i * 3);
      events.push({
        eventType: 'speech',
        priority: 3,
        heroId: s.heroId,
        narrative: `${s.name}宣言：「${s.taunt}」（评分：${s.score}）`,
        data: { speechScore: s.score, isMaster: false },
        hotDelta: hotBonus,
      } as any);
      addDelta(updates, s.heroId, 'hot', hotBonus);
    }
  }

  // --- R4 通缉令 ---
  if (roundNumber === 4) {
    const aliveSnaps = snapshots.filter(s => !s.isEliminated);
    const repSorted = [...aliveSnaps].sort((a, b) => b.reputation - a.reputation);
    if (repSorted.length >= 2) {
      const top1 = repSorted[0];
      const top2 = repSorted[1];
      const top3 = repSorted[2];
      const gap = top1.reputation - top2.reputation;

      if (gap <= 10 && top3) {
        // 声望差距小 → 三人混战擂台
        events.push({
          eventType: 'director_event',
          priority: 8,
          narrative: `⚡ 声望前三差距极小！导演组宣布：${top1.heroName}、${top2.heroName}、${top3.heroName} 三人混战擂台！胜者获 80 声望！`,
          data: { variant: 'three_way', heroes: [top1.heroId, top2.heroId, top3.heroId] },
        } as any);
        // 简化处理：按力量排序决出胜者
        const ranked = [top1, top2, top3].sort((a, b) => (b.strength + b.innerForce) - (a.strength + a.innerForce));
        addDelta(updates, ranked[0].heroId, 'reputation', 80);
        addDelta(updates, ranked[0].heroId, 'hot', 20);
        events.push({
          eventType: 'fight',
          priority: 7,
          heroId: ranked[0].heroId,
          narrative: `${ranked[0].heroName}在三人混战中胜出！获得 80 声望！`,
          reputationDelta: 80,
        } as any);
      } else {
        // 标准通缉令：声望第一被通缉
        events.push({
          eventType: 'director_event',
          priority: 8,
          narrative: `📜 ${top1.heroName}被挂上江湖通缉令！击败其可获 50 声望！但通缉犯有侠义光环加持（防御+50%）！`,
          data: { wantedHeroId: top1.heroId },
        } as any);
        // 标记通缉犯，在 fight 结算中应用 buff（通过 data 传递）
        // 这里将通缉信息写入 events data 供 fight 结算参考
      }
    }
  }

  // --- 处理结盟 ---
  for (const { heroId, target } of allyers) {
    // 检查对方是否也选了 ally 自己，或者没有攻击自己
    const targetDecision = decisions.get(target);
    const mutual = targetDecision?.action === 'ally' && getHeroIdByName(targetDecision.target || '') === heroId;
    const notHostile = targetDecision?.action !== 'fight' || getHeroIdByName(targetDecision.target || '') !== heroId;

    if (mutual || notHostile) {
      const heroName = getSnapshot(heroId).heroName;
      const targetName = getSnapshot(target).heroName;

      await supabaseAdmin
        .from('game_heroes')
        .update({ ally_hero_id: target })
        .eq('game_id', gameId)
        .eq('hero_id', heroId);
      await supabaseAdmin
        .from('game_heroes')
        .update({ ally_hero_id: heroId })
        .eq('game_id', gameId)
        .eq('hero_id', target);

      events.push({
        eventType: 'ally_formed',
        priority: 3,
        heroId,
        targetHeroId: target,
        narrative: narratives.ally(heroName, targetName),
        reputationDelta: C.REP.ALLY,
      } as any);
      addDelta(updates, heroId, 'reputation', C.REP.ALLY);
      addDelta(updates, target, 'reputation', C.REP.ALLY);
    }
  }

  // --- 处理背叛 ---
  for (const { heroId, target } of betrayers) {
    const heroName = getSnapshot(heroId).heroName;
    const targetName = getSnapshot(target).heroName;
    const targetSnapshot = getSnapshot(target);

    // 偷资源
    const stolenRep = Math.round(targetSnapshot.reputation * C.R3_BETRAY_RESOURCE_STEAL);

    await supabaseAdmin
      .from('game_heroes')
      .update({ ally_hero_id: null })
      .eq('game_id', gameId)
      .eq('hero_id', heroId);
    await supabaseAdmin
      .from('game_heroes')
      .update({ ally_hero_id: null })
      .eq('game_id', gameId)
      .eq('hero_id', target);

    const repDelta = roundNumber === 3 ? 0 : C.REP.BETRAY; // R3不扣声望

    events.push({
      eventType: 'betray',
      priority: 7,
      heroId,
      targetHeroId: target,
      narrative: narratives.betray(heroName, targetName, stolenRep),
      reputationDelta: repDelta,
      hotDelta: C.HOT.BETRAY,
      data: { stolenRep },
    } as any);

    addDelta(updates, heroId, 'reputation', repDelta + stolenRep);
    addDelta(updates, heroId, 'hot', C.HOT.BETRAY);
    addDelta(updates, heroId, 'morality', -C.R3_BETRAY_MORALITY_COST);
    addDelta(updates, heroId, 'credit', -C.R3_BETRAY_CREDIT_COST);
    addDelta(updates, target, 'reputation', -stolenRep);
  }

  // --- 处理战斗 ---
  const fightEvents = resolveFights(fighters, snapshots, gameHeroes, updates, gameId, roundNumber);
  events.push(...fightEvents);

  // --- 处理修炼 ---
  for (const heroId of trainers) {
    const name = getSnapshot(heroId).heroName;
    events.push({
      eventType: 'train',
      priority: 1,
      heroId,
      narrative: narratives.train(name),
      reputationDelta: C.REP.TRAIN,
      hpDelta: C.TRAIN_HP_RECOVERY,
    } as any);
    addDelta(updates, heroId, 'reputation', C.REP.TRAIN);
    addDelta(updates, heroId, 'hp', C.TRAIN_HP_RECOVERY);
  }

  // --- 处理休息 ---
  for (const heroId of resters) {
    const name = getSnapshot(heroId).heroName;
    events.push({
      eventType: 'rest',
      priority: 1,
      heroId,
      narrative: narratives.rest(name),
      hpDelta: C.REST_HP_RECOVERY,
    } as any);
    addDelta(updates, heroId, 'hp', C.REST_HP_RECOVERY);
  }

  // --- 嘴炮特质：NPC 有嘴炮特质则每回合 +5 Hot ---
  for (const gh of gameHeroes) {
    if (!gh.hero?.is_npc) continue;
    const trait = getStableTrait(gameId, gh.hero?.npc_template_id || gh.id);
    if (trait.name === '嘴炮') {
      addDelta(updates, gh.hero_id, 'hot', 5);
    }
  }

  // --- 随机奇遇 ---
  {
    const aliveNames = alive.filter(h => !h.isEliminated).map(h => h.heroName);
    // 每回合 ~15-20 个奇遇，让 30s 内每秒都有新事件
    const encounterCount = Math.min(Math.max(10, aliveNames.length + 8), 20);
    const rolled = rollEncounters(roundNumber, aliveNames, encounterCount);

    for (const { heroName, encounter } of rolled) {
      const heroId = getHeroIdByName(heroName);
      if (!heroId) continue;

      events.push({
        eventType: 'encounter',
        priority: 4,
        heroId,
        narrative: encounter.narrative(heroName),
        reputationDelta: encounter.effects.reputation || 0,
        hotDelta: encounter.effects.hot || 0,
        hpDelta: encounter.effects.hp || 0,
        data: { encounterId: encounter.id, category: encounter.category },
      } as any);

      if (encounter.effects.hp) addDelta(updates, heroId, 'hp', encounter.effects.hp);
      if (encounter.effects.reputation) addDelta(updates, heroId, 'reputation', encounter.effects.reputation);
      if (encounter.effects.hot) addDelta(updates, heroId, 'hot', encounter.effects.hot);
      if (encounter.effects.morality) addDelta(updates, heroId, 'morality', encounter.effects.morality);
      if (encounter.effects.credit) addDelta(updates, heroId, 'credit', encounter.effects.credit);

      if (encounter.martialArt) {
        addMartialArt(updates, heroId, encounter.martialArt);
        events.push({
          eventType: 'encounter',
          priority: 5,
          heroId,
          narrative: `${heroName}习得新武学【${encounter.martialArt.name}】！（攻击+${encounter.martialArt.attackBonus}，防御+${encounter.martialArt.defenseBonus}）`,
          data: { martialArt: encounter.martialArt },
        } as any);
      }
    }
  }

  // --- R2 方丈收徒：获胜者全属性 +3 写入 heroes 表 ---
  if (roundNumber === 2) {
    const masterEvent = events.find(e => (e as any).data?.isMaster === true);
    if (masterEvent && masterEvent.heroId) {
      const heroRecord = gameHeroes.find((g: any) => g.hero_id === masterEvent.heroId);
      if (heroRecord) {
        const bonus = C.R2_MASTER_ATTR_BONUS;
        await supabaseAdmin
          .from('heroes')
          .update({
            strength: (heroRecord.hero?.strength || 10) + bonus,
            inner_force: (heroRecord.hero?.inner_force || 10) + bonus,
            agility: (heroRecord.hero?.agility || 10) + bonus,
            constitution: (heroRecord.hero?.constitution || 10) + bonus,
            wisdom: (heroRecord.hero?.wisdom || 10) + bonus,
            charisma: (heroRecord.hero?.charisma || 10) + bonus,
          })
          .eq('id', masterEvent.heroId);
      }
    }
  }

  // --- 应用所有更新到数据库 ---
  for (const [heroId, deltas] of updates) {
    if (Object.keys(deltas).length === 0) continue;

    const gh = gameHeroes.find((g: any) => g.hero_id === heroId);
    if (!gh) continue;

    const updateObj: Record<string, any> = {};
    for (const [field, delta] of Object.entries(deltas)) {
      if (field === 'hp') {
        updateObj.hp = Math.max(0, Math.min(C.INITIAL_HP, (gh.hp || C.INITIAL_HP) + (delta as number)));
      } else if (field === 'reputation') {
        updateObj.reputation = Math.max(0, (gh.reputation || 0) + (delta as number));
      } else if (field === 'hot') {
        updateObj.hot = Math.max(0, (gh.hot || 0) + (delta as number));
      } else if (field === 'morality') {
        updateObj.morality = Math.max(0, (gh.morality || C.INITIAL_MORALITY) + (delta as number));
      } else if (field === 'credit') {
        updateObj.credit = Math.max(0, (gh.credit || C.INITIAL_CREDIT) + (delta as number));
      }
    }

    // 持久化新获得的武学
    if (deltas._martialArts && deltas._martialArts.length > 0) {
      const existing = gh.martial_arts || [];
      updateObj.martial_arts = [...existing, ...deltas._martialArts];
    }

    // 检查是否淘汰
    if (updateObj.hp !== undefined && updateObj.hp <= 0) {
      updateObj.is_eliminated = true;
      updateObj.elimination_round = roundNumber;

      const name = getSnapshot(heroId).heroName;
      events.push({
        eventType: 'eliminated',
        priority: 8,
        heroId,
        narrative: narratives.eliminated(name),
        data: {},
      } as any);
    }

    await supabaseAdmin
      .from('game_heroes')
      .update(updateObj)
      .eq('game_id', gameId)
      .eq('hero_id', heroId);
  }

  return events;
}

// ============================================================
// 残卷争夺
// ============================================================

function resolveScramble(
  explorers: string[],
  snapshots: GameHeroSnapshot[],
  updates: Map<string, Record<string, any>>,
): Partial<GameEvent>[] {
  const events: Partial<GameEvent>[] = [];

  // 按力量+轻功排序
  const ranked = explorers
    .map(id => ({ id, score: (snapshots.find(s => s.heroId === id)?.strength || 0) + (snapshots.find(s => s.heroId === id)?.agility || 0) }))
    .sort((a, b) => b.score - a.score);

  const winners = ranked.slice(0, C.R1_SCROLL_SLOTS);
  const losers = ranked.slice(C.R1_SCROLL_SLOTS);

  for (const w of winners) {
    const name = snapshots.find(s => s.heroId === w.id)?.heroName;
    const martialArt = { name: '九阴白骨爪', attackBonus: C.R1_SCROLL_ATTACK_BONUS, defenseBonus: 0 };
    events.push({
      eventType: 'scramble',
      priority: 4,
      heroId: w.id,
      narrative: narratives.scrambleWin(name || '无名', '九阴白骨爪', C.R1_SCROLL_ATTACK_BONUS),
      reputationDelta: C.R1_SCROLL_REPUTATION,
      data: { won: true, martialArt },
    } as any);
    addDelta(updates, w.id, 'reputation', C.R1_SCROLL_REPUTATION);
    // 标记需要写入武学（在 resolveRound 中统一处理 DB 写入）
    addMartialArt(updates, w.id, martialArt);
  }

  for (const l of losers) {
    const name = snapshots.find(s => s.heroId === l.id)?.heroName;
    events.push({
      eventType: 'scramble',
      priority: 3,
      heroId: l.id,
      narrative: narratives.scrambleLose(name || '无名', C.R1_SCRAMBLE_LOSE_HP),
      hpDelta: -C.R1_SCRAMBLE_LOSE_HP,
      reputationDelta: C.R1_SCRAMBLE_LOSE_REP,
      data: { won: false },
    } as any);
    addDelta(updates, l.id, 'hp', -C.R1_SCRAMBLE_LOSE_HP);
    addDelta(updates, l.id, 'reputation', C.R1_SCRAMBLE_LOSE_REP);
  }

  return events;
}

// ============================================================
// 战斗结算
// ============================================================

function resolveFights(
  fighters: { heroId: string; target: string; decision: Decision }[],
  snapshots: GameHeroSnapshot[],
  gameHeroes: any[],
  updates: Map<string, Record<string, any>>,
  gameId: string,
  roundNumber: number,
): Partial<GameEvent>[] {
  const events: Partial<GameEvent>[] = [];
  const processed = new Set<string>();

  // 检查围攻（多人攻击同一目标）
  const targetCount = new Map<string, string[]>();
  for (const f of fighters) {
    if (!targetCount.has(f.target)) targetCount.set(f.target, []);
    targetCount.get(f.target)!.push(f.heroId);
  }

  for (const [targetId, attackerIds] of targetCount) {
    if (attackerIds.some(id => processed.has(id))) continue;

    const targetSnap = snapshots.find(s => s.heroId === targetId)!;
    if (!targetSnap || targetSnap.isEliminated) continue;

    if (attackerIds.length >= 2) {
      // 围攻
      let totalDamage = 0;
      for (const attackerId of attackerIds) {
        const attSnap = snapshots.find(s => s.heroId === attackerId)!;
        const dmg = calculateDamage({
          attackerAttrs: attSnap, defenderAttrs: targetSnap,
          attackerMartialArts: attSnap.martialArts, defenderMartialArts: targetSnap.martialArts,
          isGangUp: true,
        });
        totalDamage += dmg;
        processed.add(attackerId);
      }

      const attackerNames = attackerIds.map(id => snapshots.find(s => s.heroId === id)?.heroName).join('、');
      events.push({
        eventType: 'gang_up',
        priority: 6,
        heroId: attackerIds[0],
        targetHeroId: targetId,
        narrative: narratives.gangUp(attackerNames, targetSnap.heroName, totalDamage),
        hpDelta: -totalDamage,
        data: { attackerIds, totalDamage },
      } as any);

      addDelta(updates, targetId, 'hp', -totalDamage);
      for (const id of attackerIds) {
        addDelta(updates, id, 'reputation', C.REP.PK_WIN);
      }

      // 反杀
      if (rollCounterAttack(targetSnap.wisdom)) {
        const weakestId = attackerIds.reduce((min, id) => {
          const hp = snapshots.find(s => s.heroId === id)?.hp || 999;
          return hp < (snapshots.find(s => s.heroId === min)?.hp || 999) ? id : min;
        }, attackerIds[0]);
        const counterDmg = Math.round(targetSnap.strength * 0.5);
        addDelta(updates, weakestId, 'hp', -counterDmg);
        events.push({
          eventType: 'fight',
          priority: 5,
          heroId: targetId,
          targetHeroId: weakestId,
          narrative: narratives.counter(targetSnap.heroName, snapshots.find(s => s.heroId === weakestId)?.heroName || '对手', counterDmg),
          hpDelta: -counterDmg,
          data: { counter: true },
        } as any);
      }
    } else {
      // 1v1
      const attackerId = attackerIds[0];
      if (processed.has(attackerId)) continue;
      processed.add(attackerId);

      const attSnap = snapshots.find(s => s.heroId === attackerId)!;
      const gh = gameHeroes.find((g: any) => g.hero_id === attackerId);

      const damage = calculateDamage({
        attackerAttrs: attSnap, defenderAttrs: targetSnap,
        attackerMartialArts: attSnap.martialArts, defenderMartialArts: targetSnap.martialArts,
        isDeathPact: gh?.has_death_pact,
        isRevenge: false, // TODO: check revenge buff
      });

      // 虚竹运气加成
      const isXuzhu = snapshots.find(s => s.heroId === attackerId)?.heroName === '虚竹';
      const finalDamage = applyLuckBonus(damage, isXuzhu);

      events.push({
        eventType: 'fight',
        priority: 5,
        heroId: attackerId,
        targetHeroId: targetId,
        narrative: narratives.fight(attSnap.heroName, targetSnap.heroName, finalDamage),
        hpDelta: -finalDamage,
        reputationDelta: C.REP.PK_WIN,
        data: { damage: finalDamage },
        taunt: fighters.find(f => f.heroId === attackerId)?.decision.taunt,
      } as any);

      addDelta(updates, targetId, 'hp', -finalDamage);
      addDelta(updates, attackerId, 'reputation', C.REP.PK_WIN);
      addDelta(updates, targetId, 'reputation', C.REP.PK_LOSE);
    }
  }

  return events;
}

// ============================================================
// 辅助函数
// ============================================================

function addDelta(updates: Map<string, Record<string, any>>, heroId: string, field: string, delta: number) {
  const current = updates.get(heroId);
  if (current) {
    current[field] = (current[field] || 0) + delta;
  }
}

function addMartialArt(updates: Map<string, Record<string, any>>, heroId: string, art: { name: string; attackBonus: number; defenseBonus: number }) {
  const current = updates.get(heroId);
  if (current) {
    if (!current._martialArts) current._martialArts = [];
    current._martialArts.push(art);
  }
}

function gameHeroesToSnapshots(gameHeroes: any[]): GameHeroSnapshot[] {
  return gameHeroes.map((gh: any) => ({
    heroId: gh.hero_id,
    heroName: gh.hero?.hero_name || '无名',
    faction: gh.hero?.faction || '少林',
    personalityType: gh.hero?.personality_type || 'random',
    seatNumber: gh.seat_number,
    hp: gh.hp,
    maxHp: C.INITIAL_HP,
    reputation: gh.reputation || 0,
    hot: gh.hot || 0,
    morality: gh.morality || C.INITIAL_MORALITY,
    credit: gh.credit || C.INITIAL_CREDIT,
    isEliminated: gh.is_eliminated || false,
    allyHeroId: gh.ally_hero_id,
    allyHeroName: null,
    martialArts: gh.martial_arts || [],
    hasDeathPact: gh.has_death_pact || false,
    isNpc: gh.hero?.is_npc || false,
    catchphrase: gh.hero?.catchphrase || '……',
    avatarUrl: gh.hero?.avatar_url,
    strength: gh.hero?.strength || 10,
    innerForce: gh.hero?.inner_force || 10,
    agility: gh.hero?.agility || 10,
    wisdom: gh.hero?.wisdom || 10,
    constitution: gh.hero?.constitution || 10,
    charisma: gh.hero?.charisma || 10,
  }));
}

export async function getHeroSnapshots(gameId: string): Promise<GameHeroSnapshot[]> {
  const { data } = await supabaseAdmin
    .from('game_heroes')
    .select('*, hero:heroes(*)')
    .eq('game_id', gameId)
    .order('seat_number');

  return data ? gameHeroesToSnapshots(data) : [];
}

async function updateGameStateCache(
  gameId: string,
  roundNumber: number,
  events: Partial<GameEvent>[],
  snapshots: GameHeroSnapshot[],
  overrideStatus?: string,
) {
  const repRanking = [...snapshots]
    .filter(h => !h.isEliminated)
    .sort((a, b) => b.reputation - a.reputation)
    .map((h, i) => ({ heroId: h.heroId, heroName: h.heroName, faction: h.faction, value: h.reputation, rank: i + 1 }));

  const hotRanking = [...snapshots]
    .filter(h => !h.isEliminated)
    .sort((a, b) => b.hot - a.hot)
    .map((h, i) => ({ heroId: h.heroId, heroName: h.heroName, faction: h.faction, value: h.hot, rank: i + 1 }));

  const nextPreview = roundNumber < 6 ? DIRECTOR_EVENTS[roundNumber + 1]?.title : '盟主加冕战';

  await supabaseAdmin.from('game_state').upsert({
    id: 'current',
    game_id: gameId,
    status: overrideStatus || `round_${roundNumber}`,
    current_round: roundNumber,
    phase: 'resolution',
    heroes: snapshots,
    recent_events: events,
    reputation_ranking: repRanking,
    hot_ranking: hotRanking,
    next_round_preview: `下一回合：${nextPreview}`,
    updated_at: new Date().toISOString(),
  });
}
