'use client';

import { useState, useCallback } from 'react';
import { useWulinStore } from '@/stores/gameStore';
import { ArtifactPoolState, ArtifactDef, GameHeroSnapshot } from '@/lib/types';

interface Props {
  artifactPool: ArtifactPoolState;
  timer: number | null;
  gameId: string;
  heroes: GameHeroSnapshot[];
}

export function ArtifactSelectionPanel({ artifactPool, timer, gameId, heroes }: Props) {
  const { user, audienceArtifact, setAudienceArtifact } = useWulinStore();
  const [selectedArtifact, setSelectedArtifact] = useState<string | null>(null);
  const [pendingHero, setPendingHero] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const finalists = artifactPool.finalists || [];
  const artifacts = artifactPool.availableArtifacts || [];
  const alreadyGifted = !!audienceArtifact;

  const handleHeroClick = useCallback(async (heroId: string) => {
    if (alreadyGifted || isSubmitting) return;
    if (!selectedArtifact) {
      setError('请先选择一件神器');
      setTimeout(() => setError(''), 2000);
      return;
    }
    // First click: select hero; Second click on same hero: confirm
    if (pendingHero !== heroId) {
      setPendingHero(heroId);
      setError('');
      return;
    }
    // Second click — submit
    setIsSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/audience/artifact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artifactId: selectedArtifact, heroId }),
      });
      const data = await res.json();
      if (data.ok) {
        const art = artifacts.find(a => a.id === selectedArtifact);
        setAudienceArtifact({
          artifactId: selectedArtifact,
          heroId,
          amount: art?.price || 0,
        });
        setSuccess(true);
      } else {
        setError(data.error || '赠送失败');
      }
    } catch {
      setError('网络错误');
    }
    setIsSubmitting(false);
  }, [selectedArtifact, pendingHero, isSubmitting, alreadyGifted, artifacts, setAudienceArtifact]);

  const selectedArtifactDef = artifacts.find(a => a.id === selectedArtifact);

  const categoryLabels: Record<string, string> = {
    weapon: '兵器',
    armor: '防具',
    technique: '秘籍',
    healing: '丹药',
    accessory: '奇物',
  };

  const effectLabels = (effect: ArtifactDef['effect']) => {
    const parts: string[] = [];
    if (effect.attackBoost) parts.push(`攻+${effect.attackBoost}`);
    if (effect.defenseBoost) parts.push(`防+${effect.defenseBoost}`);
    if (effect.hpBonus) parts.push(`HP+${effect.hpBonus}`);
    if (effect.ultimateBoost) parts.push(`绝招+${Math.round(effect.ultimateBoost * 100)}%`);
    if (effect.bluffBoost) parts.push(`诈+${Math.round(effect.bluffBoost * 100)}%`);
    if (effect.damageReduction) parts.push(`减伤${effect.damageReduction}`);
    return parts.join(' ');
  };

  return (
    <div className="py-6 phase-enter">
      {/* 标题 + 倒计时 */}
      <div className="text-center mb-6">
        <h2 className="font-display text-3xl font-bold text-gold mb-2 animate-glow-text tracking-widest">
          神兵助战
        </h2>
        <p className="text-sm text-[--text-secondary] mb-3">选一件神器赠给你看好的决赛选手！冠军方按倍率返还！</p>
        {timer !== null && timer > 0 && (
          <div className="inline-flex items-center gap-2.5 phase-badge phase-countdown">
            <span className="font-mono tabular-nums text-lg font-bold">{timer}s</span>
            <span className="text-xs opacity-80">神兵助战倒计时</span>
          </div>
        )}
        {timer === 0 && (
          <div className="inline-flex items-center gap-2.5 phase-badge phase-processing">
            <span className="text-xs">决赛即将开始…</span>
          </div>
        )}
      </div>

      {/* 神器选择网格（先选神器） */}
      {!alreadyGifted && (
        <>
          <div className="divider-ornate text-[10px] text-[--text-dim] mb-3">
            {selectedArtifact ? '已选神器，点击下方选手赠送' : '选择神器'}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 max-w-3xl mx-auto mb-4">
            {artifacts.map((art) => {
              const isArtSelected = selectedArtifact === art.id;
              return (
                <button
                  key={art.id}
                  onClick={() => { setSelectedArtifact(art.id); setPendingHero(null); }}
                  className={`card-wuxia p-3 rounded-lg text-left transition-all ${
                    isArtSelected
                      ? 'border-gold/60 bg-gold/10 ring-1 ring-gold/30 scale-[1.02]'
                      : 'border-gold/15 hover:border-gold/35'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">{art.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-display font-bold text-sm text-[--text-primary]">{art.name}</span>
                        <span className="text-[10px] font-bold text-gold bg-gold/15 px-1 py-0.5 rounded tabular-nums">×{art.multiplier}</span>
                      </div>
                      <div className="text-[10px] text-gold/60">{categoryLabels[art.category] || art.category}</div>
                    </div>
                  </div>
                  <p className="text-[10px] text-[--text-dim] mb-1.5 leading-tight">{art.description}</p>
                  <div className="text-[10px] text-jade font-mono">{effectLabels(art.effect)}</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-gold font-bold tabular-nums">{art.price} 银两</span>
                    <span className="text-[10px] text-gold/70 tabular-nums">回报 {Math.floor(art.price * art.multiplier)}</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="text-center mb-4">
            {!user.isLoggedIn && (
              <p className="text-[10px] text-[--text-dim]">
                <a href="/api/auth/login" className="text-gold hover:underline">登录</a> 后可参与分红
              </p>
            )}
            {error && <p className="text-xs text-vermillion mt-2">{error}</p>}
          </div>
        </>
      )}

      {/* 决赛选手卡片（再选人赠送） */}
      <div className="grid grid-cols-2 gap-4 max-w-2xl mx-auto mb-6">
        {finalists.map((f) => {
          const heroSnap = heroes.find(h => h.heroId === f.heroId);
          const isPending = pendingHero === f.heroId && !!selectedArtifact && !alreadyGifted;
          const isGiftTarget = alreadyGifted && audienceArtifact?.heroId === f.heroId;
          return (
            <button
              key={f.heroId}
              onClick={() => handleHeroClick(f.heroId)}
              disabled={alreadyGifted || isSubmitting}
              className={`card-wuxia p-4 rounded-xl text-center transition-all ${
                isPending
                  ? 'border-gold/60 bg-gold/10 ring-1 ring-gold/30 scale-[1.03] animate-pulse-glow'
                  : isGiftTarget
                  ? 'border-jade/60 bg-jade/10 ring-1 ring-jade/30'
                  : 'border-gold/20 hover:border-gold/40'
              } ${alreadyGifted ? 'opacity-80' : 'cursor-pointer'}`}
            >
              <div className="text-2xl mb-1">⚔️</div>
              <div className="font-display font-bold text-gold text-lg">{f.heroName}</div>
              {heroSnap && (
                <div className="text-xs text-[--text-dim] mt-1">{heroSnap.faction} · HP:{heroSnap.hp}</div>
              )}
              <div className="divider-wuxia !my-2" />
              <div className="text-xs text-[--text-secondary]">
                已收{f.giftCount}件神器 · 总价值
                <span className="text-gold font-bold ml-1">{f.totalValue}</span>银两
              </div>
              {f.artifacts.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1 justify-center">
                  {f.artifacts.map((a, i) => (
                    <span key={i} className="text-[10px] bg-gold/10 px-1.5 py-0.5 rounded text-gold/80">
                      {a.artifactName}
                    </span>
                  ))}
                </div>
              )}
              {isPending && (
                <div className="mt-2 text-xs text-gold font-bold animate-fade-in-up">
                  {isSubmitting ? '赠送中…' : `👆 再次点击赠送「${selectedArtifactDef?.name}」`}
                </div>
              )}
              {isGiftTarget && (
                <div className="mt-2 text-xs text-jade font-bold">✅ 已赠送</div>
              )}
            </button>
          );
        })}
      </div>

      {/* 奖池信息 */}
      <div className="text-center mb-4">
        <div className="divider-ornate text-[10px] text-[--text-dim]">奖池</div>
        <div className="text-gold font-display text-2xl font-bold mt-2 tabular-nums">
          {artifactPool.totalPrizePool.toLocaleString()} 银两
        </div>
        <div className="text-xs text-[--text-dim] mt-1">
          押注 {artifactPool.introBetTotal.toLocaleString()} + 神器 {(artifactPool.totalPrizePool - artifactPool.introBetTotal).toLocaleString()}
        </div>
      </div>

      {/* 已赠送成功提示 */}
      {(success || alreadyGifted) && (
        <div className="card-gold p-4 rounded-xl max-w-lg mx-auto mb-4 text-center animate-fade-in-up">
          <p className="text-gold font-bold">神兵已赠！若你的选手夺冠，将按倍率返还！</p>
        </div>
      )}
    </div>
  );
}
