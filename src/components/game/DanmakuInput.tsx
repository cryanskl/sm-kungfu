'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import { useWulinStore } from '@/stores/gameStore';
import { INFLUENCE_DISPLAY } from '@/lib/game/audience-influence';

// 天意关键词效果说明（用于弹幕玩法介绍面板）
const INFLUENCE_GUIDE: { keyword: string; icon: string; threshold: number; desc: string }[] = [
  { keyword: '下毒',   icon: '☠️', threshold: 8,  desc: '全场中毒，所有人 -10 HP' },
  { keyword: '加油 + 角色名', icon: '📣', threshold: 5,  desc: '为指定角色助威 +10 热度' },
  { keyword: '嘘 + 角色名',  icon: '👎', threshold: 5,  desc: '对指定角色嘘声 -10 热度' },
  { keyword: '决斗',   icon: '⚔️', threshold: 8,  desc: '声望前二被迫决斗，各 -15 HP' },
  { keyword: '天降神兵', icon: '🗡️', threshold: 10, desc: '随机一人获得神兵武学' },
  { keyword: '休战',   icon: '🕊️', threshold: 10, desc: '本轮所有伤害减半' },
  { keyword: '大乱斗', icon: '💥', threshold: 8,  desc: '全员混战 -8 HP，+5 热度' },
  { keyword: '翻盘',   icon: '🔄', threshold: 8,  desc: '最低血量角色回血 +30 HP' },
  { keyword: '背叛',   icon: '🗡️', threshold: 6,  desc: '随机拆散一对联盟' },
  { keyword: '翻倍',   icon: '✨', threshold: 10, desc: '全场声望和热度各 +10' },
];

// 提示词：点击直接填入输入框。带 ✦ 的是天意关键词（多人发可触发效果）
const HINT_CHIPS = [
  { text: '下毒',   icon: '☠️', influence: true },
  { text: '翻盘',   icon: '🔄', influence: true },
  { text: '决斗',   icon: '⚔️', influence: true },
  { text: '大乱斗', icon: '💥', influence: true },
  { text: '翻倍',   icon: '✨', influence: true },
  { text: '休战',   icon: '🕊️', influence: true },
  { text: '666',    icon: '',   influence: false },
  { text: '冲！',   icon: '',   influence: false },
  { text: '加油',   icon: '📣', influence: false },
];

