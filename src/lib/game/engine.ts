import { supabaseAdmin } from '../supabase';
import { GameEvent, GameHeroSnapshot, Decision, ActionType, GameStatus } from '../types';
import { SecondMeClient, parseAiResponse } from './secondme-client';
import { getNpcDecision } from './npc-decisions';
import { calculateDamage, rollInitiative, rollCounterAttack, applyLuckBonus } from './combat';
import { roundPrompt, speechPrompt, deathPactPrompt, DIRECTOR_EVENTS, getDirectorEvent } from './prompts';
import { NPC_TEMPLATES, pickRandomTrait, GAME_TRAITS } from './npc-data/templates';
import * as C from './constants';
import { narratives } from './narratives';
import { rollEncounters, rollPersonalEncounters, rollCandidateEncounters, toEncounterChoice } from './encounters';
import { applyAudienceEffects } from './audience-influence';
import { evaluateInstantAchievementsInMemory } from './achievements';
import type { AudienceInfluence } from '../types';

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
// 决策预取缓存（回合展示期间后台预取，避免 processRound 时等 SecondMe API）
// ============================================================

const decisionCache = new Map<string, Map<string, Decision>>();
const prefetchInProgress = new Set<string>();

function cacheKey(gameId: string, roundNumber: number) {
  return `${gameId}_${roundNumber}`;
}

/**
 * 预取某回合的所有决策（SecondMe API + NPC），存入内存缓存。
 * 由客户端在回合展示开始时立即调用，这样 processRound 跑到时直接读缓存。
 */
export async function prefetchDecisions(gameId: string, roundNumber: number): Promise<boolean> {
  const key = cacheKey(gameId, roundNumber);

  // 已有缓存或正在预取
  if (decisionCache.has(key) || prefetchInProgress.has(key)) {
    return true;
  }
  prefetchInProgress.add(key);

  const t0 = Date.now();
  console.log(`[Prefetch] ▶ start game=${gameId.slice(0,8)} round=${roundNumber}`);

  try {
    const { data: gameHeroes } = await supabaseAdmin
      .from('game_heroes')
      .select('*, hero:heroes(*)')
      .eq('game_id', gameId)
      .order('seat_number');

    if (!gameHeroes || gameHeroes.length === 0) {
      console.warn('[Prefetch] no heroes found');
      return false;
    }

    const snapshots = gameHeroesToSnapshots(gameHeroes);
    const { decisions } = await collectDecisions(gameId, roundNumber, gameHeroes, snapshots);

    decisionCache.set(key, decisions);
    console.log(`[Prefetch] ✓ round=${roundNumber} done in ${Date.now()-t0}ms, ${decisions.size} decisions cached`);
    return true;
  } catch (err) {
    console.error('[Prefetch] error:', err);
    return false;
  } finally {
    prefetchInProgress.delete(key);
  }
}

// ============================================================
// 交互式选择阶段
// ============================================================

