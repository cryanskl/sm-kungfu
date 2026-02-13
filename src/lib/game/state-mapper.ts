import { GameState } from '@/lib/types';

/**
 * Maps a raw `game_state` DB row (snake_case) to a camelCase GameState object.
 */
export function mapGameStateRow(data: any): GameState {
  return {
    gameId: data.game_id,
    gameNumber: data.game_number || 0,
    status: data.status || 'waiting',
    currentRound: data.current_round || 0,
    phase: data.phase || 'waiting',
    theme: data.theme,
    heroes: data.heroes || [],
    recentEvents: data.recent_events || [],
    reputationRanking: data.reputation_ranking || [],
    hotRanking: data.hot_ranking || [],
    nextRoundPreview: data.next_round_preview,
    countdownSeconds: data.countdown_seconds,
    championName: data.champion_name,
    seasonLeaderboard: data.season_leaderboard || [],
    bettingPool: data.betting_pool || null,
    danmaku: data.danmaku || [],
    lastGameTop8: data.last_game_top8 || [],
    lastGameHighlights: data.last_game_highlights || [],
    betWinners: data.bet_winners || [],
    balanceRanking: data.balance_ranking || [],
    battleStats: data.battle_stats || undefined,
    artifactPool: data.artifact_pool || null,
    audienceInfluence: data.audience_influence || null,
    queueCount: data.queue_count || 0,
    updatedAt: data.updated_at,
  };
}
