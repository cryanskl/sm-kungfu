'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface RichEntry {
  heroId: string;
  heroName: string;
  balance: number;
  rank: number;
}

const RANK_SEALS = ['壹', '贰', '叁'];

export function RichLeaderboard() {
  const [open, setOpen] = useState(false);
  const [top10, setTop10] = useState<RichEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<RichEntry | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchRanking = useCallback(async (search?: string) => {
    const url = search
      ? `/api/leaderboard/rich?search=${encodeURIComponent(search)}`
      : '/api/leaderboard/rich';
    try {
      const res = await fetch(url);
      const data = await res.json();
      setTop10(data.top10 || []);
      if (search) setSearchResult(data.searchResult || null);
      else setSearchResult(null);
    } catch { /* silent */ }
    setIsSearching(false);
  }, []);

  // Auto-refresh every 60s when panel is open
  useEffect(() => {
    if (!open) return;
    fetchRanking();
    const interval = setInterval(() => fetchRanking(), 60000);
    return () => clearInterval(interval);
  }, [open, fetchRanking]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!searchQuery.trim()) {
      setSearchResult(null);
      return;
    }
    setIsSearching(true);
    searchTimerRef.current = setTimeout(() => {
      fetchRanking(searchQuery.trim());
    }, 400);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery, open, fetchRanking]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Is the search result already visible in top 10?
  const searchInTop10 = searchResult && top10.some(e => e.heroId === searchResult.heroId);

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className={`px-2.5 py-1 rounded-lg text-xs font-display font-bold border transition ${
          open
            ? 'border-gold/40 text-gold bg-gold/10'
            : 'border-gold/20 text-gold/70 hover:text-gold hover:border-gold/30 hover:bg-gold/5'
        }`}
      >
        💰 富豪榜
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] bg-ink-dark border border-gold/15 rounded-xl shadow-ink overflow-hidden z-[60] animate-fade-in-down">
          {/* Header */}
          <div className="px-4 pt-4 pb-3 border-b border-gold/10">
            <h3 className="font-display font-bold text-sm text-gold tracking-wide">💰 富豪榜</h3>
            <p className="text-[10px] text-[--text-dim] mt-0.5">银两排行 · 每分钟刷新</p>
          </div>

          {/* Search */}
          <div className="px-4 py-2.5 border-b border-gold/10">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="搜索侠客名号…"
                className="w-full bg-ink-dark border border-gold/15 rounded-lg px-3 py-1.5 text-xs text-[--text-primary] placeholder-[--text-dim] focus:outline-none focus:border-gold/30 transition"
              />
              {isSearching && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gold/60 animate-pulse">搜索中…</span>
              )}
            </div>
          </div>

          {/* Search result (if not in top 10) */}
          {searchResult && !searchInTop10 && (
            <div className="px-4 py-2 border-b border-gold/10 bg-gold/[0.04]">
              <div className="text-[10px] text-gold/60 mb-1">搜索结果</div>
              <RichRow entry={searchResult} highlight />
            </div>
          )}

          {/* Top 10 list */}
          <div className="px-4 py-2 max-h-[400px] overflow-y-auto custom-scrollbar">
            {top10.length > 0 ? (
              <div className="space-y-0.5">
                {top10.map(entry => (
                  <RichRow
                    key={entry.heroId}
                    entry={entry}
                    highlight={searchResult?.heroId === entry.heroId}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center text-[--text-dim] text-sm py-8 font-display">暂无数据</div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-gold/10 text-[10px] text-[--text-dim] text-center">
            前十名 · 银两高者居上
          </div>
        </div>
      )}
    </div>
  );
}

function RichRow({ entry, highlight }: { entry: RichEntry; highlight?: boolean }) {
  const isTop3 = entry.rank <= 3;
  return (
    <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition ${
      highlight ? 'bg-gold/[0.08] ring-1 ring-gold/20' :
      isTop3 ? 'bg-gold/[0.03]' : ''
    }`}>
      {/* Rank */}
      <span className="w-6 text-center flex-shrink-0">
        {entry.rank <= 3 ? (
          <span className="seal-stamp text-[9px]" style={{ width: '1.3rem', height: '1.3rem' }}>
            {RANK_SEALS[entry.rank - 1]}
          </span>
        ) : (
          <span className="text-[--text-dim] font-mono tabular-nums">{entry.rank}</span>
        )}
      </span>

      {/* Name */}
      <span className={`flex-1 min-w-0 truncate ${
        entry.rank === 1 ? 'font-bold text-gold font-display' : 'font-medium'
      }`}>
        {entry.heroName}
      </span>

      {/* Balance */}
      <span className={`flex-shrink-0 font-mono tabular-nums ${
        entry.rank === 1 ? 'text-gold font-bold' : 'text-[--text-secondary]'
      }`}>
        {entry.balance.toLocaleString()}
      </span>
    </div>
  );
}