export async function startChoosing(gameId: string, roundNumber: number): Promise<{ success: boolean; error?: string }> {
  const expectedStatus = roundNumber === 1 ? 'intro' : `round_${roundNumber}`;
  const choosingStatus = `choosing_${roundNumber}`;

  // Optimistic lock
  const { data: lockResult, error: lockError } = await supabaseAdmin
    .from('games')
    .update({ status: choosingStatus })
    .eq('id', gameId)
    .eq('status', expectedStatus)
    .select('id')
    .single();

  if (lockError || !lockResult) {
    const { data: game } = await supabaseAdmin.from('games').select('status').eq('id', gameId).single();
    if (game?.status === choosingStatus) return { success: true };
    return { success: false, error: `Lock failed: expected ${expectedStatus}, got ${game?.status}` };
  }

  // Fetch alive heroes
  const { data: gameHeroes } = await supabaseAdmin
    .from('game_heroes')
    .select('*, hero:heroes(hero_name, faction, personality_type, is_npc)')
    .eq('game_id', gameId)
    .eq('is_eliminated', false);

  if (!gameHeroes || gameHeroes.length === 0) {
    return { success: false, error: 'No alive heroes' };
  }

  const usedEncounterIds = new Set<string>();
  const heroChoiceStatus: Record<string, 'pending' | 'chosen'> = {};
  const deadline = new Date(Date.now() + C.CHOOSING_DURATION * 1000).toISOString();

  // 1. 顺序计算奇遇候选（usedEncounterIds 需要去重）
  const heroUpdates: { ghId: string; heroId: string; pendingChoices: any[]; chosenEncounters: string[]; isNpc: boolean }[] = [];
  for (const gh of gameHeroes) {
    const heroInfo = {
      heroName: gh.hero.hero_name,
      heroId: gh.hero_id,
      faction: gh.hero.faction,
      personalityType: gh.hero.personality_type,
    };
    const candidates = rollCandidateEncounters(roundNumber, heroInfo, C.CANDIDATES_PER_HERO, usedEncounterIds);
    const candidateChoices = candidates.map(c => toEncounterChoice(c, heroInfo.heroName));
    const isNpc = !!gh.hero.is_npc;
    const chosenEncounters = isNpc ? pickNpcEncounters(candidateChoices, heroInfo.personalityType, C.CHOICES_PER_HERO) : [];
    heroChoiceStatus[gh.hero_id] = isNpc ? 'chosen' : 'pending';
    heroUpdates.push({ ghId: gh.id, heroId: gh.hero_id, pendingChoices: candidateChoices, chosenEncounters, isNpc });
  }

  // 2. 并行写入 DB
  await Promise.all(heroUpdates.map(u =>
    supabaseAdmin.from('game_heroes').update({
      pending_choices: u.pendingChoices,
      chosen_encounters: u.chosenEncounters,
    }).eq('id', u.ghId)
  ));

  // Update game_state cache
  await supabaseAdmin.from('game_state').update({
    status: choosingStatus,
    current_round: roundNumber,
    choosing_deadline: deadline,
    hero_choice_status: heroChoiceStatus,
    phase_started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', 'current');

  // Background prefetch SecondMe decisions
  prefetchDecisions(gameId, roundNumber).catch(() => {});

  return { success: true };
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

  const expectedStatus = `choosing_${roundNumber}`;
  const processingStatus = `resolving_${roundNumber}`;
  const { data: game, error } = await supabaseAdmin
    .from('games')
    .update({ status: processingStatus, current_round: roundNumber })
    .eq('id', gameId)
    .eq('status', expectedStatus)
    .select()
    .single();

  if (error || !game) {
    // 检查是否卡在 resolving（崩溃恢复）
    const { data: stuckGame } = await supabaseAdmin
      .from('games')
      .select('status, current_round')
      .eq('id', gameId)
      .single();

    if (stuckGame?.status === processingStatus) {
      // 检查是否卡了超过 30 秒（通过 game_state.phase_started_at 判断）
      const { data: gsPhase } = await supabaseAdmin
        .from('game_state').select('phase_started_at').eq('id', 'current').single();
      const lastUpdate = gsPhase?.phase_started_at ? new Date(gsPhase.phase_started_at).getTime() : 0;
      const stuckSeconds = (Date.now() - lastUpdate) / 1000;

      if (stuckSeconds > 30) {
        // 超时恢复：回滚到 expectedStatus 让下次请求重新处理
        console.warn(`[Engine] ⚠ round=${roundNumber} stuck in resolving for ${stuckSeconds.toFixed(0)}s, resetting`);
        await supabaseAdmin.from('games')
          .update({ status: expectedStatus })
          .eq('id', gameId)
          .eq('status', processingStatus);
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

  // AI fallback: fill in choices for heroes who didn't choose
  const { data: aliveHeroChoices } = await supabaseAdmin
    .from('game_heroes')
    .select('id, hero_id, pending_choices, chosen_encounters')
    .eq('game_id', gameId)
    .eq('is_eliminated', false);

  if (aliveHeroChoices) {
    await Promise.all(aliveHeroChoices.map(async (gh) => {
      const chosen = (gh.chosen_encounters || []) as string[];
      if (chosen.length < C.CHOICES_PER_HERO && Array.isArray(gh.pending_choices) && gh.pending_choices.length > 0) {
        const available = (gh.pending_choices as any[]).filter((c: any) => !chosen.includes(c.id));
        const autoFill = available.slice(0, C.CHOICES_PER_HERO - chosen.length).map((c: any) => c.id);
        await supabaseAdmin.from('game_heroes').update({
          chosen_encounters: [...chosen, ...autoFill],
        }).eq('id', gh.id);
      }
    }));
  }

  // 1. 收集所有决策（优先从预取缓存读取）
  const key = cacheKey(gameId, roundNumber);
  let decisions: Map<string, Decision>;
  let lastAttackerMap: Map<string, string> | undefined;
  const cached = decisionCache.get(key);
  if (cached) {
    decisions = cached;
    decisionCache.delete(key);
    console.log(`[Engine] ⚡ round=${roundNumber} using prefetched decisions (${decisions.size} cached)`);
  } else {
    console.log(`[Engine] 🐢 round=${roundNumber} no prefetch cache, collecting decisions now...`);
    const collected = await collectDecisions(gameId, roundNumber, gameHeroes, snapshots);
    decisions = collected.decisions;
    lastAttackerMap = collected.lastAttackerMap;
  }

  // 2. 结算（复用 collectDecisions 的 lastAttackerMap，避免重复 DB 查询）
  const events = await resolveRound(gameId, roundNumber, decisions, gameHeroes, snapshots, lastAttackerMap);

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

  // Clear choice data for this round
  await supabaseAdmin.from('game_heroes').update({
    pending_choices: [],
    chosen_encounters: [],
  }).eq('game_id', gameId);

  // Clear choosing phase data from game_state
  await supabaseAdmin.from('game_state').update({
    choosing_deadline: null,
    hero_choice_status: {},
  }).eq('id', 'current');

  // 3.5 Re-fetch game_heroes ONCE after resolveRound (for achievements + cache)
  const { data: freshGameHeroes } = await supabaseAdmin
    .from('game_heroes')
    .select('*, hero:heroes(*)')
    .eq('game_id', gameId)
    .order('seat_number');
  const finalSnapshots = gameHeroesToSnapshots(freshGameHeroes || gameHeroes);

  // 即时成就评估（不写 DB，仅用于前端 toast 展示）
  let roundAchievements: any[] = [];
  let updatedAwarded: string[] = [];
  try {
    // 获取本局全部事件（仅拉取成就评估所需列）
    const { data: allGameEvents } = await supabaseAdmin
      .from('game_events')
      .select('hero_id, target_hero_id, event_type, round, sequence, data')
      .eq('game_id', gameId)
      .order('round', { ascending: true })
      .order('sequence', { ascending: true });

    // 读取已发放的成就列表
    const { data: gsAchievements } = await supabaseAdmin
      .from('game_state')
      .select('awarded_achievements')
      .eq('id', 'current')
      .single();
    const prevAwarded: string[] = gsAchievements?.awarded_achievements || [];

    roundAchievements = evaluateInstantAchievementsInMemory(
      freshGameHeroes || gameHeroes,
      allGameEvents || [],
      prevAwarded,
    );
    updatedAwarded = [
      ...prevAwarded,
      ...roundAchievements.map((a: any) => `${a.heroId}:${a.achievementId}`),
    ];
  } catch (err) {
    console.error('[Engine] Achievement evaluation error:', err);
  }

  // 4. 设置下一个状态
  // R5 结束后直接进 semifinals（R6 由 finals API 处理，不走 processRound）
  const nextStatus = roundNumber < 5 ? `round_${roundNumber + 1}` : 'semifinals';
  await supabaseAdmin
    .from('games')
    .update({ status: nextStatus, current_round: roundNumber })
    .eq('id', gameId);

  // 5. 更新 game_state 缓存（使用 nextStatus 保持一致，复用已查询的 finalSnapshots）
  await updateGameStateCache(gameId, roundNumber, events, finalSnapshots, nextStatus, roundAchievements, updatedAwarded);

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
): Promise<{ decisions: Map<string, Decision>; lastAttackerMap: Map<string, string> }> {
  const decisions = new Map<string, Decision>();
  const directorEvent = getDirectorEvent(roundNumber, gameId);
  const aliveHeroes = gameHeroes.filter((gh: any) => !gh.is_eliminated);

  // 读取上回合战斗事件，构建 "谁攻击了谁" 映射（用于复仇心切等特质）
  const lastAttackerMap = new Map<string, string>(); // targetHeroId → attackerHeroId
  if (roundNumber > 1) {
    const { data: prevFights } = await supabaseAdmin
      .from('game_events')
      .select('hero_id, target_hero_id')
      .eq('game_id', gameId)
      .eq('round', roundNumber - 1)
      .in('event_type', ['fight', 'gang_up']);
    if (prevFights) {
      for (const evt of prevFights) {
        if (evt.target_hero_id) {
          lastAttackerMap.set(evt.target_hero_id, evt.hero_id);
        }
      }
    }
  }

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
          lastAttackedBy: lastAttackerMap.get(gh.hero_id) || null,
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

  // 全局 15s 超时保护：防止 SecondMe API 挂起导致整轮阻塞
  await Promise.race([
    Promise.allSettled(promises),
    new Promise(resolve => setTimeout(resolve, 15000)),
  ]);

  // 超时后未返回决策的英雄使用 fallback
  for (const gh of aliveHeroes) {
    if (!decisions.has(gh.hero_id)) {
      console.warn(`[Engine] Hero ${gh.hero?.hero_name || gh.hero_id} decision timed out, using fallback`);
      decisions.set(gh.hero_id, { action: 'train', target: null, taunt: '……', reason: '通讯中断。' });
    }
  }

  return { decisions, lastAttackerMap };
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
  prebuiltLastAttackerMap?: Map<string, string>,
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

  // 查询上轮训练者，用于连续训练声望递减
  const prevTrainers = new Set<string>();
  if (roundNumber > 1) {
    const { data: prevTrainEvents } = await supabaseAdmin
      .from('game_events')
      .select('hero_id')
      .eq('game_id', gameId)
      .eq('round', roundNumber - 1)
      .eq('event_type', 'train');
    if (prevTrainEvents) {
      for (const e of prevTrainEvents) prevTrainers.add(e.hero_id);
    }
  }

  // --- 导演事件（根据 gameId 确定性选取变体） ---
  const dirEvent = getDirectorEvent(roundNumber, gameId);
  events.push({
    eventType: 'director_event',
    priority: 8,
    narrative: `【第${roundNumber}回合 · ${dirEvent.title}】${dirEvent.flavor || dirEvent.description}`,
    data: { roundNumber, title: dirEvent.title },
  } as any);

  // --- 消费观众定向增益/减益 ---
  {
    const { data: gsInfluence } = await supabaseAdmin
      .from('game_state')
      .select('pending_influences')
      .eq('id', 'current')
      .single();

    const pendingInfluences = (gsInfluence?.pending_influences || []) as any[];
    for (const inf of pendingInfluences) {
      const target = snapshots.find(s => s.heroId === inf.targetHeroId && !s.isEliminated);
      if (!target) continue;

      const isHp = Math.random() < 0.5;
      const amount = inf.effectType === 'buff' ? C.INFLUENCE_BUFF_AMOUNT : -C.INFLUENCE_DEBUFF_AMOUNT;

      events.push({
        gameId, round: roundNumber,
        heroId: inf.targetHeroId,
        eventType: 'audience_influence',
        narrative: inf.effectType === 'buff'
          ? `观众助力！${target.heroName} ${isHp ? '气血' : '声望'}+${C.INFLUENCE_BUFF_AMOUNT}`
          : `观众干扰！${target.heroName} ${isHp ? '气血' : '声望'}-${C.INFLUENCE_DEBUFF_AMOUNT}`,
        hpDelta: isHp ? amount : 0,
        reputationDelta: isHp ? 0 : amount,
        data: { influenceType: inf.effectType, sourceHeroId: inf.sourceHeroId },
      } as any);

      if (isHp) addDelta(updates, inf.targetHeroId, 'hp', amount);
      else addDelta(updates, inf.targetHeroId, 'reputation', amount);
    }

    if (pendingInfluences.length > 0) {
      await supabaseAdmin.from('game_state').update({ pending_influences: [] }).eq('id', 'current');
    }
  }

  // --- 弹幕天意 ---
  {
    const { data: gsInfluence } = await supabaseAdmin
      .from('game_state').select('audience_influence').eq('id', 'current').single();

    const influence = gsInfluence?.audience_influence as AudienceInfluence | null;
    const { events: influenceEvents, consumed } = applyAudienceEffects(
      influence, snapshots, updates, gameHeroes
    );
    events.push(...influenceEvents);

    // 重置已消费的计数器
    if (consumed.length > 0 && influence) {
      const updated = { ...influence, counters: { ...influence.counters }, heroTargets: { ...influence.heroTargets } };
      for (const key of consumed) {
        if (key.includes(':')) {
          const [cat, hero] = key.split(':');
          if (updated.heroTargets?.[cat]?.[hero] !== undefined) {
            updated.heroTargets[cat] = { ...updated.heroTargets[cat] };
            updated.heroTargets[cat][hero] = 0;
          }
        } else {
          updated.counters[key] = 0;
        }
      }
      updated.lastResetRound = roundNumber;
      updated.activeEffects = consumed;
      await supabaseAdmin.from('game_state')
        .update({ audience_influence: updated }).eq('id', 'current');

      // 弹幕天意 · 反间计：实际解除联盟
      if (consumed.includes('betrayal')) {
        const betrayalEvt = influenceEvents.find(
          (e: any) => e.data?.audienceEffect === 'betrayal' && e.data?.h1Id && e.data?.h2Id
        );
        if (betrayalEvt) {
          const { h1Id, h2Id } = (betrayalEvt as any).data;
          await Promise.all([
            supabaseAdmin.from('game_heroes').update({ ally_hero_id: null }).eq('game_id', gameId).eq('hero_id', h1Id),
            supabaseAdmin.from('game_heroes').update({ ally_hero_id: null }).eq('game_id', gameId).eq('hero_id', h2Id),
          ]);
          // 同步内存 snapshot
          for (const s of snapshots) {
            if (s.heroId === h1Id || s.heroId === h2Id) {
              (s as any).allyHeroId = null;
            }
          }
        }
      }
    }
  }

  // --- 分类决策 ---
  const fighters: { heroId: string; target: string; decision: Decision }[] = [];
  const trainers: string[] = [];
  const explorers: string[] = [];
  const allyers: { heroId: string; target: string }[] = [];
  const betrayers: { heroId: string; target: string }[] = [];
  const resters: string[] = [];
  const deathPactHeroes: string[] = [];

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

    // R5 生死状（收集，后面批量写入）
    if (roundNumber === 5 && decision.signDeathPact) {
      deathPactHeroes.push(heroId);
      addDelta(updates, heroId, 'reputation', C.REP.SIGN_DEATH_PACT);
      addDelta(updates, heroId, 'hot', C.HOT.SIGN_DEATH_PACT);
    }
  }

  // --- R5 生死状批量写入 ---
  if (deathPactHeroes.length > 0) {
    await Promise.all(deathPactHeroes.map(heroId =>
      supabaseAdmin.from('game_heroes')
        .update({ has_death_pact: true, has_ultimate: true })
        .eq('game_id', gameId)
        .eq('hero_id', heroId)
        .then()
    ));
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
      narrative: `🙏 ${winner.name}拜师宣言：「${winner.taunt}」—— 方丈大悦，收为关门弟子！获得【方丈真传】（攻+4，防+2）！`,
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

      await Promise.all([
        supabaseAdmin.from('game_heroes').update({ ally_hero_id: target }).eq('game_id', gameId).eq('hero_id', heroId),
        supabaseAdmin.from('game_heroes').update({ ally_hero_id: heroId }).eq('game_id', gameId).eq('hero_id', target),
      ]);

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

    await Promise.all([
      supabaseAdmin.from('game_heroes').update({ ally_hero_id: null }).eq('game_id', gameId).eq('hero_id', heroId),
      supabaseAdmin.from('game_heroes').update({ ally_hero_id: null }).eq('game_id', gameId).eq('hero_id', target),
    ]);

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

  // --- 构建上轮攻击映射（复仇 buff 用，复用 collectDecisions 的结果避免重复查询）---
  let lastAttackerMap: Map<string, string>;
  if (prebuiltLastAttackerMap) {
    lastAttackerMap = prebuiltLastAttackerMap;
  } else {
    lastAttackerMap = new Map<string, string>();
    if (roundNumber > 1) {
      const { data: prevFights } = await supabaseAdmin
        .from('game_events')
        .select('hero_id, target_hero_id')
        .eq('game_id', gameId)
        .eq('round', roundNumber - 1)
        .in('event_type', ['fight', 'gang_up']);
      if (prevFights) {
        for (const evt of prevFights) {
          if (evt.target_hero_id) lastAttackerMap.set(evt.target_hero_id, evt.hero_id);
        }
      }
    }
  }

  // --- 提取通缉犯 ID（R4 导演事件）---
  const wantedHeroId = roundNumber === 4
    ? events.find(e => (e as any).data?.wantedHeroId)?.data?.wantedHeroId as string | undefined
    : undefined;

  // --- 处理战斗 ---
  const fightEvents = resolveFights(fighters, snapshots, gameHeroes, updates, gameId, roundNumber, lastAttackerMap, wantedHeroId);
  events.push(...fightEvents);

  // --- 处理修炼（连续训练声望递减） ---
  for (const heroId of trainers) {
    const name = getSnapshot(heroId).heroName;
    const isConsecutive = prevTrainers.has(heroId);
    const repGain = isConsecutive ? 0 : C.REP.TRAIN;
    const suffix = isConsecutive ? '（连续闭关，声望未涨）' : '';
    events.push({
      eventType: 'train',
      priority: 1,
      heroId,
      narrative: narratives.train(name) + suffix,
      reputationDelta: repGain,
      hpDelta: C.TRAIN_HP_RECOVERY,
    } as any);
    addDelta(updates, heroId, 'reputation', repGain);
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

  // --- 个人支线奇遇（玩家选择版） ---
  {
    const { data: heroChoicesData } = await supabaseAdmin
      .from('game_heroes')
      .select('hero_id, chosen_encounters, pending_choices')
      .eq('game_id', gameId)
      .eq('is_eliminated', false);

    if (heroChoicesData) {
      for (const hc of heroChoicesData) {
        const chosenIds: string[] = (hc.chosen_encounters || []) as string[];
        const pendingChoices: any[] = (hc.pending_choices || []) as any[];
        const heroSnap = snapshots.find(s => s.heroId === hc.hero_id);
        if (!heroSnap) continue;

        for (const chosenId of chosenIds) {
          const choice = pendingChoices.find((c: any) => c.id === chosenId);
          if (!choice) continue;
          const effects = choice.effects || {};
          events.push({
            gameId, round: roundNumber,
            heroId: hc.hero_id,
            eventType: 'encounter',
            narrative: choice.name,
            hpDelta: effects.hp || 0,
            reputationDelta: effects.reputation || 0,
            hotDelta: effects.hot || 0,
            data: { encounterId: chosenId, category: choice.category, martialArt: choice.martialArt },
          } as any);

          // Apply stat deltas
          if (effects.hp) addDelta(updates, hc.hero_id, 'hp', effects.hp);
          if (effects.reputation) addDelta(updates, hc.hero_id, 'reputation', effects.reputation);
          if (effects.hot) addDelta(updates, hc.hero_id, 'hot', effects.hot);
          if (effects.morality) addDelta(updates, hc.hero_id, 'morality', effects.morality);
          if (effects.credit) addDelta(updates, hc.hero_id, 'credit', effects.credit);

          // Apply martial art bonuses
          if (choice.martialArt) {
            addMartialArt(updates, hc.hero_id, choice.martialArt);
            events.push({
              eventType: 'encounter',
              priority: 5,
              heroId: hc.hero_id,
              narrative: `${heroSnap.heroName}习得新武学【${choice.martialArt.name}】！（攻击+${choice.martialArt.attackBonus}，防御+${choice.martialArt.defenseBonus}）`,
              data: { martialArt: choice.martialArt },
            } as any);
          }
        }
      }
    }
  }

  // --- R2 方丈收徒：获胜者获得武学加成（仅限本局 game_heroes） ---
  if (roundNumber === 2) {
    const masterEvent = events.find(e => (e as any).data?.isMaster === true);
    if (masterEvent && masterEvent.heroId) {
      addMartialArt(updates, masterEvent.heroId, { name: '方丈真传', attackBonus: 4, defenseBonus: 2 });
    }
  }

  // --- 应用所有更新到数据库（并行写入） ---
  const heroUpdatePromises: PromiseLike<any>[] = [];
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

    heroUpdatePromises.push(
      supabaseAdmin
        .from('game_heroes')
        .update(updateObj)
        .eq('game_id', gameId)
        .eq('hero_id', heroId)
        .then()
    );
  }
  await Promise.all(heroUpdatePromises);

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
      data: { won: true, rank: 1, martialArt },
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
  lastAttackerMap: Map<string, string> = new Map(),
  wantedHeroId?: string,
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

      // 复仇 buff：上轮被目标攻击过 → 本轮攻击力 ×1.5
      const isRevenge = lastAttackerMap.get(attackerId) === targetId;
      // 通缉犯 buff：R4 通缉目标防御力 ×1.5
      const isWanted = targetId === wantedHeroId;

      const damage = calculateDamage({
        attackerAttrs: attSnap, defenderAttrs: targetSnap,
        attackerMartialArts: attSnap.martialArts, defenderMartialArts: targetSnap.martialArts,
        isDeathPact: gh?.has_death_pact,
        isRevenge,
        isWanted,
      });

      // 虚竹运气加成
      const isXuzhu = snapshots.find(s => s.heroId === attackerId)?.heroName === '虚竹';
      const finalDamage = applyLuckBonus(damage, isXuzhu);

      // 通缉赏金：击败通缉犯额外 +50 声望
      const wantedBonus = isWanted ? 50 : 0;
      const fightNarrative = isRevenge
        ? `🔥 ${attSnap.heroName}怒吼「上回合的仇今日奉还！」复仇一击对${targetSnap.heroName}造成 ${finalDamage} 伤害！`
        : narratives.fight(attSnap.heroName, targetSnap.heroName, finalDamage);

      events.push({
        eventType: 'fight',
        priority: isRevenge || isWanted ? 6 : 5,
        heroId: attackerId,
        targetHeroId: targetId,
        narrative: fightNarrative,
        hpDelta: -finalDamage,
        reputationDelta: C.REP.PK_WIN + wantedBonus,
        data: { damage: finalDamage, isRevenge, isWanted },
        taunt: fighters.find(f => f.heroId === attackerId)?.decision.taunt,
      } as any);

      addDelta(updates, targetId, 'hp', -finalDamage);
      addDelta(updates, attackerId, 'reputation', C.REP.PK_WIN + wantedBonus);
      addDelta(updates, targetId, 'reputation', C.REP.PK_LOSE);

      if (wantedBonus > 0) {
        events.push({
          eventType: 'hot_news',
          priority: 7,
          heroId: attackerId,
          narrative: `📜 ${attSnap.heroName}击败通缉犯${targetSnap.heroName}，赏金 +${wantedBonus} 声望！`,
          reputationDelta: wantedBonus,
        } as any);
      }
    }
  }

  return events;
}

// ============================================================
// 辅助函数
// ============================================================

// NPC 根据性格偏好加权选择奇遇（而非无脑取前 N 个）
function pickNpcEncounters(choices: { id: string; personalityAffinity?: string[]; effects: Record<string, number | undefined> }[], personalityType: string, count: number): string[] {
  if (choices.length <= count) return choices.map(c => c.id);
  // 计算每个候选的权重：性格匹配 ×3，正面效果 +1，武功奖励 +2
  const weighted = choices.map(c => {
    let w = 1;
    if (c.personalityAffinity?.includes(personalityType)) w += 3;
    const totalEffects = Object.values(c.effects).reduce((sum: number, v) => sum + (v || 0), 0);
    if (totalEffects > 0) w += 1;
    return { id: c.id, weight: w };
  });
  // 按权重降序排列，取前 count 个
  weighted.sort((a, b) => b.weight - a.weight);
  return weighted.slice(0, count).map(w => w.id);
}

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
    bio: gh.hero?.backstory || '',
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
  roundAchievements?: any[],
  awardedAchievements?: string[],
) {
  const repRanking = [...snapshots]
    .filter(h => !h.isEliminated)
    .sort((a, b) => b.reputation - a.reputation)
    .map((h, i) => ({ heroId: h.heroId, heroName: h.heroName, faction: h.faction, value: h.reputation, rank: i + 1 }));

  const hotRanking = [...snapshots]
    .filter(h => !h.isEliminated)
    .sort((a, b) => b.hot - a.hot)
    .map((h, i) => ({ heroId: h.heroId, heroName: h.heroName, faction: h.faction, value: h.hot, rank: i + 1 }));

  const nextPreview = roundNumber < 6 ? getDirectorEvent(roundNumber + 1, gameId).title : '盟主加冕战';

  const upsertData: Record<string, any> = {
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
    phase_started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // 成就实时弹窗数据（列可能尚未通过迁移添加）
  if (roundAchievements !== undefined) {
    upsertData.round_achievements = roundAchievements;
  }
  if (awardedAchievements !== undefined) {
    upsertData.awarded_achievements = awardedAchievements;
  }

  const { error: upsertError } = await supabaseAdmin.from('game_state').upsert(upsertData);
  if (upsertError) {
    console.warn('[Engine] game_state upsert failed, retrying without achievement cols:', upsertError.message);
    delete upsertData.round_achievements;
    delete upsertData.awarded_achievements;
    const { error: retryError } = await supabaseAdmin.from('game_state').upsert(upsertData);
    if (retryError) {
      console.error('[Engine] game_state upsert retry also failed:', retryError.message);
    }
  }
}
