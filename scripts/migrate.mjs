#!/usr/bin/env node
/**
 * 一键数据库迁移脚本
 * 用法: node scripts/migrate.mjs
 *
 * 自动从 .env.local 读取 Supabase 配置，尝试执行迁移 SQL。
 * 如果 API 不支持 DDL，会输出 SQL 供手动粘贴。
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env.local');

// 读取 .env.local
function loadEnv() {
  try {
    const content = readFileSync(envPath, 'utf-8');
    const env = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...rest] = trimmed.split('=');
      env[key.trim()] = rest.join('=').trim();
    }
    return env;
  } catch {
    console.error('❌ 无法读取 .env.local');
    process.exit(1);
  }
}

const env = loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ .env.local 中缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const MIGRATION_SQL = [
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS countdown_started_at TIMESTAMPTZ`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS audience_influence JSONB DEFAULT '{}'`,
  `ALTER TABLE heroes ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE games ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE game_heroes ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE game_events ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE game_state ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE season_leaderboard ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE bets ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE danmaku ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE game_queue ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE artifact_gifts ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS phase_started_at TIMESTAMPTZ`,
  // P2: 成就系统
  `CREATE TABLE IF NOT EXISTS hero_achievements (
    hero_id UUID REFERENCES heroes(id) ON DELETE CASCADE,
    achievement_id TEXT NOT NULL,
    unlocked_at TIMESTAMPTZ DEFAULT NOW(),
    game_id UUID REFERENCES games(id),
    PRIMARY KEY (hero_id, achievement_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_achievements_hero ON hero_achievements(hero_id)`,
  `ALTER TABLE heroes ADD COLUMN IF NOT EXISTS lifetime_stats JSONB DEFAULT '{}'`,
  // P4: 角色编辑器
  `ALTER TABLE heroes ADD COLUMN IF NOT EXISTS character_config JSONB DEFAULT NULL`,
  `ALTER TABLE heroes ADD COLUMN IF NOT EXISTS quiz_answers JSONB DEFAULT NULL`,
  `ALTER TABLE heroes ADD COLUMN IF NOT EXISTS last_character_edit TIMESTAMPTZ DEFAULT NULL`,
  // P2: 成就写入 game_state
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS new_achievements JSONB DEFAULT '[]'`,
  // 确保所有英雄都有初始余额（修复早期创建的英雄 balance 为 NULL 的问题）
  `UPDATE heroes SET balance = 10000 WHERE balance IS NULL`,
  // P5: 交互式回合选择
  `ALTER TABLE game_heroes ADD COLUMN IF NOT EXISTS pending_choices JSONB DEFAULT '[]'`,
  `ALTER TABLE game_heroes ADD COLUMN IF NOT EXISTS chosen_encounters JSONB DEFAULT '[]'`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS choosing_deadline TIMESTAMPTZ`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS hero_choice_status JSONB DEFAULT '{}'`,
  `ALTER TABLE game_state ADD COLUMN IF NOT EXISTS pending_influences JSONB DEFAULT '[]'`,
  `ALTER TABLE heroes ADD COLUMN IF NOT EXISTS influence_used BOOLEAN DEFAULT false`,
  // deduct_balance RPC 函数（押注/神兵扣款）
  `CREATE OR REPLACE FUNCTION deduct_balance(p_hero_id UUID, p_amount INT)
RETURNS INT AS $$
DECLARE
  v_new_balance INT;
BEGIN
  UPDATE heroes SET balance = balance - p_amount
  WHERE id = p_hero_id AND balance >= p_amount
  RETURNING balance INTO v_new_balance;
  IF NOT FOUND THEN
    RETURN -1;
  END IF;
  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql`,
];

async function tryExecSQL(sql) {
  // 方法1: pg-meta endpoint
  try {
    const res = await fetch(`${SUPABASE_URL}/pg-meta/default/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ query: sql }),
    });
    if (res.ok) return { ok: true, method: 'pg-meta' };
  } catch {}

  // 方法2: rpc exec_sql (if function exists)
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ query: sql }),
    });
    if (res.ok) return { ok: true, method: 'rpc' };
  } catch {}

  return { ok: false };
}

async function checkRLS() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/heroes?select=access_token&limit=1`, {
      headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
    });
    const data = await res.json();
    return Array.isArray(data) && data.length === 0;
  } catch {
    return false;
  }
}

async function checkColumn() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/game_state?select=audience_influence&id=eq.current`, {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` },
    });
    const data = await res.json();
    // If we get data without error, column exists
    return !data?.message?.includes('audience_influence');
  } catch {
    return false;
  }
}

async function checkFunction() {
  try {
    // 尝试调用 deduct_balance，用不存在的 UUID + 0 金额，不会产生副作用
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/deduct_balance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ p_hero_id: '00000000-0000-0000-0000-000000000000', p_amount: 0 }),
    });
    // 如果函数不存在，Supabase 返回 404
    return res.status !== 404;
  } catch {
    return false;
  }
}

async function main() {
  console.log('🏗️  AI 武林大会 · 数据库迁移');
  console.log('=' .repeat(50));

  // 先检查状态
  console.log('\n📋 检查当前状态...');
  const colExists = await checkColumn();
  const rlsEnabled = await checkRLS();
  const fnExists = await checkFunction();

  console.log(`  audience_influence 列: ${colExists ? '✅ 已存在' : '❌ 未创建'}`);
  console.log(`  RLS 保护:             ${rlsEnabled ? '✅ 已启用' : '❌ 未启用'}`);
  console.log(`  deduct_balance 函数:  ${fnExists ? '✅ 已存在' : '❌ 未创建'}`);

  if (colExists && rlsEnabled && fnExists) {
    console.log('\n✅ 迁移已完成，无需操作！');
    return;
  }

  // 尝试自动执行
  console.log('\n🚀 尝试自动执行迁移...');
  let autoSuccess = 0;
  let autoFail = 0;

  for (const sql of MIGRATION_SQL) {
    const result = await tryExecSQL(sql);
    const short = sql.length > 50 ? sql.slice(0, 50) + '...' : sql;
    if (result.ok) {
      console.log(`  ✅ ${short} (via ${result.method})`);
      autoSuccess++;
    } else {
      autoFail++;
    }
  }

  if (autoFail === 0) {
    console.log(`\n✅ 全部 ${autoSuccess} 条语句执行成功！`);
    // 再次验证
    const colNow = await checkColumn();
    const rlsNow = await checkRLS();
    console.log(`\n📋 验证:  列=${colNow ? '✅' : '❌'}  RLS=${rlsNow ? '✅' : '❌'}`);
    return;
  }

  // 自动执行失败，输出手动 SQL
  console.log(`\n⚠️  自动执行不可用（Supabase 免费版不开放 DDL API）`);
  console.log(`\n请将以下 SQL 粘贴到 Supabase Dashboard → SQL Editor 中执行：`);
  console.log(`\n${'─'.repeat(50)}`);
  console.log(MIGRATION_SQL.join(';\n') + ';');
  console.log(`${'─'.repeat(50)}`);

  // 提取 project ref
  const ref = SUPABASE_URL.match(/https:\/\/(.+)\.supabase\.co/)?.[1];
  if (ref) {
    console.log(`\n🔗 快速链接: https://supabase.com/dashboard/project/${ref}/sql/new`);
  }

  console.log('\n执行完毕后，再运行一次本脚本验证: node scripts/migrate.mjs');
}

main().catch(console.error);
