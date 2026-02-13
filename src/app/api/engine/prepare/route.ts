import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { pickRandomNpcs, pickRandomTrait, NPC_TEMPLATES } from '@/lib/game/npc-data/templates';
import { GAME_THEMES, MAX_SEATS, INITIAL_HP, INITIAL_MORALITY, INITIAL_CREDIT } from '@/lib/game/constants';
import { SecondMeClient } from '@/lib/game/secondme-client';
import { introPrompt, bioPrompt, generateFallbackBio } from '@/lib/game/prompts';
import { dashscopeChat } from '@/lib/game/dashscope';
import { requireSession } from '@/lib/auth';

export const maxDuration = 60;

/**
 * Countdown 期间调用：填充 NPC、生成背景故事 + 开场宣言。
 * 提前完成耗时操作，让后续 start API 几乎瞬间完成。
 *
 * 重要：不修改 games.status（避免阻塞 start API 的乐观锁）。
 * 使用 game_state.batch_progress.prepareStatus 作为幂等锁。
 */
export async function POST(request: NextRequest) {
  try {
    const authError = await requireSession();
    if (authError) return authError;

    // 获取当前等待/倒计时中的游戏
    const { data: currentGame } = await supabaseAdmin
      .from('games')
      .select('*')
      .in('status', ['waiting', 'countdown', 'preparing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!currentGame) {
      return NextResponse.json({ error: 'No game waiting' }, { status: 400 });
    }

    // 幂等锁：通过 game_state.batch_progress.prepareStatus 防止重复调用
    // 不修改 games.status，这样 start API 随时可以锁定
    const { data: gs } = await supabaseAdmin
      .from('game_state')
      .select('batch_progress')
      .eq('id', 'current')
      .single();

    const currentBatchProgress = gs?.batch_progress || {};
    if (currentBatchProgress.prepareStatus === 'running' || currentBatchProgress.prepareStatus === 'done') {
      return NextResponse.json({ gameId: currentGame.id, status: 'already_preparing' });
    }

    // 标记 prepare 开始（不阻塞主状态机）
    await supabaseAdmin.from('game_state').update({
      batch_progress: { ...currentBatchProgress, prepareStatus: 'running' },
      updated_at: new Date().toISOString(),
    }).eq('id', 'current');

    // 获取已入座的英雄
    const { data: existingHeroes } = await supabaseAdmin
      .from('game_heroes')
      .select('*, hero:heroes(*)')
      .eq('game_id', currentGame.id);

    const humanCount = existingHeroes?.filter((gh: any) => !gh.hero?.is_npc).length || 0;
    if (humanCount === 0) {
      return NextResponse.json({ error: 'No human players' }, { status: 400 });
    }

    // === 填充 NPC ===
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

    // 选主题 + 局数（写入 games 表，不改 status）
    const theme = currentGame.theme || GAME_THEMES[Math.floor(Math.random() * GAME_THEMES.length)];
    const { count } = await supabaseAdmin
      .from('games')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'ended');
    const gameNumber = currentGame.game_number || (count || 0) + 1;

    // 保存 theme 和 game_number，不改 status，不改 countdown_started_at
    await supabaseAdmin.from('games').update({
      theme,
      game_number: gameNumber,
    }).eq('id', currentGame.id);

    // 获取所有英雄（含刚插入的 NPC）
    const { data: allHeroes } = await supabaseAdmin
      .from('game_heroes')
      .select('*, hero:heroes(*)')
      .eq('game_id', currentGame.id)
      .order('seat_number');

    // === 为真人英雄生成 backstory ===
    const humanHeroesForBio = allHeroes?.filter((gh: any) =>
      !gh.hero?.is_npc && !gh.hero?.backstory
    ) || [];

    if (humanHeroesForBio.length > 0) {
      const bioPromises = humanHeroesForBio.map(async (gh: any) => {
        const hero = gh.hero;
        try {
          const client = new SecondMeClient(hero.access_token || '');
          const bio = await client.getSpeech(bioPrompt(hero.hero_name, hero.faction));
          if (bio && bio.length > 10) {
            await supabaseAdmin.from('heroes').update({ backstory: bio }).eq('id', hero.id);
            return { heroId: hero.id, backstory: bio };
          }
        } catch {
          try {
            const refreshed = await SecondMeClient.refreshToken(hero.refresh_token);
            if (refreshed) {
              await supabaseAdmin.from('heroes').update({
                access_token: refreshed.accessToken,
                refresh_token: refreshed.refreshToken,
              }).eq('id', hero.id);
              const client = new SecondMeClient(refreshed.accessToken);
              const bio = await client.getSpeech(bioPrompt(hero.hero_name, hero.faction));
              if (bio && bio.length > 10) {
                await supabaseAdmin.from('heroes').update({ backstory: bio }).eq('id', hero.id);
                return { heroId: hero.id, backstory: bio };
              }
            }
          } catch { /* DashScope fallback */ }
        }
        const aiBio = await dashscopeChat(bioPrompt(hero.hero_name, hero.faction));
        if (aiBio && aiBio.length > 10) {
          await supabaseAdmin.from('heroes').update({ backstory: aiBio }).eq('id', hero.id);
          return { heroId: hero.id, backstory: aiBio };
        }
        const fallbackBio = generateFallbackBio(hero.hero_name, hero.faction);
        await supabaseAdmin.from('heroes').update({ backstory: fallbackBio }).eq('id', hero.id);
        return { heroId: hero.id, backstory: fallbackBio };
      });

      const bioResults = await Promise.allSettled(bioPromises);
      const bioMap = new Map<string, string>();
      for (const r of bioResults) {
        if (r.status === 'fulfilled' && r.value) bioMap.set(r.value.heroId, r.value.backstory);
      }
      for (const gh of allHeroes || []) {
        const generated = bioMap.get(gh.hero_id);
        if (generated) gh.hero.backstory = generated;
      }
    }

    // === 为真人英雄生成开场宣言 ===
    const humanHeroes = allHeroes?.filter((gh: any) =>
      !gh.hero?.is_npc && gh.hero?.catchphrase === '江湖路远，各位保重。'
    ) || [];

    if (humanHeroes.length > 0) {
      const generatePromises = humanHeroes.map(async (gh: any) => {
        const hero = gh.hero;
        try {
          const client = new SecondMeClient(hero.access_token || '');
          const speech = await client.getSpeech(introPrompt(hero.hero_name, hero.faction));
          if (speech && speech !== '……') {
            await supabaseAdmin.from('heroes').update({ catchphrase: speech }).eq('id', hero.id);
            return { heroId: hero.id, catchphrase: speech };
          }
        } catch {
          try {
            const refreshed = await SecondMeClient.refreshToken(hero.refresh_token);
            if (refreshed) {
              await supabaseAdmin.from('heroes').update({
                access_token: refreshed.accessToken,
                refresh_token: refreshed.refreshToken,
              }).eq('id', hero.id);
              const client = new SecondMeClient(refreshed.accessToken);
              const speech = await client.getSpeech(introPrompt(hero.hero_name, hero.faction));
              if (speech && speech !== '……') {
                await supabaseAdmin.from('heroes').update({ catchphrase: speech }).eq('id', hero.id);
                return { heroId: hero.id, catchphrase: speech };
              }
            }
          } catch { /* use default */ }
        }
        return null;
      });

      const results = await Promise.allSettled(generatePromises);
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          const gh = allHeroes?.find((g: any) => g.hero_id === r.value!.heroId);
          if (gh) gh.hero.catchphrase = r.value.catchphrase;
        }
      }
    }

    // 构建英雄快照
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

    // 更新 game_state 缓存（英雄带上已生成的 bio），保留原有 countdown_started_at
    await supabaseAdmin.from('game_state').update({
      heroes: heroSnapshots,
      theme,
      game_number: gameNumber,
      batch_progress: { prepareStatus: 'done' },
      updated_at: new Date().toISOString(),
    }).eq('id', 'current');

    return NextResponse.json({
      gameId: currentGame.id,
      gameNumber,
      theme,
      heroCount: heroSnapshots.length,
      humanCount,
      status: 'countdown',
    });
  } catch (err: any) {
    console.error('Prepare error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