export function DanmakuInput() {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');
  const [justSent, setJustSent] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const addLocalDanmaku = useWulinStore(s => s.addLocalDanmaku);
  const gameState = useWulinStore(s => s.gameState);
  const influence = gameState?.audienceInfluence;
  const inputRef = useRef<HTMLInputElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);

  // 每次 mount 随机选 5 个提示词（至少 3 个天意词）
  const hints = useMemo(() => {
    const inf = HINT_CHIPS.filter(c => c.influence).sort(() => Math.random() - 0.5).slice(0, 3);
    const normal = HINT_CHIPS.filter(c => !c.influence).sort(() => Math.random() - 0.5).slice(0, 2);
    return [...inf, ...normal].sort(() => Math.random() - 0.5);
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setMsg('');
    try {
      const res = await fetch('/api/audience/danmaku', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed }),
      });
      const data = await res.json();
      if (res.ok && data.danmaku) {
        addLocalDanmaku(data.danmaku);
        setText('');
        setJustSent(true);
        setTimeout(() => setJustSent(false), 600);
      } else {
        setMsg(data.error || '发送失败');
        setTimeout(() => setMsg(''), 3000);
      }
    } catch {
      setMsg('网络错误');
      setTimeout(() => setMsg(''), 3000);
    }
    setSending(false);
  }, [text, sending, addLocalDanmaku]);

  const hasActiveInfluence = influence?.counters && Object.keys(influence.counters).some(k => influence.counters[k] > 0);

  return (
    <div className="flex flex-col items-center gap-2 max-w-lg mx-auto">
      {/* 弹幕天意进度条 */}
      {hasActiveInfluence && (
        <div className="flex flex-wrap gap-1.5 justify-center">
          {INFLUENCE_DISPLAY.map(eff => {
            const count = influence!.counters[eff.id] || 0;
            if (count === 0) return null;
            const full = count >= eff.threshold;
            return (
              <span key={eff.id} className={`text-[10px] px-2 py-0.5 rounded-full border
                ${full ? 'border-gold/60 bg-gold/15 text-gold animate-pulse' : 'border-ink-light/20 text-[--text-dim]'}`}>
                {eff.icon} {eff.label} {count}/{eff.threshold}
              </span>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2 w-full relative">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="发一条弹幕助威…"
          maxLength={50}
          className={`flex-1 bg-ink-dark border border-gold/15 rounded-lg px-3 py-1.5 text-sm
            text-[--text-primary] placeholder:text-[--text-dim]/60
            focus:outline-none focus:border-gold/50 focus:ring-2 focus:ring-gold/15 focus:shadow-[0_0_12px_rgba(201,168,76,0.15)]
            transition-all duration-200 ${justSent ? 'send-success' : ''}`}
        />
        <button
          onClick={handleSend}
          disabled={sending || !text.trim()}
          className="px-3 py-1.5 text-sm rounded-lg bg-gold/15 text-gold font-bold
            hover:bg-gold/25 disabled:opacity-30 transition whitespace-nowrap"
        >
          {sending ? '…' : '发送'}
        </button>
        {/* 天意玩法介绍按钮 */}
        <button
          onClick={() => setShowGuide(g => !g)}
          className={`w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full text-xs font-bold transition-all
            ${showGuide
              ? 'bg-gold/25 text-gold border border-gold/50 shadow-[0_0_8px_rgba(201,168,76,0.3)]'
              : 'bg-ink-dark/80 text-[--text-dim]/60 border border-ink-light/15 hover:text-gold/70 hover:border-gold/30'}`}
          title="弹幕天意玩法说明"
        >
          ?
        </button>
        {msg && <span className="text-xs text-vermillion whitespace-nowrap">{msg}</span>}

        {/* 天意玩法介绍浮窗 */}
        {showGuide && (
          <div
            ref={guideRef}
            className="absolute bottom-full right-0 mb-2 w-72 sm:w-80
              bg-[#1a1510] border border-gold/25 rounded-lg shadow-[0_0_20px_rgba(0,0,0,0.6)]
              p-3 z-50 animate-[fadeSlideUp_0.2s_ease-out]"
          >
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-gold">✦ 弹幕天意 — 观众影响力</h4>
              <button
                onClick={() => setShowGuide(false)}
                className="text-[--text-dim]/40 hover:text-[--text-dim] text-xs"
              >✕</button>
            </div>
            <p className="text-[10px] text-[--text-dim]/70 mb-2 leading-relaxed">
              发送含特定关键词的弹幕，多人累积到阈值后触发天意效果，影响战局！
            </p>
            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
              {INFLUENCE_GUIDE.map(g => (
                <div key={g.keyword} className="flex items-start gap-2 text-[10px] py-1 border-b border-ink-light/10 last:border-0">
                  <span className="flex-shrink-0 w-5 text-center">{g.icon}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-gold/90 font-bold">{g.keyword}</span>
                    <span className="text-[--text-dim]/40 mx-1">×{g.threshold}</span>
                    <span className="text-[--text-dim]/70">{g.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 提示词快捷按钮 */}
      <div className="flex flex-wrap gap-1.5 justify-center">
        <span className="text-[10px] text-[--text-dim]/50">试试：</span>
        {hints.map(h => (
          <button
            key={h.text}
            onClick={() => { setText(h.text); inputRef.current?.focus(); }}
            className={`text-[10px] px-1.5 py-0.5 rounded border transition-all
              ${h.influence
                ? 'border-gold/20 text-gold/70 hover:bg-gold/10 hover:border-gold/40'
                : 'border-ink-light/15 text-[--text-dim]/60 hover:bg-ink-dark/60 hover:text-[--text-dim]'}`}
          >
            {h.icon ? `${h.icon} ` : ''}{h.text}{h.influence ? ' ✦' : ''}
          </button>
        ))}
      </div>
    </div>
  );
}
