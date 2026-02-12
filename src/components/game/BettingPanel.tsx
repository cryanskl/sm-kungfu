'use client';

import { useState, useCallback } from 'react';
import { useWulinStore } from '@/stores/gameStore';
import { soundManager } from '@/lib/sound';
import { BET_AMOUNTS } from '@/lib/game/constants';

export function BettingPanel() {
  const gameState = useWulinStore(s => s.gameState);
  const audienceBets = useWulinStore(s => s.audienceBets);
  const addAudienceBet = useWulinStore(s => s.addAudienceBet);
  const user = useWulinStore(s => s.user);
  const setUser = useWulinStore(s => s.setUser);

  const [selectedHero, setSelectedHero] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const heroes = gameState?.heroes || [];
  const pool = gameState?.bettingPool;
  const balance = user.hero?.balance;
  const isLoggedIn = user.isLoggedIn;

  const betHeroIds = new Set(audienceBets.map(b => b.heroId));

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
    <div className="card-wuxia p-5 rounded-xl animate-fade-in-up">
      <h3 className="text-sm font-display font-bold text-gold mb-2 text-center tracking-wider">
        💰 押注 — 选侠客下注（可多选）
      </h3>

      <div className="divider-ornate text-[10px] text-[--text-dim]">
        赔率随下注变化 · 冠军全额派奖
        {isLoggedIn && balance !== undefined && (
          <span className="ml-2">余额 <span className="text-gold font-mono tabular-nums">{balance.toLocaleString()}</span></span>
        )}
      </div>

      {/* Existing bets */}
      {audienceBets.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center mb-4">
          {audienceBets.map((b, i) => (
            <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-gold/10 text-gold border border-gold/15">
              {b.heroName} · {b.amount}银两
            </span>
          ))}
        </div>
      )}

      {/* Hero selection grid */}
      <div className="grid grid-cols-3 md:grid-cols-4 gap-2 mb-4 max-h-48 overflow-y-auto">
        {heroes.map(hero => {
          const heroPool = pool?.heroPools?.[hero.heroId];
          const odds = heroPool && heroPool.amount > 0 && pool && pool.totalPool > 0
            ? (pool.totalPool / heroPool.amount).toFixed(1)
            : null;
          const isSelected = selectedHero === hero.heroId;
          const alreadyBet = betHeroIds.has(hero.heroId);
          const myBet = audienceBets.find(b => b.heroId === hero.heroId);
          return (
            <button
              key={hero.heroId}
              onClick={() => !alreadyBet && setSelectedHero(hero.heroId)}
              disabled={alreadyBet}
              className={`text-left p-2.5 rounded-lg border transition-all duration-200 text-xs
                ${alreadyBet
                  ? 'border-gold/20 bg-gold/[0.03] opacity-60'
                  : isSelected
                    ? 'border-gold/60 bg-gold/10 shadow-gold-glow ring-1 ring-gold/30 scale-[1.03]'
                    : 'border-ink-light/20 hover:border-gold/25 hover:bg-ink-dark/50'}`}
            >
              <div className="font-bold truncate">{hero.heroName}</div>
              <div className="text-[--text-dim] mt-0.5">
                {alreadyBet
                  ? `✓ 已押 ${myBet?.amount}`
                  : heroPool
                    ? <>
                        <span>{heroPool.betCount}注</span>
                        {odds && <span className={`ml-1 font-mono ${
                          parseFloat(odds) > 5 ? 'text-gold' : parseFloat(odds) > 2 ? 'text-[--text-primary]' : 'text-[--text-dim]'
                        }`}>{odds}x</span>}
                      </>
                    : '暂无人押'}
              </div>
            </button>
          );
        })}
      </div>

      {/* Amount buttons + payout preview */}
      {selectedHero && !betHeroIds.has(selectedHero) && (
        <div className="text-center">
          <div className="text-[10px] text-[--text-dim] mb-2">
            选择押注金额 · 🏆x2 / 🥈x1 / 🥉x0.5
          </div>
          <div className="flex justify-center gap-2">
            {BET_AMOUNTS.map(amt => (
              <button
                key={amt}
                onClick={() => handleBet(amt)}
                disabled={sending || (isLoggedIn && balance !== undefined && balance < amt)}
                className="btn-gold text-sm px-5 py-1.5 disabled:opacity-40"
              >
                {amt}
              </button>
            ))}
          </div>
        </div>
      )}

      {pool && pool.totalPool > 0 && (
        <div className="text-center text-xs text-[--text-dim] mt-3 font-mono tabular-nums">
          总押注池：{pool.totalPool} 银两
        </div>
      )}
      {error && <div className="text-center text-xs text-vermillion mt-2">{error}</div>}
    </div>
  );
}
