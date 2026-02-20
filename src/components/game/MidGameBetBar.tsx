'use client';

import { useState, useCallback } from 'react';
import { useWulinStore } from '@/stores/gameStore';
import { soundManager } from '@/lib/sound';
import { MID_GAME_BET_AMOUNTS, MID_GAME_BET_LIMITS } from '@/lib/game/constants';

export function MidGameBetBar() {
  const gameState = useWulinStore(s => s.gameState);
  const audienceBets = useWulinStore(s => s.audienceBets);
  const addAudienceBet = useWulinStore(s => s.addAudienceBet);
  const user = useWulinStore(s => s.user);
  const setUser = useWulinStore(s => s.setUser);

  const [expanded, setExpanded] = useState(false);
  const [selectedHero, setSelectedHero] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const status = gameState?.status || '';
  const heroes = gameState?.heroes || [];
  const pool = gameState?.bettingPool;
  const balance = user.hero?.balance;
  const isLoggedIn = user.isLoggedIn;

  // Only show during choosing_N and semifinals
  const isChoosingPhase = status.startsWith('choosing_');
  const isSemifinals = status === 'semifinals';
  if (!isChoosingPhase && !isSemifinals) return null;

  const maxAmount = MID_GAME_BET_LIMITS[status] || 0;
  const availableAmounts = MID_GAME_BET_AMOUNTS.filter(a => a <= maxAmount);

  const betHeroIds = new Set(audienceBets.map(b => b.heroId));
  const aliveHeroes = heroes.filter(h => !h.isEliminated);

  const handleBet = useCallback(async (amount: number) => {
    if (!selectedHero || sending) return;
    if (betHeroIds.has(selectedHero)) return;
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/audience/bet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ heroId: selectedHero, amount }),
      });
      const data = await res.json();
      if (res.ok && data.bet) {
        addAudienceBet({ heroId: data.bet.heroId, heroName: data.bet.heroName, amount: data.bet.amount });
        soundManager.play('coin');
        setSelectedHero(null);
        if (data.newBalance !== undefined && user.hero) {
          setUser({ ...user, hero: { ...user.hero, balance: data.newBalance } });
        }
      } else {
        setError(data.error || '押注失败');
      }
    } catch {
      setError('网络错误');
    }
    setSending(false);
  }, [selectedHero, sending, betHeroIds, addAudienceBet, user, setUser]);

  return (
    <div className="mt-3 border border-ink-light/20 rounded-lg overflow-hidden bg-ink-dark/40">
      {/* Collapsed header — always visible */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-ink-light/5 transition-colors"
      >
        <span className="text-gold font-display tracking-wider">
          中场加注
        </span>
        <span className="flex items-center gap-2">
          {pool && pool.totalPool > 0 && (
            <span className="text-[--text-dim] font-mono tabular-nums">{pool.totalPool}银两</span>
          )}
          <span className="text-[10px] text-[--text-dim]">上限{maxAmount}</span>
          <span className="text-[--text-dim]">{expanded ? '▴' : '▾'}</span>
        </span>
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2 animate-fade-in-up">
          {/* Balance display for logged-in users */}
          {isLoggedIn && balance !== undefined && (
            <div className="text-[10px] text-[--text-dim] text-right">
              余额 <span className="text-gold font-mono tabular-nums">{balance.toLocaleString()}</span>
            </div>
          )}

          {/* Existing bets summary */}
          {audienceBets.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {audienceBets.map((b, i) => (
                <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-gold/10 text-gold border border-gold/15">
                  {b.heroName} {b.amount}银
                </span>
              ))}
            </div>
          )}

          {/* Hero grid with odds */}
          <div className="grid grid-cols-3 gap-1.5 max-h-32 overflow-y-auto">
            {aliveHeroes.map(hero => {
              const heroPool = pool?.heroPools?.[hero.heroId];
              const odds = heroPool && heroPool.amount > 0 && pool && pool.totalPool > 0
                ? (pool.totalPool / heroPool.amount).toFixed(1)
                : null;
              const isSelected = selectedHero === hero.heroId;
              const alreadyBet = betHeroIds.has(hero.heroId);
              return (
                <button
                  key={hero.heroId}
                  onClick={() => !alreadyBet && setSelectedHero(isSelected ? null : hero.heroId)}
                  disabled={alreadyBet}
                  className={`text-left p-1.5 rounded border transition-all text-[10px] leading-tight
                    ${alreadyBet
                      ? 'border-gold/20 bg-gold/[0.03] opacity-50'
                      : isSelected
                        ? 'border-gold/60 bg-gold/10 shadow-gold-glow'
                        : 'border-ink-light/15 hover:border-gold/25'}`}
                >
                  <div className="font-bold truncate">{hero.heroName}</div>
                  <div className="text-[--text-dim]">
                    {alreadyBet
                      ? '已押'
                      : odds
                        ? <span className={`font-mono ${parseFloat(odds) > 5 ? 'text-gold' : ''}`}>{odds}x</span>
                        : '—'}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Amount buttons */}
          {selectedHero && !betHeroIds.has(selectedHero) && (
            <div className="flex items-center justify-center gap-2">
              {availableAmounts.map(amt => (
                <button
                  key={amt}
                  onClick={() => handleBet(amt)}
                  disabled={sending || (isLoggedIn && balance !== undefined && balance < amt)}
                  className="btn-gold text-[11px] px-3 py-1 disabled:opacity-40"
                >
                  {amt}
                </button>
              ))}
            </div>
          )}

          {error && <div className="text-center text-[10px] text-vermillion">{error}</div>}
        </div>
      )}
    </div>
  );
}
