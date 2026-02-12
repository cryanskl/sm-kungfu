/** Returns a season title and icon based on accumulated points */
export function getSeasonTitle(points: number): { icon: string; name: string } {
  if (points >= 1000) return { icon: '🐉', name: '武林至尊' };
  if (points >= 500) return { icon: '🏆', name: '一代宗师' };
  if (points >= 300) return { icon: '⚔️', name: '绝世高手' };
  if (points >= 150) return { icon: '🗡️', name: '江湖名侠' };
  if (points >= 50) return { icon: '🥋', name: '武林新秀' };
  return { icon: '🌱', name: '初入江湖' };
}
