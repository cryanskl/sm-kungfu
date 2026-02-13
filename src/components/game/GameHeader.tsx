'use client';

import { useRef, useEffect, useState } from 'react';
import { GameState } from '@/lib/types';
import { MuteToggle } from '@/components/game/MuteToggle';
import { HeroLeaderboard } from '@/components/game/HeroLeaderboard';
import { RichLeaderboard } from '@/components/game/RichLeaderboard';
import { getSeasonTitle } from '@/lib/utils';
import { DIRECTOR_EVENTS } from '@/lib/game/prompts';

interface GameHeaderProps {
  user: {
    userId: string | null;
    heroId: string | null;
    hero: any | null;
    isLoggedIn: boolean;
  };
  gameState: GameState | null;
  status: string;
  isGameActive: boolean;
  isParticipant: boolean;
  isProcessing: boolean;
  roundTimer: number | null;
  endingTimer: number | null;
  isQueued: boolean;
  isLeaving: boolean;
  onJoin: () => void;
  onLeave: () => void;
  onSetQueued: (v: boolean) => void;
}

export function GameHeader({
  user, gameState, status, isGameActive, isParticipant,
  isProcessing, roundTimer, endingTimer, isQueued, isLeaving,
  onJoin, onLeave, onSetQueued,
}: GameHeaderProps) {
  const profileRef = useRef<HTMLDivElement>(null);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setShowProfileDropdown(false);
    }
    if (showProfileDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showProfileDropdown]);

  return (
    <header className="header-wuxia sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Left: Logo */}
        <div className="flex items-center gap-3">
          <h1 className="font-display text-xl font-bold text-gold tracking-wider">
            ⚔️ AI 武林大会
          </h1>
          {gameState?.theme && (
            <span className="text-xs px-2 py-0.5 rounded-md bg-gold/8 text-gold/80 border border-gold/15 hidden xs:inline">
              「{gameState.theme}」
            </span>
          )}
          <HeroLeaderboard />
          <RichLeaderboard />
        </div>

        {/* Center: Round info */}
        {isGameActive && status !== 'intro' && (() => {
          const round = gameState?.currentRound || 0;
          const directorInfo = DIRECTOR_EVENTS[round];
          const isFinals = status === 'semifinals' || status === 'final';
          const isEnding = status === 'ending';
          const roundTitle = isEnding ? '加冕典礼'
            : isFinals ? '盟主加冕战'
            : directorInfo ? `第${round}回合 · ${directorInfo.title}` : null;

          return roundTitle ? (
            <div className="hidden sm:flex items-center gap-2.5 text-sm">
              <span className="text-gold font-display font-bold whitespace-nowrap">
                {isFinals || isEnding ? '🏆' : '📜'} {roundTitle}
              </span>
              {isEnding && endingTimer !== null && endingTimer > 0 && (
                <span className="phase-badge phase-countdown">{endingTimer}s</span>
              )}
              {gameState?.nextRoundPreview && !isFinals && !isEnding && (
                <span className="text-xs text-[--text-dim] truncate hidden lg:inline">
                  ⏭️ {gameState.nextRoundPreview}
                </span>
              )}
              {isProcessing && (
                <span className="phase-badge phase-processing animate-pulse">结算中…</span>
              )}
              {roundTimer !== null && !isProcessing && (
                <span className="phase-badge phase-countdown font-mono tabular-nums">{roundTimer}s</span>
              )}
            </div>
          ) : null;
        })()}

        {/* Right: Actions */}
        <div className="flex items-center gap-3 text-sm">
          <MuteToggle />
          {user.isLoggedIn ? (
            <div className="flex items-center gap-2.5">
              {/* 等候/退出 toggle */}
              {isParticipant ? (
                (status === 'waiting' || status === 'countdown') && (
                  <button
                    onClick={onLeave}
                    disabled={isLeaving}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold border border-vermillion/30 text-vermillion hover:bg-vermillion/8 transition disabled:opacity-40"
                  >
                    {isLeaving ? '退出中…' : '🚪 退出'}
                  </button>
                )
              ) : (
                <button
                  onClick={() => { if (!isQueued) { onJoin(); onSetQueued(true); } }}
                  disabled={isQueued}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                    isQueued
                      ? 'border-jade/30 text-jade opacity-70 cursor-default'
                      : 'border-gold/30 text-gold hover:bg-gold/8'
                  }`}
                >
                  {isQueued ? '✅ 已候场' : '🎯 等候'}
                </button>
              )}
              <div className="flex items-center gap-2.5 relative" ref={profileRef}>
                {(() => {
                  const t = getSeasonTitle(user.hero?.seasonPoints ?? 0);
                  return <span className="text-gold text-xs font-display hidden xs:inline">{t.icon} {t.name}</span>;
                })()}
                <span className="text-ink-faint hidden xs:inline">|</span>
                <button
                  onClick={() => setShowProfileDropdown(v => !v)}
                  className="flex items-center gap-1 hover:text-gold transition"
                >
                  <span className="text-sm truncate max-w-[80px] xs:max-w-none">{user.hero?.heroName || user.hero?.hero_name}</span>
                  <span className="text-[10px] text-[--text-dim]">▼</span>
                </button>
                {showProfileDropdown && (
                  <div className="absolute right-0 top-full mt-2 w-56 bg-ink-dark border border-gold/15 rounded-xl shadow-ink overflow-hidden z-[60] animate-fade-in-down">
                    <div className="p-4 border-b border-gold/10">
                      {(() => {
                        const t = getSeasonTitle(user.hero?.seasonPoints ?? 0);
                        return (
                          <>
                            <div className="text-2xl font-display font-bold text-gold">{t.icon} {t.name}</div>
                            <div className="text-xs text-[--text-dim] mt-1 font-mono tabular-nums">
                              💰 {(user.hero?.balance ?? 0).toLocaleString()} 银两
                            </div>
                          </>
                        );
                      })()}
                    </div>
                    <div className="p-4 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-[--text-dim]">总场次</span>
                        <span className="tabular-nums">{user.hero?.totalGames ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[--text-dim]">胜场 (前三)</span>
                        <span className="text-gold tabular-nums">{user.hero?.totalWins ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[--text-dim]">赛季积分</span>
                        <span className="text-gold tabular-nums">{user.hero?.seasonPoints ?? 0}</span>
                      </div>
                    </div>
                    <div className="border-t border-gold/10">
                      <a href="/api/auth/logout"
                        className="block w-full text-center py-3 text-sm text-vermillion hover:bg-vermillion/8 transition">
                        退出登录
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <a href="/api/auth/login" className="btn-gold text-sm px-5 py-1.5">
              用 SecondMe 登录
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
