import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { pickRandomNpcs, pickRandomTrait, NPC_TEMPLATES } from '@/lib/game/npc-data/templates';
import { GAME_THEMES, MAX_SEATS, INITIAL_HP, INITIAL_MORALITY, INITIAL_CREDIT } from '@/lib/game/constants';
import { mapGameStateRow } from '@/lib/game/state-mapper';
import { SecondMeClient } from '@/lib/game/secondme-client';
import { introPrompt, bioPrompt, generateFallbackBio } from '@/lib/game/prompts';
import { dashscopeChat } from '@/lib/game/dashscope';
import { requireSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const authError = await requireSession();
    if (authError) return authError;

    // 获取当前游戏（prepare 已将其设回 countdown）
    const { data: currentGame } = await supabaseAdmin
      .from('games')
      .select('*')
      .in('status', ['waiting', 'countdown'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!currentGame) {
      return NextResponse.json({ error: 'No game waiting' }, { status: 400 });
    }

    // 幂等锁：countdown -> starting
    const { data: lockedGame, error: lockErr } = await supabaseAdmin
      .from('games')
      .update({ status: 'starting' })
      .eq('id', currentGame.id)
      .in('status', ['waiting', 'countdown'])
      .select()
      .single();

    if (lockErr || !lockedGame) {
      const { data: existing } = await supabaseAdmin
        .from('games').select('*').eq('id', currentGame.id).single();
      return NextResponse.json({
        gameId: currentGame.id,
        status: existing?.status || 'already_started',
      });
    }

    // 获取已入座英雄
    const { data: existingHeroes } = await supabaseAdmin
      .from('game_heroes')
      .select('*, hero:heroes(*)')
      .eq('game_id', currentGame.id);

    const humanCount = existingHeroes?.filter((gh: any) => !gh.hero?.is_npc).length || 0;
    if (humanCount === 0) {
      return NextResponse.json({ error: 'No human players' }, { status: 400 });
    }

    // 如果 prepare 没跑过（NPC 未填充），这里补上
    const currentCount = existingHeroes?.length || 0;
    const npcNeeded = MAX_SEATS - currentCount;

    if (npcNeeded > 0) {
      const existingNpcIds = existingHeroes
        ?.filter((gh: any) => gh.hero?.is_npc)
        .map((gh: any) => gh.hero?.npc_template_id) || [];

      const npcs = pickRandomNpcs(npcNeeded, existingNpcIds);

      for (let i = 0; i < npcs.length; i++) {
        const template = npcs[i];
        const { data: npcHero } = await supabaseAdmin
          .from('heroes')
          .upsert({
            user_id: `npc_${template.id}`,
            is_npc: true,
            npc_template_id: template.id,
            hero_name: template.heroName,
            faction: template.faction,
            personality_type: template.personalityType,
            catchphrase: template.catchphrase,
            strength: template.strength,
            inner_force: template.innerForce,
            agility: template.agility,
            wisdom: template.wisdom,
            constitution: template.constitution,
            charisma: template.charisma,
            backstory: template.backstory || null,
          }, { onConflict: 'user_id' })
          .select()
          .single();

        if (npcHero) {
          const seatNumber = currentCount + i + 1;
          await supabaseAdmin.from('game_heroes').insert({
            game_id: currentGame.id,
            hero_id: npcHero.id,
            seat_number: seatNumber,
            hp: INITIAL_HP,
            morality: INITIAL_MORALITY,
            credit: INITIAL_CREDIT,
            game_trait: pickRandomTrait(),
          });
        }
      }
    }

    // 选主题（如果 prepare 已选，复用）
    const theme = lockedGame.theme || GAME_THEMES[Math.floor(Math.random() * GAME_THEMES.length)];
    const gameNumber = lockedGame.game_number || 1;

    // 更新游戏状态到 intro
    await supabaseAdmin.from('games').update({
      status: 'intro',
      theme,
      game_number: gameNumber,
      started_at: new Date().toISOString(),
    }).eq('id', currentGame.id);

    // 获取所有英雄
    const { data: allHeroes } = await supabaseAdmin
      .from('game_heroes')
      .select('*, hero:heroes(*)')
      .eq('game_id', currentGame.id)
      .order('seat_number');

    // 如果 prepare 没跑（bios 不存在），快速生成 fallback
    const humanHeroesNoBio = allHeroes?.filter((gh: any) =>
      !gh.hero?.is_npc && !gh.hero?.backstory
    ) || [];
    if (humanHeroesNoBio.length > 0) {
      for (const gh of humanHeroesNoBio) {
        const fallbackBio = generateFallbackBio(gh.hero.hero_name, gh.hero.faction);
        await supabaseAdmin.from('heroes').update({ backstory: fallbackBio }).eq('id', gh.hero.id);
        gh.hero.backstory = fallbackBio;
      }
    }

    const heroSnapshots = allHeroes?.map((gh: any) => {
      const template = NPC_TEMPLATES.find(t => t.id === gh.hero?.npc_template_id);
      return {
        heroId: gh.hero_id,
        heroName: gh.hero?.hero_name || '无名',
        faction: gh.hero?.faction || '少林',
        personalityType: gh.hero?.personality_type || 'random',
        seatNumber: gh.seat_number,
        hp: gh.hp,
        maxHp: INITIAL_HP,
        reputation: 0, hot: 0,
        morality: INITIAL_MORALITY,
        credit: INITIAL_CREDIT,
        isEliminated: false,
        allyHeroId: null, allyHeroName: null,
        martialArts: [], hasDeathPact: false,
        isNpc: gh.hero?.is_npc || false,
        catchphrase: gh.hero?.catchphrase || '……',
        avatarUrl: gh.hero?.avatar_url,
        strength: gh.hero?.strength || 10,
        innerForce: gh.hero?.inner_force || 10,
        agility: gh.hero?.agility || 10,
        wisdom: gh.hero?.wisdom || 10,
        constitution: gh.hero?.constitution || 10,
        charisma: gh.hero?.charisma || 10,
        bio: gh.hero?.backstory || template?.backstory || '',
      };
    }) || [];

    // 生成 intro 事件
    const introEvents = heroSnapshots.map((snap: any) => {
      const template = NPC_TEMPLATES.find(t => t.id === (allHeroes?.find((gh: any) => gh.hero_id === snap.heroId)?.hero?.npc_template_id));
      const backstory = template?.backstory;
      if (backstory) {
        return {
          eventType: 'encounter', priority: 4, heroId: snap.heroId,
          narrative: `【${snap.heroName}·${snap.faction}】${backstory}`,
          taunt: snap.catchphrase,
          data: { phase: 'intro', seatNumber: snap.seatNumber },
        };
      }
      return {
        eventType: 'encounter', priority: 4, heroId: snap.heroId,
        narrative: `【${snap.heroName}·${snap.faction}】江湖新锐，初出茅庐便参加武林大会，实力不容小觑。`,
        taunt: snap.catchphrase,
        data: { phase: 'intro', seatNumber: snap.seatNumber },
      };
    });

    await supabaseAdmin.from('game_state').upsert({
      id: 'current',
      game_id: currentGame.id,
      status: 'intro',
      current_round: 0,
      phase: 'intro',
      theme,
      heroes: heroSnapshots,
      recent_events: introEvents,
      reputation_ranking: [],
      hot_ranking: [],
      next_round_preview: '第一回合：残卷落地',
      betting_pool: { totalPool: 0, heroPools: {}, isOpen: true },
      danmaku: [],
      audience_influence: {},
      batch_progress: {},
      display_started_at: null,
      updated_at: new Date().toISOString(),
    });

    // Fire-and-forget: 触发批处理（不 await）
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    fetch(`${appUrl}/api/engine/run-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: currentGame.id }),
    }).catch(err => console.error('[Start] fire-and-forget run-all error:', err));

    const { data: freshState } = await supabaseAdmin
      .from('game_state').select('*').eq('id', 'current').single();

    return NextResponse.json({
      gameId: currentGame.id,
      gameNumber,
      theme,
      heroCount: heroSnapshots.length,
      humanCount,
      status: 'intro',
      gameState: freshState ? mapGameStateRow(freshState) : undefined,
    });
  } catch (err: any) {
    console.error('Engine start error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
