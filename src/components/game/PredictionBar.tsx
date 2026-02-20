'use client';

import { useState } from 'react';
import { useWulinStore } from '@/stores/gameStore';

export default function PredictionBar() {
  const gameState = useWulinStore(s => s.gameState);
  const myHeroId = useWulinStore(s => s.user.heroId);
  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!gameState) return null;

  // Show only during choosing phases
  const isChoosing = /^choosing_\d$/.test(gameState.status);
  if (!isChoosing) return null;

  const heroes = gameState.heroes;
  const alive = heroes.filter(h => !h.isEliminated);
  const myHero = heroes.find(h => h.heroId === myHeroId);
  const isMyHeroDead = myHero?.isEliminated ?? true;

  // Prediction mode: dead hero predicts champion, alive hero predicts elimination
  const mode = isMyHeroDead ? 'champion' : 'elimination';
  const label = mode === 'elimination' ? '\uD83D\uDD2E \u9884\u6D4B\u672C\u8F6E\u8C01\u4F1A\u88AB\u6DD8\u6C70\uFF1F' : '\uD83D\uDC51 \u9884\u6D4B\u8C01\u80FD\u7B11\u5230\u6700\u540E\uFF1F';
  const badgeColor = mode === 'elimination' ? 'text-red-400 border-red-400/30 bg-red-400/5' : 'text-purple-400 border-purple-400/30 bg-purple-400/5';

  const handlePredict = async (heroId: string) => {
    setSelectedHeroId(heroId);
    setLoading(true);
    try {
      const res = await fetch('/api/audience/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ heroId, type: mode }),
      });
      const data = await res.json();
      if (data.ok) setSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-3 p-2.5 rounded-lg bg-ink-dark/40 border border-ink-light/20">
      <div className="text-xs text-ink-faint mb-2">{label}</div>
      {submitted && selectedHeroId ? (
        <div className={`text-xs px-2.5 py-1 rounded border inline-flex items-center gap-1 ${badgeColor}`}>
          <span>{'\u5DF2\u9884\u6D4B:'}</span>
          <span className="font-bold">
            {heroes.find(h => h.heroId === selectedHeroId)?.heroName || '???'}
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {alive.map(h => (
            <button
              key={h.heroId}
              onClick={() => handlePredict(h.heroId)}
              disabled={loading || (mode === 'elimination' && h.heroId === myHeroId)}
              className={`px-2 py-1 text-xs rounded border transition-all ${
                h.heroId === selectedHeroId
                  ? `${badgeColor}`
                  : 'border-ink-light/20 text-ink-light hover:border-ink-light/40'
              } disabled:opacity-30`}
            >
              {h.heroName.slice(0, 4)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
