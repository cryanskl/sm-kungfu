import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveFinalsRound } from '@/lib/game/combat';
import { NPC_TEMPLATES } from '@/lib/game/npc-data/templates';
import { FINALS_TOP_REPUTATION, FINALS_TOP_HOT, FINALS_ROUNDS, INITIAL_HP, ARTIFACTS, ARTIFACT_POOL_SIZE } from '@/lib/game/constants';
import { FinalsMove, GameEvent, ArtifactDef } from '@/lib/types';
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

    // 幂等锁
    const { data: game, error } = await supabaseAdmin
      .from('games')
      .update({ status: 'processing_finals' })
      .eq('id', gameId)
      .eq('status', 'semifinals')
      .select()
      .single();

    if (error || !game) {
      // 崩溃恢复：processing_finals 卡住超过 60s → 回退到 semifinals 允许重试
      const { data: stuckGame } = await supabaseAdmin
        .from('games').select('status, updated_at').eq('id', gameId).single();
      if (stuckGame?.status === 'processing_finals') {
        const updatedAt = stuckGame.updated_at ? new Date(stuckGame.updated_at).getTime() : 0;
        const stuckSeconds = (Date.now() - updatedAt) / 1000;
        if (stuckSeconds > 60) {
          console.warn(`[Engine] ⚠ processing_finals stuck for ${stuckSeconds.toFixed(0)}s, resetting to semifinals`);
          await supabaseAdmin.from('games')
            .update({ status: 'semifinals' })
            .eq('id', gameId)
            .eq('status', 'processing_finals');
          return NextResponse.json({ recovered: true, events: [] });
        }
      }

      const { data: cached } = await supabaseAdmin
        .from('game_events')
        .select('*')
        .eq('game_id', gameId)
        .eq('round', 7)
        .order('sequence', { ascending: true });
      return NextResponse.json({ events: cached || [] });
    }

    // 获取所有英雄
    const { data: gameHeroes } = await supabaseAdmin
      .from('game_heroes')
      .select('*, hero:heroes(*)')
      .eq('game_id', gameId)
      .order('seat_number');

    if (!gameHeroes) throw new Error('No heroes');

    const alive = gameHeroes.filter((gh: any) => !gh.is_eliminated);

    // === 选出四强 ===
    const repSorted = [...alive].sort((a: any, b: any) => (b.reputation || 0) - (a.reputation || 0));
    const hotSorted = [...alive].sort((a: any, b: any) => (b.hot || 0) - (a.hot || 0));

    const finalistsSet = new Set<string>();
    const finalistsList: any[] = [];

    for (const gh of repSorted) {
      if (finalistsSet.size >= FINALS_TOP_REPUTATION) break;
      finalistsSet.add(gh.hero_id);
      finalistsList.push(gh);
    }
    for (const gh of hotSorted) {
      if (finalistsList.length >= 4) break;
      if (finalistsSet.has(gh.hero_id)) continue;
      finalistsSet.add(gh.hero_id);
      finalistsList.push(gh);
    }
    for (const gh of repSorted) {
      if (finalistsList.length >= 4) break;
      if (finalistsSet.has(gh.hero_id)) continue;
      finalistsSet.add(gh.hero_id);
      finalistsList.push(gh);
    }

    if (finalistsList.length < 2) {
      await supabaseAdmin.from('games').update({ status: 'ending' }).eq('id', gameId);
      const champion = finalistsList[0] || alive[0];
      return NextResponse.json({ events: [], champion: champion?.hero?.hero_name || '无人' });
    }

    const events: Partial<GameEvent>[] = [];

    // 四强公告
    const names = finalistsList.map((gh: any) => gh.hero?.hero_name).join('、');
    events.push({
      eventType: 'director_event',
      priority: 8,
      narrative: `🏆 四强出炉！${names} 进入盟主争夺战！`,
      data: { finalists: finalistsList.map((gh: any) => gh.hero_id) },
    } as any);

    // === 半决赛：交叉对阵 ===
    const matchups = finalistsList.length >= 4
      ? [[finalistsList[0], finalistsList[3]], [finalistsList[1], finalistsList[2]]]
      : [[finalistsList[0], finalistsList[1]]];

    const winners: any[] = [];

    for (const [hero1gh, hero2gh] of matchups) {
      const h1 = hero1gh.hero;
      const h2 = hero2gh.hero;
      let h1Hp = hero1gh.hp;
      let h2Hp = hero2gh.hp;

      events.push({
        eventType: 'director_event',
        priority: 7,
        heroId: hero1gh.hero_id,
        targetHeroId: hero2gh.hero_id,
        narrative: `⚔️ 半决赛！${h1.hero_name}（HP:${h1Hp}）对阵 ${h2.hero_name}（HP:${h2Hp}）！`,
        data: { phase: 'semifinal' },
      } as any);

      // 3 回合出招
      for (let r = 1; r <= FINALS_ROUNDS; r++) {
        const [res1, res2] = await Promise.all([
          getFinalsMove(hero1gh, h2.hero_name),
          getFinalsMove(hero2gh, h1.hero_name),
        ]);

        const move1 = res1.move;
        const move2 = res2.move;
        const moveName1 = getMoveName(h1.npc_template_id, h1.faction, move1);
        const moveName2 = getMoveName(h2.npc_template_id, h2.faction, move2);

        const result = resolveFinalsRound({
          move1, move2,
          hero1Attrs: { strength: h1.strength, wisdom: h1.wisdom, innerForce: h1.inner_force },
          hero2Attrs: { strength: h2.strength, wisdom: h2.wisdom, innerForce: h2.inner_force },
          hero1Credit: hero1gh.credit || 50,
          hero2Credit: hero2gh.credit || 50,
          hero1Morality: hero1gh.morality ?? 50,
          hero2Morality: hero2gh.morality ?? 50,
        });

        h1Hp = Math.max(0, h1Hp + result.hero1HpDelta);
        h2Hp = Math.max(0, h2Hp + result.hero2HpDelta);

        // --- Event 1: Hero 1 readies ---
        events.push({
          eventType: 'fight',
          priority: 5,
          heroId: hero1gh.hero_id,
          narrative: getReadyNarrative(h1.hero_name, moveName1, move1),
          innerThought: getInnerThought(h1.npc_template_id, h1.personality_type),
          taunt: res1.taunt,
          data: { phase: 'semifinal', round: r, move: move1 },
        } as any);

        // --- Event 2: Hero 2 readies ---
        events.push({
          eventType: 'fight',
          priority: 5,
          heroId: hero2gh.hero_id,
          narrative: getReadyNarrative(h2.hero_name, moveName2, move2),
          innerThought: getInnerThought(h2.npc_template_id, h2.personality_type),
          taunt: res2.taunt,
          data: { phase: 'semifinal', round: r, move: move2 },
        } as any);

        // --- Event 3: Clash result ---
        const clashText = getClashNarrative(
          h1.hero_name, h2.hero_name,
          moveName1, moveName2, move1, move2, result.result,
        );

        // Determine proper hpDelta routing for EventRevealer
        // EventRevealer applies hpDelta to targetHeroId for fight events
        if (result.hero1HpDelta < 0 && result.hero2HpDelta < 0) {
          // Both hurt — two events
          events.push({
            eventType: 'fight', priority: 7,
            heroId: hero1gh.hero_id,
            targetHeroId: hero2gh.hero_id,
            narrative: clashText,
            hpDelta: result.hero2HpDelta,
            data: { round: r, move1, move2, result: result.result, h1Hp, h2Hp },
          } as any);
          events.push({
            eventType: 'fight', priority: 5,
            heroId: hero2gh.hero_id,
            targetHeroId: hero1gh.hero_id,
            narrative: `${h1.hero_name}也被反震之力波及！`,
            hpDelta: result.hero1HpDelta,
            data: { round: r, aftershock: true },
          } as any);
        } else if (result.hero2HpDelta < 0) {
          // Hero2 takes damage
          events.push({
            eventType: 'fight', priority: 7,
            heroId: hero1gh.hero_id,
            targetHeroId: hero2gh.hero_id,
            narrative: clashText,
            taunt: getWinTaunt(h1.npc_template_id),
            hpDelta: result.hero2HpDelta,
            data: { round: r, move1, move2, result: result.result, h1Hp, h2Hp },
          } as any);
        } else if (result.hero1HpDelta < 0) {
          // Hero1 takes damage
          events.push({
            eventType: 'fight', priority: 7,
            heroId: hero2gh.hero_id,
            targetHeroId: hero1gh.hero_id,
            narrative: clashText,
            taunt: getWinTaunt(h2.npc_template_id),
            hpDelta: result.hero1HpDelta,
            data: { round: r, move1, move2, result: result.result, h1Hp, h2Hp },
          } as any);
        } else {
          // Draw / mutual heal
          events.push({
            eventType: 'fight', priority: 6,
            heroId: hero1gh.hero_id,
            targetHeroId: hero2gh.hero_id,
            narrative: clashText,
            data: { round: r, move1, move2, result: result.result, h1Hp, h2Hp },
          } as any);
        }

        if (h1Hp <= 0 || h2Hp <= 0) break;
      }

      // 判定胜者
      let winner, loser;
      if (h1Hp > h2Hp) {
        winner = hero1gh; loser = hero2gh;
      } else if (h2Hp > h1Hp) {
        winner = hero2gh; loser = hero1gh;
      } else {
        winner = (hero1gh.reputation || 0) >= (hero2gh.reputation || 0) ? hero1gh : hero2gh;
        loser = winner === hero1gh ? hero2gh : hero1gh;
      }

      winners.push(winner);

      events.push({
        eventType: 'fight',
        priority: 8,
        heroId: winner.hero_id,
        targetHeroId: loser.hero_id,
        narrative: `🎉 ${winner.hero.hero_name} 击败 ${loser.hero.hero_name}，晋级决赛！`,
        taunt: getWinTaunt(winner.hero.npc_template_id),
        innerThought: getLoseReaction(loser.hero.npc_template_id),
        data: { phase: 'semifinal_result' },
      } as any);

      await Promise.all([
        supabaseAdmin.from('game_heroes').update({ hp: h1Hp }).eq('id', hero1gh.id),
        supabaseAdmin.from('game_heroes').update({ hp: h2Hp }).eq('id', hero2gh.id),
      ]);
    }

    // === 半决赛后：进入神兵助战阶段（或直接结束）===
    if (winners.length >= 2) {
      // 随机选8个神器
      const shuffled = [...ARTIFACTS].sort(() => Math.random() - 0.5);
      const selectedArtifacts = shuffled.slice(0, ARTIFACT_POOL_SIZE);

      // 查询 intro 下注总额
      const { data: betSum } = await supabaseAdmin
        .from('bets')
        .select('amount')
        .eq('game_id', gameId);
      const introBetTotal = (betSum || []).reduce((s: number, b: any) => s + (b.amount || 0), 0);

      // 构建 artifactPool
      const artifactPool = {
        finalists: winners.map((w: any) => ({
          heroId: w.hero_id,
          heroName: w.hero.hero_name,
          totalValue: 0,
          giftCount: 0,
          artifacts: [],
        })),
        availableArtifacts: selectedArtifacts,
        totalPrizePool: introBetTotal,
        introBetTotal,
        isOpen: true,
      };

      events.push({
        eventType: 'director_event',
        priority: 8,
        narrative: `⚔️ 决赛双雄已出！${winners[0].hero.hero_name} vs ${winners[1].hero.hero_name}！观众可赠送神兵助战！`,
        data: { phase: 'artifact_selection', finalistIds: winners.map((w: any) => w.hero_id) },
      } as any);

      await supabaseAdmin.from('games').update({ status: 'artifact_selection' }).eq('id', gameId);

      const { error: gsError } = await supabaseAdmin.from('game_state').upsert({
        id: 'current',
        game_id: gameId,
        status: 'artifact_selection',
        phase: 'artifact_selection',
        recent_events: events,
        artifact_pool: artifactPool,
        phase_started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (gsError) {
        console.error('[Finals] game_state upsert failed:', gsError.message);
      }
    } else if (winners.length === 1) {
      const champion = winners[0];
      events.push({
        eventType: 'champion',
        priority: 8,
        heroId: champion.hero_id,
        narrative: `🏆 ${champion.hero.hero_name} 无人能敌，荣登武林盟主！`,
        taunt: getWinTaunt(champion.hero.npc_template_id),
        data: { championHeroId: champion.hero_id },
      } as any);

      await supabaseAdmin.from('games').update({
        status: 'ending',
        champion_hero_id: champion.hero_id,
      }).eq('id', gameId);
    }

    // 写入事件
    if (events.length > 0) {
      await supabaseAdmin.from('game_events').insert(
        events.map((e, i) => ({
          game_id: gameId,
          round: 7,
          sequence: i,
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

    const { data: freshState } = await supabaseAdmin
      .from('game_state').select('*').eq('id', 'current').single();

    return NextResponse.json({
      events,
      gameState: freshState ? mapGameStateRow(freshState) : undefined,
    });
  } catch (err: any) {
    console.error('Finals error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// getFinalsMove 已提取到 @/lib/game/finals-engine.ts
