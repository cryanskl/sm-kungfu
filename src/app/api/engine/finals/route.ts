import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveFinalsRound } from '@/lib/game/combat';
import { finalsPrompt } from '@/lib/game/prompts';
import { SecondMeClient, parseAiResponse } from '@/lib/game/secondme-client';
import { NPC_TEMPLATES } from '@/lib/game/npc-data/templates';
import { FINALS_TOP_REPUTATION, FINALS_TOP_HOT, FINALS_ROUNDS } from '@/lib/game/constants';
import { FinalsMove, GameEvent } from '@/lib/types';
import { mapGameStateRow } from '@/lib/game/state-mapper';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
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
      // 已在处理，返回缓存
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

    // 声望前2
    for (const gh of repSorted) {
      if (finalistsSet.size >= FINALS_TOP_REPUTATION) break;
      finalistsSet.add(gh.hero_id);
      finalistsList.push(gh);
    }
    // 热搜前2（去重）
    for (const gh of hotSorted) {
      if (finalistsList.length >= 4) break;
      if (finalistsSet.has(gh.hero_id)) continue;
      finalistsSet.add(gh.hero_id);
      finalistsList.push(gh);
    }
    // 不足4人递补声望
    for (const gh of repSorted) {
      if (finalistsList.length >= 4) break;
      if (finalistsSet.has(gh.hero_id)) continue;
      finalistsSet.add(gh.hero_id);
      finalistsList.push(gh);
    }

    // 降级处理：不足2人
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
    // [0] vs [3], [1] vs [2]（声望1 vs 热搜2，声望2 vs 热搜1）
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
        eventType: 'fight',
        priority: 7,
        heroId: hero1gh.hero_id,
        targetHeroId: hero2gh.hero_id,
        narrative: `⚔️ 半决赛！${h1.hero_name} 对阵 ${h2.hero_name}！`,
        data: { phase: 'semifinal' },
      } as any);

      // 3 回合出招
      for (let r = 1; r <= FINALS_ROUNDS; r++) {
        const [move1, move2] = await Promise.all([
          getFinalsMove(hero1gh, h2.hero_name),
          getFinalsMove(hero2gh, h1.hero_name),
        ]);

        const result = resolveFinalsRound({
          move1, move2,
          hero1Attrs: { strength: h1.strength, wisdom: h1.wisdom, innerForce: h1.inner_force },
          hero2Attrs: { strength: h2.strength, wisdom: h2.wisdom, innerForce: h2.inner_force },
          hero1Credit: hero1gh.credit || 50,
          hero2Credit: hero2gh.credit || 50,
        });

        h1Hp = Math.max(0, h1Hp + result.hero1HpDelta);
        h2Hp = Math.max(0, h2Hp + result.hero2HpDelta);

        const moveEmoji: Record<string, string> = { attack: '⚔️', defend: '🛡️', ultimate: '💥', bluff: '🎭' };

        events.push({
          eventType: 'fight',
          priority: 6,
          heroId: hero1gh.hero_id,
          targetHeroId: hero2gh.hero_id,
          narrative: `第${r}招：${h1.hero_name}${moveEmoji[move1] || ''}${move1} vs ${h2.hero_name}${moveEmoji[move2] || ''}${move2}。${result.narrative}`,
          hpDelta: result.hero1HpDelta,
          data: { round: r, move1, move2, result: result.result, h1Hp, h2Hp },
        } as any);

        if (h1Hp <= 0 || h2Hp <= 0) break;
      }

      // 判定胜者
      let winner, loser;
      if (h1Hp > h2Hp) {
        winner = hero1gh; loser = hero2gh;
      } else if (h2Hp > h1Hp) {
        winner = hero2gh; loser = hero1gh;
      } else {
        // 同HP比声望
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
        data: { phase: 'semifinal_result' },
      } as any);

      // 更新HP
      await supabaseAdmin.from('game_heroes').update({ hp: h1Hp }).eq('id', hero1gh.id);
      await supabaseAdmin.from('game_heroes').update({ hp: h2Hp }).eq('id', hero2gh.id);
    }

    // === 决赛 ===
    if (winners.length >= 2) {
      const [f1gh, f2gh] = winners;
      const f1 = f1gh.hero;
      const f2 = f2gh.hero;
      let f1Hp = f1gh.hp;
      let f2Hp = f2gh.hp;

      events.push({
        eventType: 'director_event',
        priority: 8,
        narrative: `🏆 终极决战！${f1.hero_name} vs ${f2.hero_name}！谁将成为武林盟主？！`,
        data: { phase: 'final' },
      } as any);

      for (let r = 1; r <= FINALS_ROUNDS; r++) {
        const [move1, move2] = await Promise.all([
          getFinalsMove(f1gh, f2.hero_name),
          getFinalsMove(f2gh, f1.hero_name),
        ]);

        const result = resolveFinalsRound({
          move1, move2,
          hero1Attrs: { strength: f1.strength, wisdom: f1.wisdom, innerForce: f1.inner_force },
          hero2Attrs: { strength: f2.strength, wisdom: f2.wisdom, innerForce: f2.inner_force },
          hero1Credit: f1gh.credit || 50,
          hero2Credit: f2gh.credit || 50,
        });

        f1Hp = Math.max(0, f1Hp + result.hero1HpDelta);
        f2Hp = Math.max(0, f2Hp + result.hero2HpDelta);

        const moveEmoji: Record<string, string> = { attack: '⚔️', defend: '🛡️', ultimate: '💥', bluff: '🎭' };

        events.push({
          eventType: 'fight',
          priority: 7,
          heroId: f1gh.hero_id,
          targetHeroId: f2gh.hero_id,
          narrative: `🏆 决赛第${r}招：${f1.hero_name}${moveEmoji[move1] || ''}${move1} vs ${f2.hero_name}${moveEmoji[move2] || ''}${move2}。${result.narrative}`,
          hpDelta: result.hero1HpDelta,
          data: { round: r, move1, move2, result: result.result, f1Hp, f2Hp },
        } as any);

        if (f1Hp <= 0 || f2Hp <= 0) break;
      }

      // 判定盟主
      let champion, runnerUp;
      if (f1Hp > f2Hp) {
        champion = f1gh; runnerUp = f2gh;
      } else if (f2Hp > f1Hp) {
        champion = f2gh; runnerUp = f1gh;
      } else {
        champion = (f1gh.reputation || 0) >= (f2gh.reputation || 0) ? f1gh : f2gh;
        runnerUp = champion === f1gh ? f2gh : f1gh;
      }

      events.push({
        eventType: 'champion',
        priority: 8,
        heroId: champion.hero_id,
        narrative: `🏆🏆🏆 ${champion.hero.hero_name} 击败 ${runnerUp.hero.hero_name}，荣登武林盟主！天下第一！`,
        data: { championHeroId: champion.hero_id, runnerUpHeroId: runnerUp.hero_id },
      } as any);

      // 更新游戏
      await supabaseAdmin.from('games').update({
        status: 'ending',
        champion_hero_id: champion.hero_id,
      }).eq('id', gameId);

      // 更新 game_state 缓存
      await supabaseAdmin.from('game_state').upsert({
        id: 'current',
        game_id: gameId,
        status: 'ending',
        phase: 'ending',
        champion_name: champion.hero.hero_name,
        recent_events: events,
        updated_at: new Date().toISOString(),
      });
    } else if (winners.length === 1) {
      // 只有一个赢家（2人半决赛）
      const champion = winners[0];
      events.push({
        eventType: 'champion',
        priority: 8,
        heroId: champion.hero_id,
        narrative: `🏆 ${champion.hero.hero_name} 无人能敌，荣登武林盟主！`,
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
          data: e.data || {},
          hp_delta: e.hpDelta || 0,
        }))
      );
    }

    // Read fresh game_state for immediate client update
    const { data: freshState } = await supabaseAdmin
      .from('game_state').select('*').eq('id', 'current').single();

    return NextResponse.json({
      events,
      gameState: freshState ? mapGameStateRow(freshState) : undefined,
    });
  } catch (err: any) {
    console.error('Finals error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// 获取决赛出招
async function getFinalsMove(gh: any, opponentName: string): Promise<FinalsMove> {
  const hero = gh.hero;
  const validMoves: FinalsMove[] = ['attack', 'defend', 'ultimate', 'bluff'];

  if (hero.is_npc) {
    // NPC 出招逻辑
    const template = NPC_TEMPLATES.find(t => t.id === hero.npc_template_id);
    if (template) {
      if (template.alwaysFightStrongest) return 'attack';
      if (template.neverFight) return Math.random() < 0.6 ? 'defend' : 'bluff';
      if (template.personalityType === 'aggressive') return Math.random() < 0.5 ? 'attack' : 'ultimate';
      if (template.personalityType === 'cautious') return Math.random() < 0.5 ? 'defend' : 'attack';
      if (template.personalityType === 'cunning') return Math.random() < 0.4 ? 'bluff' : 'attack';
    }
    return validMoves[Math.floor(Math.random() * validMoves.length)];
  }

  // 真人：调 SecondMe
  try {
    const client = new SecondMeClient(hero.access_token || '');
    const prompt = finalsPrompt({
      heroId: gh.hero_id,
      heroName: hero.hero_name,
      faction: hero.faction,
      personalityType: hero.personality_type,
      hp: gh.hp,
      maxHp: 100,
      seatNumber: gh.seat_number,
      reputation: gh.reputation || 0,
      hot: gh.hot || 0,
      morality: gh.morality || 50,
      credit: gh.credit || 50,
      isEliminated: false,
      allyHeroId: null,
      allyHeroName: null,
      martialArts: gh.martial_arts || [],
      hasDeathPact: gh.has_death_pact || false,
      isNpc: false,
      catchphrase: hero.catchphrase || '',
      avatarUrl: hero.avatar_url,
      strength: hero.strength,
      innerForce: hero.inner_force,
      agility: hero.agility,
      wisdom: hero.wisdom,
      constitution: hero.constitution,
      charisma: hero.charisma,
    }, opponentName);

    const raw = await client.act(prompt);
    // 解析 move
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (validMoves.includes(parsed.move)) return parsed.move;
      }
    } catch { /* fallback */ }
    // regex fallback
    const moveMatch = raw.match(/"move"\s*:\s*"(\w+)"/);
    if (moveMatch && validMoves.includes(moveMatch[1] as FinalsMove)) {
      return moveMatch[1] as FinalsMove;
    }
  } catch { /* fallback */ }

  return validMoves[Math.floor(Math.random() * validMoves.length)];
}
