'use client';

import { useState, useCallback } from 'react';
import { useWulinStore } from '@/stores/gameStore';

export function DanmakuInput() {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');
  const addLocalDanmaku = useWulinStore(s => s.addLocalDanmaku);

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
        // 本地立即显示
        addLocalDanmaku(data.danmaku);
        setText('');
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

  return (
    <div className="flex items-center gap-2 max-w-lg mx-auto">
      <input
        type="text"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSend()}
        placeholder="发一条弹幕助威…"
        maxLength={50}
        className="flex-1 bg-[--bg-card] border border-[--accent-gold]/20 rounded-lg px-3 py-1.5 text-sm
          text-[--text-primary] placeholder:text-[--text-secondary]/50
          focus:outline-none focus:border-[--accent-gold]/50 transition"
      />
      <button
        onClick={handleSend}
        disabled={sending || !text.trim()}
        className="px-3 py-1.5 text-sm rounded-lg bg-[--accent-gold]/20 text-[--accent-gold]
          hover:bg-[--accent-gold]/30 disabled:opacity-40 transition whitespace-nowrap"
      >
        {sending ? '…' : '发送'}
      </button>
      {msg && <span className="text-xs text-[--accent-red] whitespace-nowrap">{msg}</span>}
    </div>
  );
}
