'use client';

import { useState, useEffect, useRef } from 'react';
import { GameState, GameHeroSnapshot } from '@/lib/types';
import { HeroCard } from '@/components/game/HeroCard';
import { LastGameTop8, LastGameHighlights } from '@/components/game/LastGameReview';
import { COUNTDOWN_POEMS } from '@/lib/game/constants';
import { CharacterEditor } from '@/components/game/CharacterEditor';

interface WaitingPhaseProps {
  gameState: GameState | null;
  heroes: GameHeroSnapshot[];
  countdown: number | null;
  isJoining: boolean;
  errorMsg: string;
  isLoggedIn: boolean;
  onJoin: () => void;
}

export function WaitingPhase({
  gameState, heroes, countdown, isJoining, errorMsg, isLoggedIn, onJoin,
}: WaitingPhaseProps) {
  const hasLastGame = (gameState?.lastGameTop8?.length ?? 0) > 0;
  const [showEditor, setShowEditor] = useState(false);

  // 古诗词轮换（每5秒换一首，带淡入动画）
  const [poemIndex, setPoemIndex] = useState(() =>
    Math.floor(Math.random() * COUNTDOWN_POEMS.length)
  );
  const [poemFade, setPoemFade] = useState(true);
  const poemTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (countdown === null || countdown <= 0) {
      if (poemTimerRef.current) clearInterval(poemTimerRef.current);
      return;
    }
    // 每5秒切换古诗
    poemTimerRef.current = setInterval(() => {
      setPoemFade(false); // 淡出
      setTimeout(() => {
        setPoemIndex(prev => (prev + 1) % COUNTDOWN_POEMS.length);
        setPoemFade(true); // 淡入
      }, 400);
    }, 5000);
    return () => {
      if (poemTimerRef.current) clearInterval(poemTimerRef.current);
    };
  }, [countdown !== null && countdown > 0]);

  const poem = COUNTDOWN_POEMS[poemIndex];

  return (
    <div className={`phase-enter ${hasLastGame ? 'grid grid-cols-12 gap-4 lg:gap-6 py-8' : 'text-center py-16 md:py-24 bg-waiting'}`}>
      {hasLastGame && (
        <div className="col-span-12 lg:col-span-3 order-2 lg:order-1">
          <LastGameTop8 entries={gameState?.lastGameTop8 || []} />
        </div>
      )}
      <div className={hasLastGame ? 'col-span-12 lg:col-span-6 order-1 lg:order-2 text-center' : ''}>
        <div className="text-7xl mb-6 animate-breathe filter drop-shadow-lg">⚔️</div>
        <h2 className="font-display text-4xl md:text-5xl font-bold text-gold mb-3 animate-glow-text tracking-widest">
          武林大会
        </h2>
        <p className="text-base text-[--text-secondary] mb-2">
          12 个 AI 侠客齐聚江湖 · 6 回合争夺武林盟主
        </p>

        {countdown !== null && countdown > 0 ? (
          <div className="my-10">
            {/* 古诗词展示 */}
            <div
              className="mb-6 min-h-[4.5rem] flex flex-col items-center justify-center transition-opacity duration-400"
              style={{ opacity: poemFade ? 1 : 0 }}
            >
              <p className="text-lg md:text-xl text-gold font-display tracking-wider leading-relaxed">
                「{poem.verse}」
              </p>
              <p className="text-xs text-[--text-dim] mt-1.5">
                —— {poem.source}
              </p>
            </div>
            {/* 倒计时 */}
            <div className="flex items-center justify-center gap-3">
              <div className="text-5xl font-display font-bold text-vermillion animate-count-pulse tabular-nums"
                style={{ textShadow: '0 0 30px var(--vermillion-glow)' }}>
                {countdown}
              </div>
              <span className="text-[--text-dim] text-sm tracking-wider">秒后开战</span>
            </div>
          </div>
        ) : countdown === 0 ? (
          <div className="my-10">
            <div className="text-4xl font-display font-bold text-gold animate-pulse">⚔️ 开战中…</div>
            <p className="text-[--text-dim] mt-2 text-sm">正在召集各路英雄</p>
          </div>
        ) : (
          <div className="my-10">
            {isLoggedIn ? (
              <button onClick={onJoin} disabled={isJoining}
                className="btn-gold text-lg px-12 py-3.5 animate-pulse-glow disabled:opacity-40">
                {isJoining ? '入座中…' : '⚔️ 入座参战'}
              </button>
            ) : (
              <div className="space-y-3">
                <a href="/api/auth/login"
                  className="inline-block btn-gold text-lg px-12 py-3.5 animate-pulse-glow">
                  🔑 用 SecondMe 登录参战
                </a>
                <p className="text-sm text-[--text-dim]">或留在此处围观比赛实况</p>
              </div>
            )}
            {isLoggedIn && (
              <button
                onClick={() => setShowEditor(true)}
                className="btn-ghost text-sm mt-2 inline-block"
              >
                🎭 角色设定
              </button>
            )}
            <p className="text-xs text-[--text-dim] mt-3 tracking-wide">无需登录即可围观 · 登录后你的 AI 自动参战</p>
            {errorMsg && <p className="text-vermillion text-sm mt-2">{errorMsg}</p>}
          </div>
        )}

        <div className="mt-8">
          <h3 className="text-sm mb-4 text-[--text-dim] font-display tracking-wider">
            ⚔️ 已入座 <span className="text-gold tabular-nums">{heroes.length}</span>/12
          </h3>
          <div className={`grid grid-cols-2 sm:grid-cols-3 ${hasLastGame ? '' : 'md:grid-cols-4 max-w-4xl mx-auto'} gap-2.5`}>
            {Array.from({ length: 12 }, (_, i) => {
              const hero = heroes.find(h => h.seatNumber === i + 1);
              if (hero) return <HeroCard key={hero.heroId} hero={hero} compact />;
              return <div key={`empty-${i}`} className="seat-empty">座位 {i + 1}</div>;
            })}
          </div>
        </div>
      </div>
      {hasLastGame && (
        <div className="col-span-12 lg:col-span-3 order-3">
          <LastGameHighlights events={gameState?.lastGameHighlights || []} />
        </div>
      )}
      <CharacterEditor isOpen={showEditor} onClose={() => setShowEditor(false)} />
    </div>
  );
}
