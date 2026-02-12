import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI 武林大会 · SecondMe A2A',
  description: '12 个 AI 侠客决战武林盟主！基于 SecondMe 性格系统的 A2A 武侠游戏。',
  openGraph: {
    title: 'AI 武林大会',
    description: '你的 SecondMe AI 化身武侠英雄，6 回合决出武林盟主！',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;700;900&family=ZCOOL+XiaoWei&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
