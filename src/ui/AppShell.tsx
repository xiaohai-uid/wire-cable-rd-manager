import type { ReactNode } from 'react';
import type { UrlState } from './use-url-state';
import { useDataPort } from './data-port-context';
import { navigationGuard } from './navigation-guard';

/**
 * 共享外壳：顶栏 + 内容区。
 * 顶栏是唯一跨页面共享的结构，各页面自己决定内部布局（沿用原型的做法）。
 *
 * 这里也负责页面切换的守卫：切换到「质量矩阵」或「录入」前，若录入网格有未保存
 * 修改，先跟用户确认，避免一眨眼丢掉刚录的一屏数据。
 */
export function AppShell({
  url,
  children,
}: {
  readonly url: UrlState;
  readonly children: ReactNode;
}) {
  const port = useDataPort();
  const onBatch = url.params.page === 'batch';

  const navigate = (patch: Record<string, string | undefined>) => {
    if (
      !navigationGuard.canLeave() &&
      !window.confirm('有未保存的修改，确定离开吗？修改将丢失。')
    ) {
      return;
    }
    url.setParams(patch);
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 flex h-11 items-center gap-5 border-b border-line bg-panel px-4">
        <span className="text-[13.5px] font-semibold tracking-tight whitespace-nowrap">
          线材研发<span className="text-accent">管理</span>
        </span>

        <nav className="flex gap-0.5">
          <TabButton
            active={!onBatch}
            onClick={() =>
              navigate({ page: undefined, product: undefined, item: undefined, batch: undefined })
            }
          >
            质量矩阵
          </TabButton>
          <TabButton active={onBatch} onClick={() => navigate({ page: 'batch' })}>
            录入
          </TabButton>
        </nav>

        <span className="flex-1" />

        {port.mode === 'demo' && <DemoBadge />}
      </header>

      {children}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-[12.5px] font-semibold ${
        active ? 'bg-zinc-100 text-ink' : 'text-ink-3 hover:bg-zinc-50'
      }`}
    >
      {children}
    </button>
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
