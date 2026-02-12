import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/admin/stats?days=7
 * 返回最近 N 天的登录/参赛统计（按天、按小时分布）
 */
export async function GET(request: NextRequest) {
  const days = Math.min(Number(request.nextUrl.searchParams.get('days')) || 7, 90);
  const since = new Date();
  since.setDate(since.getDate() - days);

  // 查询 activity_log
  const { data: logs } = await supabaseAdmin
    .from('activity_log')
    .select('hero_id, hero_name, event_type, created_at')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true });

  if (!logs || logs.length === 0) {
    return NextResponse.json({ days, totalEvents: 0, daily: [], hourly: [], users: [] });
  }

  // 按天聚合
  const dailyMap = new Map<string, { logins: Set<string>; joins: Set<string> }>();
  // 按小时聚合（0-23）
  const hourlyMap = new Map<number, { logins: number; joins: number }>();
  // 用户列表
  const userMap = new Map<string, { heroName: string; loginCount: number; joinCount: number; lastSeen: string }>();

  for (const log of logs) {
    const date = log.created_at.slice(0, 10); // YYYY-MM-DD
    const hour = new Date(log.created_at).getHours();
    const heroId = log.hero_id || 'unknown';

    // 每日统计（去重计独立用户数）
    if (!dailyMap.has(date)) dailyMap.set(date, { logins: new Set(), joins: new Set() });
    const day = dailyMap.get(date)!;
    if (log.event_type === 'login') day.logins.add(heroId);
    if (log.event_type === 'join') day.joins.add(heroId);

    // 每小时统计（累计次数）
    if (!hourlyMap.has(hour)) hourlyMap.set(hour, { logins: 0, joins: 0 });
    const h = hourlyMap.get(hour)!;
    if (log.event_type === 'login') h.logins++;
    if (log.event_type === 'join') h.joins++;

    // 用户统计
    if (!userMap.has(heroId)) {
      userMap.set(heroId, { heroName: log.hero_name || heroId.slice(0, 8), loginCount: 0, joinCount: 0, lastSeen: log.created_at });
    }
    const u = userMap.get(heroId)!;
    if (log.event_type === 'login') u.loginCount++;
    if (log.event_type === 'join') u.joinCount++;
    u.lastSeen = log.created_at;
  }

  // 格式化输出
  const daily = Array.from(dailyMap.entries())
    .map(([date, d]) => ({ date, uniqueLogins: d.logins.size, uniqueJoins: d.joins.size }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const hourly = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    label: `${String(h).padStart(2, '0')}:00`,
    logins: hourlyMap.get(h)?.logins || 0,
    joins: hourlyMap.get(h)?.joins || 0,
  }));

  const users = Array.from(userMap.entries())
    .map(([id, u]) => ({ heroId: id, ...u }))
    .sort((a, b) => b.loginCount + b.joinCount - a.loginCount - a.joinCount);

  return NextResponse.json({
    days,
    totalEvents: logs.length,
    totalUniqueUsers: new Set(logs.map(l => l.hero_id)).size,
    daily,
    hourly,
    users,
  });
}
