'use client';

import { useState, useEffect } from 'react';
import type { GameState, EncounterChoice } from '@/lib/types';
import { MidGameBetBar } from '@/components/game/MidGameBetBar';

interface ChoosingPanelProps {
  gameState: GameState;
  onSubmit: (encounterIds: string[]) => void;
  isSubmitted: boolean;
}

export function ChoosingPanel({ gameState, onSubmit, isSubmitted }: ChoosingPanelProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const choices = gameState.pendingChoices || [];
  const maxChoices = 2;

  // Server-authoritative countdown
  useEffect(() => {
    if (!gameState.choosingDeadline) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((new Date(gameState.choosingDeadline!).getTime() - Date.now()) / 1000));
      setCountdown(remaining);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [gameState.choosingDeadline]);

  const toggle = (id: string) => {
    if (isSubmitted) return;
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= maxChoices) return prev;
      return [...prev, id];
    });
  };

  const handleSubmit = () => {
    if (selected.length === maxChoices && !isSubmitted) {
      onSubmit(selected);
    }
  };

  // Effect display helpers
  const effectColor = (value: number | undefined) => {
    if (!value) return '';
    return value > 0 ? 'text-jade' : 'text-vermillion';
  };
  const effectSign = (value: number | undefined) => {
    if (!value) return '';
    return value > 0 ? `+${value}` : `${value}`;
  };

  const effectLabels: Record<string, string> = {
    hp: '气血', reputation: '声望', hot: '热度', morality: '道义', credit: '信用'
  };

  const heroChoiceStatus = gameState.heroChoiceStatus || {};
  const totalHeroes = Object.keys(heroChoiceStatus).length;
  const chosenCount = Object.values(heroChoiceStatus).filter(s => s === 'chosen').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-display text-base font-bold text-gold tracking-wider">
          第 {gameState.currentRound} 轮 · 选择奇遇
        </h3>
        <div className="flex items-center gap-3">
          {totalHeroes > 0 && (
            <span className="text-[10px] text-[--text-dim] tabular-nums">{chosenCount}/{totalHeroes} 已提交</span>
          )}
          {countdown !== null && (
            <span className={`font-mono text-sm px-2 py-0.5 rounded ${countdown <= 5 ? 'text-vermillion animate-pulse' : 'text-[--text-dim]'}`}>
              ⏱ {countdown}s
            </span>
          )}
        </div>
      </div>

      {isSubmitted ? (
        <div className="text-center py-8">
          <p className="text-[--text-secondary] text-sm mb-2">已提交选择，等待其他玩家...</p>
          <p className="text-[--text-dim] text-xs">{chosenCount}/{totalHeroes} 已选择</p>
        </div>
      ) : choices.length === 0 ? (
        <div className="text-center py-8 text-[--text-dim] text-sm">加载奇遇中...</div>
      ) : (
        <>
          <p className="text-xs text-[--text-dim]">
            已选 {selected.length}/{maxChoices} · {selected.length < maxChoices ? `还需选 ${maxChoices - selected.length} 个` : '可以提交了'}
          </p>

          {/* Encounter card grid */}
          <div className="grid grid-cols-2 gap-2">
            {choices.map((enc: EncounterChoice) => {
              const isSelected = selected.includes(enc.id);
              return (
                <button
                  key={enc.id}
                  onClick={() => toggle(enc.id)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    isSelected
                      ? 'border-gold/50 bg-gold/10 shadow-gold-glow'
                      : 'border-ink-light/20 bg-ink-dark/30 hover:border-ink-light/40'
                  }`}
                >
                  <div className="flex items-start justify-between mb-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${isSelected ? 'bg-gold/20 text-gold' : 'bg-ink-light/10 text-[--text-dim]'}`}>
                      {enc.category}
                    </span>
                    {isSelected && <span className="text-gold text-xs">✓</span>}
                  </div>
                  <p className={`text-xs leading-relaxed mb-2 line-clamp-3 ${isSelected ? 'text-gold/90' : 'text-[--text-secondary]'}`}>{enc.name}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(enc.effects).filter(([, v]) => v !== 0 && v !== undefined).map(([key, value]) => (
                      <span key={key} className={`text-[10px] font-mono ${effectColor(value as number)}`}>
                        {effectLabels[key] || key}{effectSign(value as number)}
                      </span>
                    ))}
                    {enc.martialArt && (
                      <span className="text-[10px] font-mono text-gold">
                        武功:{enc.martialArt.name}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Submit button */}
          <button
            onClick={handleSubmit}
            disabled={selected.length !== maxChoices}
            className="btn-gold w-full disabled:opacity-40"
          >
            确认选择
          </button>
        </>
      )}

      {/* Mid-game betting bar */}
      <MidGameBetBar />
    </div>
  );
}
