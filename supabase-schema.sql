-- ============================================================
-- AI 武林大会 · 数据库 Schema
-- 在 Supabase SQL Editor 中运行
-- ============================================================

-- 英雄表
CREATE TABLE IF NOT EXISTS heroes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT UNIQUE,
  is_npc BOOLEAN DEFAULT FALSE,
  npc_template_id TEXT,
  access_token TEXT,
  refresh_token TEXT,

  hero_name TEXT NOT NULL,
  title TEXT DEFAULT '无名侠客',
  faction TEXT DEFAULT '少林',
  personality_type TEXT DEFAULT 'random',
  catchphrase TEXT DEFAULT '……',
  avatar_url TEXT,

  strength INT DEFAULT 10,
  inner_force INT DEFAULT 10,
  agility INT DEFAULT 10,
  wisdom INT DEFAULT 10,
  constitution INT DEFAULT 10,
  charisma INT DEFAULT 10,

  personality_traits JSONB DEFAULT '{}',
  secondme_shades JSONB DEFAULT '[]',

  season_points INT DEFAULT 0,
  total_wins INT DEFAULT 0,
  total_games INT DEFAULT 0,
  titles_won JSONB DEFAULT '[]',
  balance INT DEFAULT 10000,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 对局表
CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_number INT DEFAULT 1,
  status TEXT DEFAULT 'waiting',
  current_round INT DEFAULT 0,
  theme TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  champion_hero_id UUID REFERENCES heroes(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 对局英雄状态表
CREATE TABLE IF NOT EXISTS game_heroes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  hero_id UUID REFERENCES heroes(id) ON DELETE CASCADE,
  seat_number INT,

  hp INT DEFAULT 100,
  reputation INT DEFAULT 0,
  hot INT DEFAULT 0,
  morality INT DEFAULT 50,
  credit INT DEFAULT 50,

  martial_arts JSONB DEFAULT '[]',
  ally_hero_id UUID,
  has_death_pact BOOLEAN DEFAULT FALSE,
  has_ultimate BOOLEAN DEFAULT FALSE,

  final_rank INT,
  title TEXT,
  is_eliminated BOOLEAN DEFAULT FALSE,
  elimination_round INT,

  game_trait JSONB,

  UNIQUE(game_id, hero_id),
  UNIQUE(game_id, seat_number)
);

-- 事件表
CREATE TABLE IF NOT EXISTS game_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  round INT NOT NULL,
  sequence INT DEFAULT 0,

  event_type TEXT NOT NULL,
  priority INT DEFAULT 1,
  hero_id UUID,
  target_hero_id UUID,

  action TEXT,
  data JSONB DEFAULT '{}',
  narrative TEXT,
  taunt TEXT,
  inner_thought TEXT,

  reputation_delta INT DEFAULT 0,
  hot_delta INT DEFAULT 0,
  hp_delta INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 世界快照缓存表
