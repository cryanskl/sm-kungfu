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

async function main() {
  console.log('🏗️  AI 武林大会 · 数据库迁移');
  console.log('=' .repeat(50));

  // 先检查状态
  console.log('\n📋 检查当前状态...');
  const colExists = await checkColumn();
  const rlsEnabled = await checkRLS();

  console.log(`  audience_influence 列: ${colExists ? '✅ 已存在' : '❌ 未创建'}`);
  console.log(`  RLS 保护:             ${rlsEnabled ? '✅ 已启用' : '❌ 未启用'}`);

  if (colExists && rlsEnabled) {
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
