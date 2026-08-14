import type { ReactNode } from 'react';
import { useDataPort } from './data-port-context';

/**
 * 共享外壳：顶栏 + 内容区。
 * 顶栏是唯一跨页面共享的结构，各页面自己决定内部布局（沿用原型的做法）。
 */
export function AppShell({ children }: { readonly children: ReactNode }) {
  const port = useDataPort();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 flex h-11 items-center gap-5 border-b border-line bg-panel px-4">
        <span className="text-[13.5px] font-semibold tracking-tight whitespace-nowrap">
          线材研发<span className="text-accent">管理</span>
        </span>

        <nav className="flex gap-0.5">
          <span className="rounded-md bg-zinc-100 px-2.5 py-1 text-[12.5px] font-semibold text-ink">
            质量矩阵
          </span>
        </nav>

        <span className="flex-1" />

        {port.mode === 'demo' && <DemoBadge />}
      </header>

      {children}
    </div>
  );
}

/**
 * 演示模式标注。必须持续可见 —— 用户在 GitHub Pages 上录半天数据然后刷新，
 * 数据没了才发现是演示模式，那是我们的错，不是他的。
 */
function DemoBadge() {
  return (
    <span
      className="flex items-center gap-1.5 rounded-md border border-warn/25 bg-warn-bg px-2 py-1 text-[11.5px] font-medium text-warn"
      title="演示模式下所有改动只存在于浏览器内存中，刷新页面即还原为初始数据。要保留数据请在本地运行（见 README）。"
    >
      <span aria-hidden className="size-1.5 rounded-full bg-warn" />
      演示模式 · 数据不持久
    </span>
  );
}