CREATE TABLE IF NOT EXISTS game_state (
  id TEXT PRIMARY KEY DEFAULT 'current',
  game_id UUID,
  game_number INT DEFAULT 0,
  status TEXT,
  current_round INT DEFAULT 0,
  phase TEXT DEFAULT 'waiting',
  theme TEXT,
  heroes JSONB DEFAULT '[]',
  recent_events JSONB DEFAULT '[]',
  reputation_ranking JSONB DEFAULT '[]',
  hot_ranking JSONB DEFAULT '[]',
  next_round_preview TEXT,
  countdown_seconds INT,
  champion_name TEXT,
  season_leaderboard JSONB DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 赛季排行榜
CREATE TABLE IF NOT EXISTS season_leaderboard (
  hero_id UUID PRIMARY KEY REFERENCES heroes(id),
  hero_name TEXT,
  faction TEXT,
  season_points INT DEFAULT 0,
  champion_count INT DEFAULT 0,
  top4_count INT DEFAULT 0,
  total_games INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_game_events_game_round ON game_events(game_id, round);
CREATE INDEX IF NOT EXISTS idx_game_heroes_game ON game_heroes(game_id);
CREATE INDEX IF NOT EXISTS idx_heroes_user ON heroes(user_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);

-- === P2: 押注表 ===
CREATE TABLE IF NOT EXISTS bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  audience_id TEXT NOT NULL,
  hero_id UUID NOT NULL,
  amount INT NOT NULL DEFAULT 0,
  odds_at_bet NUMERIC(5,2),
  payout INT DEFAULT 0,
  settled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bets_hero_unique ON bets(game_id, audience_id, hero_id);

-- === P2: 弹幕表 ===
CREATE TABLE IF NOT EXISTS danmaku (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  audience_id TEXT NOT NULL,
  original_text TEXT NOT NULL,
  wuxia_text TEXT NOT NULL,
  color TEXT DEFAULT 'white',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_danmaku_game ON danmaku(game_id, created_at DESC);

-- === P2: game_state 新字段 ===
ALTER TABLE game_state ADD COLUMN IF NOT EXISTS betting_pool JSONB DEFAULT '{}';
ALTER TABLE game_state ADD COLUMN IF NOT EXISTS danmaku JSONB DEFAULT '[]';

-- === 上局回顾（等待界面展示） ===
ALTER TABLE game_state ADD COLUMN IF NOT EXISTS last_game_top8 JSONB DEFAULT '[]';
ALTER TABLE game_state ADD COLUMN IF NOT EXISTS last_game_highlights JSONB DEFAULT '[]';

-- === 结算展示（押注赢家 + 富豪榜）===
ALTER TABLE game_state ADD COLUMN IF NOT EXISTS bet_winners JSONB DEFAULT '[]';
ALTER TABLE game_state ADD COLUMN IF NOT EXISTS balance_ranking JSONB DEFAULT '[]';

-- === 银两余额 ===
ALTER TABLE heroes ADD COLUMN IF NOT EXISTS balance INT DEFAULT 10000;

-- === 押注改为每人每英雄一注（支持多选下注）===
DROP INDEX IF EXISTS idx_bets_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bets_hero_unique ON bets(game_id, audience_id, hero_id);

-- === 候补队列 ===
CREATE TABLE IF NOT EXISTS game_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hero_id UUID NOT NULL REFERENCES heroes(id),
  queued_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(hero_id)
);

ALTER TABLE game_state ADD COLUMN IF NOT EXISTS queue_count INT DEFAULT 0;

-- === 活动日志（统计用）===
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hero_id UUID REFERENCES heroes(id),
  hero_name TEXT,
  event_type TEXT NOT NULL,     -- 'login' | 'join' | 'play'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_log_time ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_type ON activity_log(event_type, created_at);

-- === 原子扣款函数（防止并发双花）===
CREATE OR REPLACE FUNCTION deduct_balance(p_hero_id UUID, p_amount INT)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_balance INT;
BEGIN
  UPDATE heroes
  SET balance = balance - p_amount
  WHERE id = p_hero_id AND balance >= p_amount
  RETURNING balance INTO v_new_balance;

  IF NOT FOUND THEN
    RETURN -1;  -- 余额不足
  END IF;

  RETURN v_new_balance;
END;
$$;

-- === 神兵助战：神器赠送表 ===
CREATE TABLE IF NOT EXISTS artifact_gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  audience_id TEXT NOT NULL,
  hero_id UUID NOT NULL,
  artifact_id TEXT NOT NULL,
  amount INT NOT NULL DEFAULT 0,
  payout INT DEFAULT 0,
  settled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_artifact_gifts_unique ON artifact_gifts(game_id, audience_id);
CREATE INDEX IF NOT EXISTS idx_artifact_gifts_game_hero ON artifact_gifts(game_id, hero_id);

-- === 神兵助战：game_state 新增 artifact_pool 列 ===
ALTER TABLE game_state ADD COLUMN IF NOT EXISTS artifact_pool JSONB DEFAULT '{}';

-- === 弹幕天意：观众影响力 ===
ALTER TABLE game_state ADD COLUMN IF NOT EXISTS audience_influence JSONB DEFAULT '{}';

-- === RLS：封堵 anon key 直连漏洞 ===
-- 所有表启用 RLS，不加 Policy。supabaseAdmin（service role）自动绕过 RLS。
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

-- === 封神榜：英雄背景故事 ===
ALTER TABLE heroes ADD COLUMN IF NOT EXISTS backstory TEXT;

-- === 服务器权威倒计时 ===
ALTER TABLE game_state ADD COLUMN IF NOT EXISTS countdown_started_at TIMESTAMPTZ;

-- === 服务器权威阶段时间戳（多设备同步）===
ALTER TABLE game_state ADD COLUMN IF NOT EXISTS phase_started_at TIMESTAMPTZ;

-- 初始化 game_state
INSERT INTO game_state (id, status, phase) VALUES ('current', 'waiting', 'waiting')
ON CONFLICT (id) DO NOTHING;
