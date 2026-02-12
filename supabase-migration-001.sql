-- ============================================================
-- 迁移：修复并发安全问题
-- 在 Supabase SQL Editor 中运行
-- ============================================================

-- 1. 座位唯一约束（防并发入座冲突）
ALTER TABLE game_heroes
  ADD CONSTRAINT game_heroes_game_seat_unique UNIQUE (game_id, seat_number);

-- 2. 如果存在重复座位数据，先清理再加约束
-- 可以先运行这个检查：
-- SELECT game_id, seat_number, COUNT(*) FROM game_heroes GROUP BY game_id, seat_number HAVING COUNT(*) > 1;
-- 如果有重复，先手动删除多余行再运行上面的 ALTER TABLE
