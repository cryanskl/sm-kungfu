import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

const MIGRATION_SQL = `
-- 服务器权威倒计时
ALTER TABLE game_state ADD COLUMN IF NOT EXISTS countdown_started_at TIMESTAMPTZ;

-- 弹幕天意：观众影响力列
ALTER TABLE game_state ADD COLUMN IF NOT EXISTS audience_influence JSONB DEFAULT '{}';

-- RLS：封堵 anon key 直连漏洞
ALTER TABLE heroes ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_heroes ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE danmaku ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifact_gifts ENABLE ROW LEVEL SECURITY;
`.trim();

// 拆成单条语句逐条执行
const STATEMENTS = MIGRATION_SQL
  .split(';')
  .map(s => s.replace(/--.*$/gm, '').trim())
  .filter(s => s.length > 0);

export async function POST(request: NextRequest) {
  const authError = await requireSession();
  if (authError) return authError;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const results: { sql: string; ok: boolean; error?: string }[] = [];

  // 尝试通过 pg-meta REST API 执行 SQL
  for (const sql of STATEMENTS) {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ query: sql }),
      });

      if (res.ok) {
        results.push({ sql: sql.slice(0, 60) + '...', ok: true });
        continue;
      }
    } catch { /* rpc not available, try next method */ }

    // 方法2: 尝试 pg-meta 端点
    try {
      const res = await fetch(`${supabaseUrl}/pg-meta/default/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ query: sql }),
      });

      if (res.ok) {
        results.push({ sql: sql.slice(0, 60) + '...', ok: true });
        continue;
      }
    } catch { /* pg-meta not available */ }

    results.push({ sql: sql.slice(0, 60) + '...', ok: false, error: 'API不可用，需手动执行' });
  }

  // 验证：检查 audience_influence 列是否存在
  const { error: colCheck } = await supabaseAdmin
    .from('game_state')
    .select('audience_influence')
    .eq('id', 'current')
    .single();

  const columnExists = !colCheck || !colCheck.message?.includes('audience_influence');

  // 验证：用 anon key 检查 RLS
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  let rlsWorking = false;
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/heroes?select=access_token&limit=1`, {
      headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
    });
    const data = await res.json();
    rlsWorking = Array.isArray(data) && data.length === 0;
  } catch {
    rlsWorking = false;
  }

  const allAuto = results.every(r => r.ok);

  return NextResponse.json({
    status: allAuto ? 'migrated' : 'manual_needed',
    results,
    checks: {
      audienceInfluenceColumn: columnExists,
      rlsEnabled: rlsWorking,
    },
    ...(allAuto ? {} : {
      manualSQL: MIGRATION_SQL,
      instruction: '请将上面的 SQL 粘贴到 Supabase Dashboard → SQL Editor 中执行',
    }),
  });
}
