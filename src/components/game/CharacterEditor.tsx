'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Faction, PersonalityType, HeroAttributes, CharacterConfig, QuizQuestion, Achievement } from '@/lib/types';

interface CharacterEditorProps {
  isOpen: boolean;
  onClose: () => void;
}

const FACTIONS: Faction[] = ['少林', '武当', '华山', '峨眉', '逍遥', '丐帮', '魔教'];
const PERSONALITIES: { value: PersonalityType; label: string; desc: string }[] = [
  { value: 'aggressive', label: '刚猛', desc: '好战善攻，先下手为强' },
  { value: 'cautious', label: '稳健', desc: '以守为攻，步步为营' },
  { value: 'cunning', label: '狡诈', desc: '善用计谋，以智取胜' },
  { value: 'random', label: '随性', desc: '天马行空，不拘一格' },
];
const FIGHT_STYLES = [
  { value: 'offensive' as const, label: '攻击型', desc: '力量+内力加成' },
  { value: 'defensive' as const, label: '防御型', desc: '体质+轻功加成' },
  { value: 'balanced' as const, label: '均衡型', desc: '智慧+魅力加成' },
];

const ATTR_LABELS: Record<keyof HeroAttributes, string> = {
  strength: '力量',
  innerForce: '内力',
  agility: '轻功',
  wisdom: '智慧',
  constitution: '体质',
  charisma: '魅力',
};

