import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getHeroIdFromCookies } from '@/lib/auth';
import { computeFinalAttributes, QUIZ_QUESTIONS } from '@/lib/game/character-editor';
import type { CharacterConfig } from '@/lib/types';

/**
 * GET: 返回当前角色配置 + 问卷题目 + 上次修改时间
 */
export async function GET(request: NextRequest) {
  const { userId, heroId } = getHeroIdFromCookies(request.cookies);

  if (!userId || !heroId) {
    return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  }

  const { data: hero } = await supabaseAdmin
    .from('heroes')
    .select('character_config, quiz_answers, last_character_edit, strength, inner_force, agility, wisdom, constitution, charisma, faction, personality_type, hero_name, catchphrase')
    .eq('id', heroId)
    .single();

  if (!hero) {
    return NextResponse.json({ error: 'Hero not found' }, { status: 404 });
  }

  // 计算冷却时间
  const lastEdit = hero.last_character_edit ? new Date(hero.last_character_edit).getTime() : 0;
  const cooldownMs = 24 * 60 * 60 * 1000; // 24h
  const canEdit = lastEdit === 0 || Date.now() - lastEdit > cooldownMs;
  const nextEditAt = lastEdit > 0 ? new Date(lastEdit + cooldownMs).toISOString() : null;

  return NextResponse.json({
    config: hero.character_config || null,
    quizAnswers: hero.quiz_answers || null,
    quizQuestions: QUIZ_QUESTIONS,
    currentAttrs: {
      strength: hero.strength,
      innerForce: hero.inner_force,
      agility: hero.agility,
      wisdom: hero.wisdom,
      constitution: hero.constitution,
      charisma: hero.charisma,
    },
    faction: hero.faction,
    personalityType: hero.personality_type,
    heroName: hero.hero_name,
    catchphrase: hero.catchphrase,
    canEdit,
    nextEditAt,
  });
}

/**
 * PUT: 提交角色设定修改（每天限一次）
 */
export async function PUT(request: NextRequest) {
  const { userId, heroId } = getHeroIdFromCookies(request.cookies);

  if (!userId || !heroId) {
    return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  }

  const { data: hero } = await supabaseAdmin
    .from('heroes')
    .select('last_character_edit, strength, inner_force, agility, wisdom, constitution, charisma, faction, personality_type')
    .eq('id', heroId)
    .single();

  if (!hero) {
    return NextResponse.json({ error: 'Hero not found' }, { status: 404 });
  }

  // 检查冷却
  const lastEdit = hero.last_character_edit ? new Date(hero.last_character_edit).getTime() : 0;
  const cooldownMs = 24 * 60 * 60 * 1000;
  if (lastEdit > 0 && Date.now() - lastEdit < cooldownMs) {
    const nextEditAt = new Date(lastEdit + cooldownMs).toISOString();
    return NextResponse.json({
      error: '每天只能修改一次角色设定',
      nextEditAt,
    }, { status: 429 });
  }

  const body = await request.json();
  const config: CharacterConfig = body.config || null;
  const quizAnswers: number[] | null = body.quizAnswers || null;

  // 验证 config
  if (config) {
    if (config.backstoryKeywords && config.backstoryKeywords.length > 5) {
      config.backstoryKeywords = config.backstoryKeywords.slice(0, 5);
    }
    if (config.customCatchphrase && config.customCatchphrase.length > 50) {
      config.customCatchphrase = config.customCatchphrase.slice(0, 50);
    }
  }

  // 验证 quizAnswers
  if (quizAnswers && quizAnswers.length > QUIZ_QUESTIONS.length) {
    return NextResponse.json({ error: 'Invalid quiz answers' }, { status: 400 });
  }

  // 计算最终属性
  const baseAttrs = {
    strength: hero.strength,
    innerForce: hero.inner_force,
    agility: hero.agility,
    wisdom: hero.wisdom,
    constitution: hero.constitution,
    charisma: hero.charisma,
  };

  const { attrs, faction, personalityType } = computeFinalAttributes(baseAttrs, config, quizAnswers);

  // 更新数据库
  const updateObj: Record<string, any> = {
    character_config: config,
    quiz_answers: quizAnswers,
    last_character_edit: new Date().toISOString(),
    strength: attrs.strength,
    inner_force: attrs.innerForce,
    agility: attrs.agility,
    wisdom: attrs.wisdom,
    constitution: attrs.constitution,
    charisma: attrs.charisma,
  };

  // 只在用户选了时覆盖门派/性格
  if (faction) updateObj.faction = faction;
  if (personalityType) updateObj.personality_type = personalityType;
  if (config?.customCatchphrase) updateObj.catchphrase = config.customCatchphrase;

  await supabaseAdmin.from('heroes').update(updateObj).eq('id', heroId);

  return NextResponse.json({
    success: true,
    attrs,
    faction: faction || hero.faction,
    personalityType: personalityType || hero.personality_type,
  });
}
