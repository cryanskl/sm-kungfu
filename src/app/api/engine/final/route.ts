import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveFinalsRound } from '@/lib/game/combat';
import { NPC_TEMPLATES } from '@/lib/game/npc-data/templates';
import { FINALS_ROUNDS, INITIAL_HP } from '@/lib/game/constants';
import { FinalsMove, GameEvent, ArtifactEffect } from '@/lib/types';
import { getFinalsMove } from '@/lib/game/finals-engine';
import { mapGameStateRow } from '@/lib/game/state-mapper';
import {
  getMoveName, getInnerThought, getReadyNarrative,
  getClashNarrative, getWinTaunt, getLoseReaction,
} from '@/lib/game/finals-narrative';
import { requireEngineSecret } from '@/lib/auth';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const authErr = requireEngineSecret(request);
    if (authErr) return authErr;
    const { gameId } = await request.json();
    if (!gameId) return NextResponse.json({ error: 'Missing gameId' }, { status: 400 });

    // 幂等锁：从 artifact_selection 转为 processing_final
    const { data: game, error } = await supabaseAdmin
      .from('games')
      .update({ status: 'processing_final' })
      .eq('id', gameId)
      .eq('status', 'artifact_selection')
      .select()
      .single();

    if (error || !game) {
      // 可能已经处理过了，返回已有事件
      const { data: cached } = await supabaseAdmin
        .from('game_events')
        .select('*')
        .eq('game_id', gameId)
        .eq('round', 7)
        .order('sequence', { ascending: true });
      // 过滤只取决赛事件（phase='final' 或 championHeroId 存在）
      const finalEvents = (cached || []).filter((e: any) =>
        e.data?.phase === 'final' || e.data?.championHeroId
      );
      return NextResponse.json({ events: finalEvents });
    }

    // 获取决赛选手（从 artifact_pool 中读取）
    const { data: gs } = await supabaseAdmin
      .from('game_state')
      .select('artifact_pool')
      .eq('id', 'current')
      .single();

    const artifactPool = gs?.artifact_pool;
    const finalistIds = (artifactPool?.finalists || []).map((f: any) => f.heroId);

    if (finalistIds.length < 2) {
      await supabaseAdmin.from('games').update({ status: 'ending' }).eq('id', gameId);
      return NextResponse.json({ events: [] });
    }

    // 获取决赛英雄
    const { data: gameHeroes } = await supabaseAdmin
      .from('game_heroes')
      .select('*, hero:heroes(*)')
      .eq('game_id', gameId)
      .in('hero_id', finalistIds);

    if (!gameHeroes || gameHeroes.length < 2) {
      await supabaseAdmin.from('games').update({ status: 'ending' }).eq('id', gameId);
      return NextResponse.json({ events: [] });
    }

    const f1gh = gameHeroes.find((gh: any) => gh.hero_id === finalistIds[0])!;
    const f2gh = gameHeroes.find((gh: any) => gh.hero_id === finalistIds[1])!;
    const f1 = f1gh.hero;
    const f2 = f2gh.hero;

    // === 查询神器赠礼，按 hero_id 分组合并效果 ===
    const { data: gifts } = await supabaseAdmin
      .from('artifact_gifts')
      .select('*')
      .eq('game_id', gameId);

    const ARTIFACTS_MAP = new Map<string, any>(
      (artifactPool?.availableArtifacts || []).map((a: any) => [a.id, a])
    );

    const mergeArtifactEffects = (heroId: string): ArtifactEffect => {
      const merged: ArtifactEffect = {};
      for (const g of (gifts || [])) {
        if (g.hero_id !== heroId) continue;
        const def = ARTIFACTS_MAP.get(g.artifact_id);
        if (!def) continue;
        const eff = def.effect as ArtifactEffect;
        if (eff.attackBoost) merged.attackBoost = (merged.attackBoost || 0) + eff.attackBoost;
        if (eff.defenseBoost) merged.defenseBoost = (merged.defenseBoost || 0) + eff.defenseBoost;
        if (eff.hpBonus) merged.hpBonus = (merged.hpBonus || 0) + eff.hpBonus;
        if (eff.ultimateBoost) merged.ultimateBoost = (merged.ultimateBoost || 0) + eff.ultimateBoost;
        if (eff.bluffBoost) merged.bluffBoost = (merged.bluffBoost || 0) + eff.bluffBoost;
        if (eff.damageReduction) merged.damageReduction = (merged.damageReduction || 0) + eff.damageReduction;
      }
      return merged;
    }

    const hero1Artifacts = mergeArtifactEffects(f1gh.hero_id);
    const hero2Artifacts = mergeArtifactEffects(f2gh.hero_id);

    // 应用 hpBonus
    let f1Hp = f1gh.hp + (hero1Artifacts.hpBonus || 0);
    let f2Hp = f2gh.hp + (hero2Artifacts.hpBonus || 0);

    const events: Partial<GameEvent>[] = [];

    // 神器加成播报
    const artifactNarrative = [];
    if (hero1Artifacts.hpBonus || hero1Artifacts.attackBoost || hero1Artifacts.defenseBoost) {
      artifactNarrative.push(`${f1.hero_name}获得观众神兵加持！`);
    }
    if (hero2Artifacts.hpBonus || hero2Artifacts.attackBoost || hero2Artifacts.defenseBoost) {
      artifactNarrative.push(`${f2.hero_name}获得观众神兵加持！`);
    }

    const openingTemplates = [
      `🏆 风云际会，巅峰对决！${f1.hero_name}（HP:${f1Hp}）对阵 ${f2.hero_name}（HP:${f2Hp}）！${artifactNarrative.length > 0 ? artifactNarrative.join('') : ''}武林盟主之位，今日花落谁家？天下瞩目！`,
      `🏆 鼓声雷动，万众屏息！${f1.hero_name}（HP:${f1Hp}）vs ${f2.hero_name}（HP:${f2Hp}）！${artifactNarrative.length > 0 ? artifactNarrative.join('') : ''}两大高手巅峰对决，武林盟主之争，一触即发！`,
      `🏆 龙虎相争，一决雌雄！${f1.hero_name}（HP:${f1Hp}）迎战 ${f2.hero_name}（HP:${f2Hp}）！${artifactNarrative.length > 0 ? artifactNarrative.join('') : ''}谁能笑到最后，傲立武林之巅？`,
    ];
    events.push({
      eventType: 'director_event',
      priority: 8,
      narrative: openingTemplates[Math.floor(Math.random() * openingTemplates.length)],
      data: { phase: 'final', hero1Artifacts, hero2Artifacts },
    } as any);

    // === 3回合RPS战斗 ===
    for (let r = 1; r <= FINALS_ROUNDS; r++) {
      const [res1, res2] = await Promise.all([
        getFinalsMove(f1gh, f2.hero_name),
        getFinalsMove(f2gh, f1.hero_name),
      ]);

      const move1 = res1.move;
      const move2 = res2.move;
      const moveName1 = getMoveName(f1.npc_template_id, f1.faction, move1);
      const moveName2 = getMoveName(f2.npc_template_id, f2.faction, move2);

      const result = resolveFinalsRound({
        move1, move2,
        hero1Attrs: { strength: f1.strength, wisdom: f1.wisdom, innerForce: f1.inner_force },
        hero2Attrs: { strength: f2.strength, wisdom: f2.wisdom, innerForce: f2.inner_force },
        hero1Credit: f1gh.credit || 50,
        hero2Credit: f2gh.credit || 50,
        hero1Morality: f1gh.morality ?? 50,
        hero2Morality: f2gh.morality ?? 50,
        hero1Artifacts,
        hero2Artifacts,
      });

      f1Hp = Math.max(0, f1Hp + result.hero1HpDelta);
      f2Hp = Math.max(0, f2Hp + result.hero2HpDelta);

      // Event: Fighter 1 readies
      events.push({
        eventType: 'fight',
        priority: 6,
        heroId: f1gh.hero_id,
        narrative: `🏆 ${getReadyNarrative(f1.hero_name, moveName1, move1)}`,
        innerThought: getInnerThought(f1.npc_template_id, f1.personality_type),
        taunt: res1.taunt,
        data: { phase: 'final', round: r, move: move1 },
      } as any);

      // Event: Fighter 2 readies
      events.push({
        eventType: 'fight',
        priority: 6,
        heroId: f2gh.hero_id,
        narrative: `🏆 ${getReadyNarrative(f2.hero_name, moveName2, move2)}`,
        innerThought: getInnerThought(f2.npc_template_id, f2.personality_type),
        taunt: res2.taunt,
        data: { phase: 'final', round: r, move: move2 },
      } as any);

      // Event: Clash result
      const clashText = `🏆 决赛第${r}招！` + getClashNarrative(
        f1.hero_name, f2.hero_name,
        moveName1, moveName2, move1, move2, result.result,
      );

      if (result.hero1HpDelta < 0 && result.hero2HpDelta < 0) {
        events.push({
          eventType: 'fight', priority: 8,
          heroId: f1gh.hero_id,
          targetHeroId: f2gh.hero_id,
          narrative: clashText,
          hpDelta: result.hero2HpDelta,
          data: { round: r, move1, move2, result: result.result, f1Hp, f2Hp },
        } as any);
        events.push({
          eventType: 'fight', priority: 6,
          heroId: f2gh.hero_id,
          targetHeroId: f1gh.hero_id,
          narrative: `${f1.hero_name}也被反震之力波及！`,
          hpDelta: result.hero1HpDelta,
          data: { round: r, aftershock: true },
        } as any);
      } else if (result.hero2HpDelta < 0) {
        events.push({
          eventType: 'fight', priority: 8,
          heroId: f1gh.hero_id,
          targetHeroId: f2gh.hero_id,
          narrative: clashText,
          taunt: getWinTaunt(f1.npc_template_id),
          hpDelta: result.hero2HpDelta,
          data: { round: r, move1, move2, result: result.result, f1Hp, f2Hp },
        } as any);
      } else if (result.hero1HpDelta < 0) {
        events.push({
          eventType: 'fight', priority: 8,
          heroId: f2gh.hero_id,
          targetHeroId: f1gh.hero_id,
          narrative: clashText,
          taunt: getWinTaunt(f2.npc_template_id),
          hpDelta: result.hero1HpDelta,
          data: { round: r, move1, move2, result: result.result, f1Hp, f2Hp },
        } as any);
      } else {
        events.push({
          eventType: 'fight', priority: 7,
          heroId: f1gh.hero_id,
          targetHeroId: f2gh.hero_id,
          narrative: clashText,
          data: { round: r, move1, move2, result: result.result, f1Hp, f2Hp },
        } as any);
      }

      if (f1Hp <= 0 || f2Hp <= 0) break;
    }

    // === 判定盟主 ===
    let champion, runnerUp;
    if (f1Hp > f2Hp) {
      champion = f1gh; runnerUp = f2gh;
    } else if (f2Hp > f1Hp) {
      champion = f2gh; runnerUp = f1gh;
    } else {
      champion = (f1gh.reputation || 0) >= (f2gh.reputation || 0) ? f1gh : f2gh;
      runnerUp = champion === f1gh ? f2gh : f1gh;
    }

    const championTemplates = [
      `🏆🏆🏆 ${champion.hero.hero_name} 击败 ${runnerUp.hero.hero_name}，荣登武林盟主！天下第一！`,
      `🏆🏆🏆 尘埃落定！${champion.hero.hero_name} 力克 ${runnerUp.hero.hero_name}，傲立群雄之巅！新一代武林盟主诞生！`,
      `🏆🏆🏆 ${champion.hero.hero_name} 一战封神！${runnerUp.hero.hero_name} 虽败犹荣，但今日的武林，只有一个王者！`,
    ];
    events.push({
      eventType: 'champion',
      priority: 8,
      heroId: champion.hero_id,
      narrative: championTemplates[Math.floor(Math.random() * championTemplates.length)],
      taunt: getWinTaunt(champion.hero.npc_template_id),
      innerThought: getLoseReaction(runnerUp.hero.npc_template_id),
      data: { championHeroId: champion.hero_id, runnerUpHeroId: runnerUp.hero_id },
    } as any);

    await supabaseAdmin.from('games').update({
      status: 'ending',
      champion_hero_id: champion.hero_id,
    }).eq('id', gameId);

    // 写入事件（round 7，sequence 从已有半决赛事件之后开始）
    const { count: existingCount } = await supabaseAdmin
      .from('game_events')
      .select('*', { count: 'exact', head: true })
      .eq('game_id', gameId)
      .eq('round', 7);

    const seqOffset = existingCount || 0;

    if (events.length > 0) {
      await supabaseAdmin.from('game_events').insert(
        events.map((e, i) => ({
          game_id: gameId,
          round: 7,
          sequence: seqOffset + i,
          event_type: e.eventType,
          priority: e.priority || 1,
          hero_id: e.heroId || null,
          target_hero_id: e.targetHeroId || null,
          narrative: e.narrative || '',
          taunt: e.taunt || null,
          inner_thought: e.innerThought || null,
          data: e.data || {},
          hp_delta: e.hpDelta || 0,
        }))
      );
    }

    const { error: gsError } = await supabaseAdmin.from('game_state').upsert({
      id: 'current',
      game_id: gameId,
      status: 'ending',
      phase: 'ending',
      champion_name: champion.hero.hero_name,
      recent_events: events,
      artifact_pool: { ...(artifactPool || {}), isOpen: false },
      phase_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (gsError) {
      console.error('[Final] game_state upsert failed:', gsError.message);
    }

    const { data: freshState } = await supabaseAdmin
      .from('game_state').select('*').eq('id', 'current').single();

    return NextResponse.json({
      events,
      gameState: freshState ? mapGameStateRow(freshState) : undefined,
    });
  } catch (err: any) {
    console.error('Final error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// getFinalsMove 已提取到 @/lib/game/finals-engine.ts