export function CharacterEditor({ isOpen, onClose }: CharacterEditorProps) {
  const [tab, setTab] = useState<'quick' | 'quiz' | 'custom' | 'achievements'>('quick');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // 服务端数据
  const [currentAttrs, setCurrentAttrs] = useState<HeroAttributes | null>(null);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [canEdit, setCanEdit] = useState(true);
  const [nextEditAt, setNextEditAt] = useState<string | null>(null);
  const [allAchievements, setAllAchievements] = useState<Achievement[]>([]);
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set());

  // 编辑状态
  const [faction, setFaction] = useState<Faction | null>(null);
  const [personality, setPersonality] = useState<PersonalityType | null>(null);
  const [fightStyle, setFightStyle] = useState<'offensive' | 'defensive' | 'balanced' | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [catchphrase, setCatchphrase] = useState('');
  const [keywordInput, setKeywordInput] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/character');
      if (!res.ok) return;
      const data = await res.json();
      setCurrentAttrs(data.currentAttrs);
      setQuizQuestions(data.quizQuestions || []);
      setCanEdit(data.canEdit);
      setNextEditAt(data.nextEditAt);
      if (data.config) {
        setFaction(data.config.preferredFaction);
        setPersonality(data.config.personalityPreference);
        setFightStyle(data.config.fightStyle);
        setKeywords(data.config.backstoryKeywords || []);
        setCatchphrase(data.config.customCatchphrase || '');
      } else {
        setFaction(data.faction);
        setPersonality(data.personalityType);
      }
      if (data.quizAnswers) {
        setQuizAnswers(data.quizAnswers);
      }
      if (data.allAchievements) {
        setAllAchievements(data.allAchievements);
      }
      if (data.unlockedAchievementIds) {
        setUnlockedIds(new Set(data.unlockedAchievementIds));
      }
    } catch {
      setError('加载失败');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isOpen) fetchData();
  }, [isOpen, fetchData]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const config: CharacterConfig = {
        preferredFaction: faction,
        personalityPreference: personality,
        fightStyle,
        backstoryKeywords: keywords,
        customCatchphrase: catchphrase || null,
      };
      const res = await fetch('/api/auth/character', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, quizAnswers: quizAnswers.length > 0 ? quizAnswers : null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '保存失败');
        if (data.nextEditAt) setNextEditAt(data.nextEditAt);
      } else {
        setCurrentAttrs(data.attrs);
        setCanEdit(false);
        onClose();
      }
    } catch {
      setError('保存失败');
    }
    setSaving(false);
  };

  const addKeyword = () => {
    const kw = keywordInput.trim();
    if (kw && keywords.length < 5 && !keywords.includes(kw)) {
      setKeywords([...keywords, kw]);
      setKeywordInput('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="card-wuxia w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-bold text-gold tracking-wider">角色设定</h2>
          <button onClick={onClose} className="text-[--text-dim] hover:text-[--text-primary] text-xl">&times;</button>
        </div>

        {loading ? (
          <div className="text-center py-10 text-[--text-dim]">加载中...</div>
        ) : (
          <>
            {/* Tab 切换 */}
            <div className="flex gap-2 mb-4">
              {[
                { key: 'quick' as const, label: '快速设定' },
                { key: 'quiz' as const, label: '问卷' },
                { key: 'custom' as const, label: '个性化' },
                { key: 'achievements' as const, label: '成就' },
              ].map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                    tab === t.key
                      ? 'bg-gold/20 text-gold border border-gold/30'
                      : 'text-[--text-dim] hover:text-[--text-secondary] border border-transparent'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab 1: 快速设定 */}
            {tab === 'quick' && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-bold text-[--text-secondary] mb-2">门派</h4>
                  <div className="grid grid-cols-4 gap-2">
                    {FACTIONS.map(f => (
                      <button
                        key={f}
                        onClick={() => setFaction(faction === f ? null : f)}
                        className={`px-2 py-1.5 text-sm rounded-lg border transition-all ${
                          faction === f
                            ? 'border-gold/50 bg-gold/10 text-gold'
                            : 'border-ink-light/20 text-[--text-dim] hover:border-ink-light/40'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-[--text-secondary] mb-2">性格</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {PERSONALITIES.map(p => (
                      <button
                        key={p.value}
                        onClick={() => setPersonality(personality === p.value ? null : p.value)}
                        className={`px-3 py-2 text-sm rounded-lg border transition-all text-left ${
                          personality === p.value
                            ? 'border-gold/50 bg-gold/10 text-gold'
                            : 'border-ink-light/20 text-[--text-dim] hover:border-ink-light/40'
                        }`}
                      >
                        <div className="font-bold">{p.label}</div>
                        <div className="text-[10px] opacity-70">{p.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-[--text-secondary] mb-2">战斗风格</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {FIGHT_STYLES.map(s => (
                      <button
                        key={s.value}
                        onClick={() => setFightStyle(fightStyle === s.value ? null : s.value)}
                        className={`px-3 py-2 text-sm rounded-lg border transition-all text-center ${
                          fightStyle === s.value
                            ? 'border-gold/50 bg-gold/10 text-gold'
                            : 'border-ink-light/20 text-[--text-dim] hover:border-ink-light/40'
                        }`}
                      >
                        <div className="font-bold">{s.label}</div>
                        <div className="text-[10px] opacity-70">{s.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: 问卷 */}
            {tab === 'quiz' && (
              <div className="space-y-5">
                <p className="text-xs text-[--text-dim]">回答武侠情境题，影响属性和推荐门派/性格（可选，不影响手动设定）</p>
                {quizQuestions.map((q, qi) => (
                  <div key={q.id}>
                    <h4 className="text-sm font-bold text-[--text-secondary] mb-2">{qi + 1}. {q.question}</h4>
                    <div className="space-y-1.5">
                      {q.options.map((opt, oi) => (
                        <button
                          key={oi}
                          onClick={() => {
                            const next = [...quizAnswers];
                            next[qi] = oi;
                            setQuizAnswers(next);
                          }}
                          className={`w-full px-3 py-2 text-sm rounded-lg border transition-all text-left ${
                            quizAnswers[qi] === oi
                              ? 'border-gold/50 bg-gold/10 text-gold'
                              : 'border-ink-light/20 text-[--text-dim] hover:border-ink-light/40'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Tab 3: 个性化 */}
            {tab === 'custom' && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-bold text-[--text-secondary] mb-2">自定义口头禅</h4>
                  <input
                    value={catchphrase}
                    onChange={e => setCatchphrase(e.target.value.slice(0, 50))}
                    placeholder="一句话定义你的江湖人设..."
                    className="w-full px-3 py-2 bg-ink-dark/50 border border-ink-light/20 rounded-lg text-sm text-[--text-primary] placeholder-ink-light/40 focus:border-gold/40 outline-none"
                  />
                  <span className="text-[10px] text-[--text-dim]">{catchphrase.length}/50</span>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-[--text-secondary] mb-2">
                    背景关键词 <span className="text-[--text-dim] font-normal">({keywords.length}/5)</span>
                  </h4>
                  <div className="flex gap-2 mb-2 flex-wrap">
                    {keywords.map((kw, i) => (
                      <span key={i} className="px-2 py-1 bg-gold/10 text-gold text-xs rounded-lg border border-gold/20 flex items-center gap-1">
                        {kw}
                        <button onClick={() => setKeywords(keywords.filter((_, j) => j !== i))} className="hover:text-vermillion">&times;</button>
                      </span>
                    ))}
                  </div>
                  {keywords.length < 5 && (
                    <div className="flex gap-2">
                      <input
                        value={keywordInput}
                        onChange={e => setKeywordInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addKeyword()}
                        placeholder="例如：孤儿、剑客、复仇..."
                        className="flex-1 px-3 py-1.5 bg-ink-dark/50 border border-ink-light/20 rounded-lg text-sm text-[--text-primary] placeholder-ink-light/40 focus:border-gold/40 outline-none"
                      />
                      <button onClick={addKeyword} className="btn-ghost text-sm">添加</button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab 4: 成就 */}
            {tab === 'achievements' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-[--text-dim]">
                    已解锁 {unlockedIds.size}/{allAchievements.length}
                  </p>
                  <p className="text-xs text-gold font-mono">
                    {allAchievements.filter(a => unlockedIds.has(a.id)).reduce((s, a) => s + a.points, 0)} 积分
                  </p>
                </div>

                {(['instant', 'accumulated', 'hidden'] as const).map(cat => {
                  const catLabel = cat === 'instant' ? '局内即时' : cat === 'accumulated' ? '跨局积累' : '隐藏成就';
                  const items = allAchievements.filter(a => a.category === cat);
                  if (items.length === 0) return null;
                  return (
                    <div key={cat}>
                      <h4 className="text-xs font-bold text-[--text-secondary] mb-1.5 tracking-wider">{catLabel}</h4>
                      <div className="space-y-1.5">
                        {items.map(a => {
                          const unlocked = unlockedIds.has(a.id);
                          return (
                            <div
                              key={a.id}
                              className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-all ${
                                unlocked
                                  ? 'border-gold/30 bg-gold/5'
                                  : 'border-ink-light/10 bg-ink-dark/30 opacity-50'
                              }`}
                            >
                              <span className="text-lg flex-shrink-0">{a.icon}</span>
                              <div className="flex-1 min-w-0">
                                <div className={`text-sm font-bold truncate ${unlocked ? 'text-gold' : 'text-[--text-dim]'}`}>
                                  {a.name}
                                </div>
                                <div className="text-[10px] text-[--text-dim] truncate">
                                  {cat === 'hidden' && !unlocked ? '???' : a.description}
                                </div>
                              </div>
                              <span className={`text-xs font-mono flex-shrink-0 ${unlocked ? 'text-gold' : 'text-[--text-dim]'}`}>
                                +{a.points}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {allAchievements.length === 0 && (
                  <p className="text-center text-[--text-dim] py-6 text-sm">暂无成就数据</p>
                )}
              </div>
            )}

            {/* 六维属性预览（成就 Tab 不显示） */}
            {currentAttrs && tab !== 'achievements' && (
              <div className="mt-4 pt-4 border-t border-ink-light/10">
                <h4 className="text-sm font-bold text-[--text-secondary] mb-2">当前属性</h4>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.entries(ATTR_LABELS) as [keyof HeroAttributes, string][]).map(([key, label]) => (
                    <div key={key} className="text-center">
                      <div className="text-[10px] text-[--text-dim]">{label}</div>
                      <div className="text-sm font-mono text-gold tabular-nums">{currentAttrs[key]}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 保存按钮（成就 Tab 只显示关闭） */}
            <div className="mt-4 pt-4 border-t border-ink-light/10">
              {tab !== 'achievements' ? (
                <>
                  {error && <p className="text-vermillion text-sm mb-2">{error}</p>}
                  {!canEdit && nextEditAt && (
                    <p className="text-[--text-dim] text-xs mb-2">
                      下次可修改时间：{new Date(nextEditAt).toLocaleString('zh-CN')}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={handleSave}
                      disabled={!canEdit || saving}
                      className="btn-gold flex-1 disabled:opacity-40"
                    >
                      {saving ? '保存中...' : canEdit ? '保存设定' : '冷却中'}
                    </button>
                    <button onClick={onClose} className="btn-ghost">取消</button>
                  </div>
                </>
              ) : (
                <button onClick={onClose} className="btn-ghost w-full">关闭</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
