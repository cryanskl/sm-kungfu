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
    // 获取当前等待中的游戏
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

    // 幂等锁：只有从 countdown -> intro 原子更新成功者才继续补 NPC
    const { data: lockedGame, error: lockErr } = await supabaseAdmin
      .from('games')
      .update({ status: 'starting' })
      .eq('id', currentGame.id)
      .in('status', ['waiting', 'countdown'])
      .select()
      .single();

    if (lockErr || !lockedGame) {
      // 已被其他请求锁定或已开始，返回当前状态
      const { data: existing } = await supabaseAdmin
        .from('games').select('*').eq('id', currentGame.id).single();
      return NextResponse.json({
        gameId: currentGame.id,
        status: existing?.status || 'already_started',
      });
    }

    // 获取已入座的真人英雄
    const { data: existingHeroes } = await supabaseAdmin
      .from('game_heroes')
      .select('*, hero:heroes(*)')
      .eq('game_id', currentGame.id);

    const humanCount = existingHeroes?.filter((gh: any) => !gh.hero?.is_npc).length || 0;
    if (humanCount === 0) {
      return NextResponse.json({ error: 'No human players' }, { status: 400 });
    }

    // 计算需要多少 NPC
    const currentCount = existingHeroes?.length || 0;
    const npcNeeded = MAX_SEATS - currentCount;

    // 选取 NPC
    if (npcNeeded > 0) {
      const existingNpcIds = existingHeroes
        ?.filter((gh: any) => gh.hero?.is_npc)
        .map((gh: any) => gh.hero?.npc_template_id) || [];

      const npcs = pickRandomNpcs(npcNeeded, existingNpcIds);

      for (let i = 0; i < npcs.length; i++) {
        const template = npcs[i];

        // 创建 NPC 英雄记录
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
          await supabaseAdmin
            .from('game_heroes')
            .insert({
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

    // 选主题
    const theme = GAME_THEMES[Math.floor(Math.random() * GAME_THEMES.length)];

    // 获取局数
    const { count } = await supabaseAdmin
      .from('games')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'ended');
    const gameNumber = (count || 0) + 1;

    // 更新游戏状态
    await supabaseAdmin
      .from('games')
      .update({
        status: 'intro',
        theme,
        game_number: gameNumber,
        started_at: new Date().toISOString(),
      })
      .eq('id', currentGame.id);

    // 更新 game_state 缓存
    const { data: allHeroes } = await supabaseAdmin
      .from('game_heroes')
      .select('*, hero:heroes(*)')
      .eq('game_id', currentGame.id)
      .order('seat_number');

    // === 为真人英雄生成 backstory（首次生成，之后复用） ===
    const humanHeroesForBio = allHeroes?.filter((gh: any) =>
      !gh.hero?.is_npc && !gh.hero?.backstory
    ) || [];

    if (humanHeroesForBio.length > 0) {
      const bioPromises = humanHeroesForBio.map(async (gh: any) => {
        const hero = gh.hero;
        try {
          const client = new SecondMeClient(hero.access_token || '');
          const bio = await client.getSpeech(
            bioPrompt(hero.hero_name, hero.faction)
          );
          if (bio && bio.length > 10) {
            await supabaseAdmin.from('heroes')
              .update({ backstory: bio })
              .eq('id', hero.id);
            return { heroId: hero.id, backstory: bio };
          }
        } catch {
          try {
            const refreshed = await SecondMeClient.refreshToken(hero.refresh_token);
            if (refreshed) {
              await supabaseAdmin.from('heroes')
                .update({ access_token: refreshed.accessToken, refresh_token: refreshed.refreshToken })
                .eq('id', hero.id);
              const client = new SecondMeClient(refreshed.accessToken);
              const bio = await client.getSpeech(
                bioPrompt(hero.hero_name, hero.faction)
              );
              if (bio && bio.length > 10) {
                await supabaseAdmin.from('heroes')
                  .update({ backstory: bio })
                  .eq('id', hero.id);
                return { heroId: hero.id, backstory: bio };
              }
            }
          } catch { /* 刷新失败，走 DashScope fallback */ }
        }
        // SecondMe 失败 → 用 DashScope qwen-max 生成
        const aiBio = await dashscopeChat(
          bioPrompt(hero.hero_name, hero.faction),
        );
        if (aiBio && aiBio.length > 10) {
          await supabaseAdmin.from('heroes')
            .update({ backstory: aiBio })
            .eq('id', hero.id);
          return { heroId: hero.id, backstory: aiBio };
        }
        // DashScope 也失败 → 模板兜底
        const fallbackBio = generateFallbackBio(hero.hero_name, hero.faction);
        await supabaseAdmin.from('heroes')
          .update({ backstory: fallbackBio })
          .eq('id', hero.id);
        return { heroId: hero.id, backstory: fallbackBio };
      });

      const bioResults = await Promise.allSettled(bioPromises);
      const bioMap = new Map<string, string>();
      for (const r of bioResults) {
        if (r.status === 'fulfilled' && r.value) {
          bioMap.set(r.value.heroId, r.value.backstory);
        }
      }
      // 回填到 allHeroes 以便下面 snapshot 读取
      for (const gh of allHeroes || []) {
        const generated = bioMap.get(gh.hero_id);
        if (generated) gh.hero.backstory = generated;
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
        reputation: 0,
        hot: 0,
        morality: INITIAL_MORALITY,
        credit: INITIAL_CREDIT,
        isEliminated: false,
        allyHeroId: null,
        allyHeroName: null,
        martialArts: [],
        hasDeathPact: false,
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

    // === 为真人英雄批量生成 AI 宣言（利用倒计时空闲时间） ===
    const humanHeroes = allHeroes?.filter((gh: any) =>
      !gh.hero?.is_npc && gh.hero?.catchphrase === '江湖路远，各位保重。'
    ) || [];

    if (humanHeroes.length > 0) {
      const generatePromises = humanHeroes.map(async (gh: any) => {
        const hero = gh.hero;
        let token = hero.access_token;
        try {
          const client = new SecondMeClient(token);
          const speech = await client.getSpeech(
            introPrompt(hero.hero_name, hero.faction)
          );
          if (speech && speech !== '……') {
            await supabaseAdmin.from('heroes')
              .update({ catchphrase: speech })
              .eq('id', hero.id);
            return { heroId: hero.id, catchphrase: speech };
          }
        } catch {
          // Token 可能过期，尝试刷新后重试
          try {
            const refreshed = await SecondMeClient.refreshToken(hero.refresh_token);
            if (refreshed) {
              await supabaseAdmin.from('heroes')
                .update({ access_token: refreshed.accessToken, refresh_token: refreshed.refreshToken })
                .eq('id', hero.id);
              const client = new SecondMeClient(refreshed.accessToken);
              const speech = await client.getSpeech(
                introPrompt(hero.hero_name, hero.faction)
              );
              if (speech && speech !== '……') {
                await supabaseAdmin.from('heroes')
                  .update({ catchphrase: speech })
                  .eq('id', hero.id);
                return { heroId: hero.id, catchphrase: speech };
              }
            }
          } catch { /* 刷新失败，使用默认宣言 */ }
        }
        return null;
      });

      const results = await Promise.allSettled(generatePromises);

      // 将生成的宣言更新到 heroSnapshots
      const catchphraseMap = new Map<string, string>();
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          catchphraseMap.set(r.value.heroId, r.value.catchphrase);
        }
      }
      for (const snap of heroSnapshots) {
        const generated = catchphraseMap.get(snap.heroId);
        if (generated) snap.catchphrase = generated;
      }
    }

    // 生成封神榜背景故事事件
    const introEvents = heroSnapshots.map((snap: any, i: number) => {
      const template = NPC_TEMPLATES.find(t => t.id === (allHeroes?.find((gh: any) => gh.hero_id === snap.heroId)?.hero?.npc_template_id));
      const backstory = template?.backstory;
      if (backstory) {
        return {
          eventType: 'encounter',
          priority: 4,
          heroId: snap.heroId,
          narrative: `【${snap.heroName}·${snap.faction}】${backstory}`,
          taunt: snap.catchphrase,
          data: { phase: 'intro', seatNumber: snap.seatNumber },
        };
      }
      // 真人玩家：用宣言作为简介
      return {
        eventType: 'encounter',
        priority: 4,
        heroId: snap.heroId,
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
      phase_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Read fresh game_state for immediate client update
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
