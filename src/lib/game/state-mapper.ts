import { GameState } from '@/lib/types';
import { COUNTDOWN_SECONDS } from '@/lib/game/constants';

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
    newAchievements: data.new_achievements || [],
    // 交互式回合选择
    pendingChoices: [],  // 按玩家填充，在 state API route 中注入
    choosingDeadline: data.choosing_deadline || null,
    heroChoiceStatus: data.hero_choice_status || {},
    pendingInfluences: data.pending_influences || [],
    queueCount: data.queue_count || 0,
    // 服务器权威时间（由 state route 填充）
    serverTime: '',
    phaseElapsedMs: null,
    updatedAt: data.updated_at,
  };
}

/**
 * 计算动态字段（服务器权威时间、倒计时等）
 * 共用于轮询端点和 SSE 端点
 */
export function computeDynamicFields(gameState: GameState, rawData: any): GameState {
  const now = Date.now();

  gameState.serverTime = new Date(now).toISOString();

  if (rawData.phase_started_at) {
    gameState.phaseElapsedMs = now - new Date(rawData.phase_started_at).getTime();
  }

  if (rawData.status === 'countdown') {
    const startedAt = rawData.countdown_started_at || rawData.phase_started_at || rawData.updated_at;
    if (startedAt) {
      const elapsed = (now - new Date(startedAt).getTime()) / 1000;
      gameState.countdownSeconds = Math.max(0, Math.ceil(COUNTDOWN_SECONDS - elapsed));
    }
    gameState.updatedAt = new Date(now).toISOString();
  }

  return gameState;
}
