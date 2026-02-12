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

  // 已押注的英雄集合
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
        // 更新本地余额
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
    <div className="card-wuxia p-4 rounded-xl animate-fade-in-up">
      <h3 className="text-sm font-bold text-[--accent-gold] mb-2 text-center">
        💰 押注 — 选侠客下注（可多选）
      </h3>
      <div className="text-center text-xs text-[--text-secondary] mb-3">
        🏆 冠军 2倍 · 🥈 亚军 1倍 · 🥉 季军 0.5倍
        {isLoggedIn && balance !== undefined && (
          <span className="ml-2">
            | 余额 <span className="text-[--accent-gold] font-mono">{balance.toLocaleString()}</span> 银两
          </span>
        )}
      </div>

      {/* 已押注汇总 */}
      {audienceBets.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center mb-3">
          {audienceBets.map((b, i) => (
            <span key={i} className="text-xs px-2 py-1 rounded-full bg-[--accent-gold]/15 text-[--accent-gold]">
              {b.heroName} · {b.amount}银两
            </span>
          ))}
        </div>
      )}

      {/* 英雄选择 */}
      <div className="grid grid-cols-3 md:grid-cols-4 gap-2 mb-4 max-h-48 overflow-y-auto">
        {heroes.map(hero => {
          const heroPool = pool?.heroPools?.[hero.heroId];
          const isSelected = selectedHero === hero.heroId;
          const alreadyBet = betHeroIds.has(hero.heroId);
          const myBet = audienceBets.find(b => b.heroId === hero.heroId);
          return (
            <button
              key={hero.heroId}
              onClick={() => !alreadyBet && setSelectedHero(hero.heroId)}
              disabled={alreadyBet}
              className={`text-left p-2 rounded-lg border transition text-xs
                ${alreadyBet
                  ? 'border-[--accent-gold]/30 bg-[--accent-gold]/5 opacity-70'
                  : isSelected
                    ? 'border-[--accent-gold] bg-[--accent-gold]/10'
                    : 'border-[--accent-gold]/10 hover:border-[--accent-gold]/30'}`}
            >
              <div className="font-bold truncate">{hero.heroName}</div>
              <div className="text-[--text-secondary]">
                {alreadyBet
                  ? `✓ 已押 ${myBet?.amount}`
                  : heroPool ? `${heroPool.betCount}注` : '暂无人押'}
              </div>
            </button>
          );
        })}
      </div>

      {/* 金额按钮 */}
      {selectedHero && !betHeroIds.has(selectedHero) && (
        <div className="flex justify-center gap-2">
          {BET_AMOUNTS.map(amt => (
            <button
              key={amt}
              onClick={() => handleBet(amt)}
              disabled={sending || (isLoggedIn && balance !== undefined && balance < amt)}
              className="btn-gold text-sm px-4 py-1.5 disabled:opacity-50"
            >
              {amt}
            </button>
          ))}
        </div>
      )}

      {pool && pool.totalPool > 0 && (
        <div className="text-center text-xs text-[--text-secondary] mt-2">
          总押注池：{pool.totalPool} 银两
        </div>
      )}
      {error && <div className="text-center text-xs text-[--accent-red] mt-1">{error}</div>}
    </div>
  );
}
