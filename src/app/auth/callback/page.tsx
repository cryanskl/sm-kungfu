'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function CallbackContent() {
  const params = useSearchParams();
  const error = params.get('error');

  useEffect(() => {
    if (!error) {
      window.location.href = '/';
    }
  }, [error]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[--bg-primary]">
        <div className="text-center">
          <div className="text-4xl mb-4">😢</div>
          <h2 className="text-xl font-bold text-[--accent-red] mb-2">登录失败</h2>
          <p className="text-[--text-secondary] mb-4">错误：{error}</p>
          <a href="/" className="px-6 py-2 rounded-lg bg-[--accent-gold] text-black font-bold hover:bg-[--accent-gold]/80">
            返回首页
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[--bg-primary]">
      <div className="text-center">
        <div className="text-4xl mb-4 animate-pulse">⚔️</div>
        <p className="text-[--text-secondary]">正在进入江湖……</p>
      </div>
    </div>
  );
}

export default function AuthCallback() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[--bg-primary]">
        <div className="text-4xl animate-pulse">⚔️</div>
      </div>
    }>
      <CallbackContent />
    </Suspense>
  );
}
