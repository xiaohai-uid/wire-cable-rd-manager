import type { HeatmapCell, HeatmapMatrix, HeatmapRow } from '../domain/heatmap';
import { useDataPort } from './data-port-context';
import { useAsync } from './use-async';

/**
 * 首屏：`测试项 × 产品` 的不良率矩阵。
 *
 * 它取代 1.0 版的「四个大数字」。四个大数字只能告诉你「有 3 条不合格」，
 * 这张矩阵直接告诉你**是哪个产品的哪个测试项在出问题** —— 不用读数字，扫一眼颜色就够。
 */
export function HeatmapPage() {
  const port = useDataPort();
  const { state, reload } = useAsync(() => port.loadHeatmap(), [port]);

  return (
    <main className="mx-auto max-w-[1160px] px-5 pt-5 pb-24">
      {state.status === 'loading' && <LoadingState />}
      {state.status === 'error' && <ErrorState error={state.error} onRetry={reload} />}
      {state.status === 'ready' && <Matrix matrix={state.data} />}
    </main>
  );
}

/* ------------------------------------------------------------------ 三态 */

function LoadingState() {
  return (
    <div className="animate-pulse">
      <div className="h-5 w-28 rounded bg-zinc-200" />
      <div className="mt-2 h-3 w-72 rounded bg-zinc-100" />
      <div className="mt-4 flex gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 w-28 rounded-lg border border-line bg-panel" />
        ))}
      </div>
      <div className="mt-4 h-72 rounded-lg border border-line bg-panel" />
      <p className="mt-3 text-[12px] text-ink-3">正在读取质量数据…</p>
    </div>
  );
}

function ErrorState({ error, onRetry }: { readonly error: Error; readonly onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-fail/25 bg-fail-bg p-5">
      <h2 className="text-[13.5px] font-semibold text-fail">读取质量数据失败</h2>
      <p className="mt-1.5 text-[12.5px] text-ink-2">
        界面没有拿到数据，所以下面不显示任何数字 —— 显示一张空矩阵会让人误以为「没有不合格」。
      </p>
      <p className="tabular mt-2 rounded border border-fail/20 bg-panel px-2.5 py-1.5 text-[11.5px] text-ink-2">
        {error.message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded-md border border-line-strong bg-panel px-3 py-1.5 text-[12.5px] font-medium hover:bg-zinc-50"
      >
        重试
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-line bg-panel p-10 text-center">
      <h2 className="text-[13.5px] font-semibold">还没有测试模板</h2>
      <p className="mx-auto mt-1.5 max-w-md text-[12.5px] text-ink-2">
        质量矩阵的行来自各产品配置的测试项。先给产品配好测试模板（测什么、规格是多少），
        这里就会出现对应的行；录入测试数据后格子才会有颜色。
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ 矩阵 */

function Matrix({ matrix }: { readonly matrix: HeatmapMatrix }) {
  const { overall, products, rows } = matrix;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[17px] font-semibold tracking-tight">质量矩阵</h1>
          <p className="mt-0.5 text-[12px] text-ink-3">
            {overall.totalCount} 条记录 · {rows.length} 个测试项 × {products.length} 个产品 ·
            颜色深浅代表该组合的不良率
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-4">
        <Stat label="已判定记录" value={`${overall.judgedCount} / ${overall.totalCount}`} />
        <Stat label="合格" value={overall.judgedCount - overall.failCount} tone="pass" />
        <Stat label="不合格" value={overall.failCount} tone="fail" />
        <Stat
          label="总体不良率"
          value={formatRate(overall.defectRate)}
          tone={overall.failCount > 0 ? 'fail' : 'ink'}
        />
        {overall.unparseableCount > 0 && (
          <Stat label="规格无法识别" value={overall.unparseableCount} tone="warn" />
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="overflow-auto rounded-lg border border-line bg-panel">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 min-w-[190px] border-b border-line bg-panel px-3 py-2 text-left text-[11px] font-semibold tracking-wide text-ink-3">
                    测试项目
                  </th>
                  {products.map((model) => (
                    <th
                      key={model}
                      className="tabular min-w-[112px] border-b border-line bg-panel px-2 py-2 text-center text-[11px] font-semibold whitespace-nowrap text-ink-3"
                    >
                      {model}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <MatrixRow key={row.testItem} row={row} />
                ))}
              </tbody>
            </table>
          </div>
          <Legend />
        </>
      )}
    </>
  );
}

function MatrixRow({ row }: { readonly row: HeatmapRow }) {
  return (
    <tr className="group">
      <th
        scope="row"
        className="sticky left-0 z-10 border-r border-b border-line bg-panel px-3 py-1 text-left font-normal group-hover:bg-zinc-50/80"
      >
        <span className="flex items-baseline gap-2">
          <span className="text-[12.5px] font-medium">{row.testItem}</span>
          {row.isQualitative && (
            <span
              className="rounded bg-zinc-100 px-1 py-px text-[10px] font-medium text-ink-3"
              title="定性项：由人工给出合格 / 不合格结论，系统不从测量值推断"
            >
              定性
            </span>
          )}
          <span className="flex-1" />
          <span
            className={`tabular text-[11px] ${row.failCount > 0 ? 'text-fail' : 'text-ink-3'}`}
            title={`该测试项全部产品合计：${row.failCount} 次不合格 / ${row.judgedCount} 次已判定`}
          >
            {row.judgedCount === 0 ? '未测' : `${formatRate(row.defectRate)} · ${row.failCount}/${row.judgedCount}`}
          </span>
        </span>
      </th>

      {row.cells.map((cell) => (
        <td key={cell.productModel} className="border-b border-line/60 p-1 align-middle">
          <Cell cell={cell} />
        </td>
      ))}
    </tr>
  );
}

function Cell({ cell }: { readonly cell: HeatmapCell }) {
  const recordCount = cell.judgedCount + cell.unjudgedCount + cell.unparseableCount;

  // 「这个产品没配这一项」和「配了、测了、零不合格」是两件完全不同的事，
  // 混在一起看会把「漏测」读成「没问题」。所以前者留白+虚线，后者给浅绿+✓。
  // 只有「没配且一条记录都没有」才算不适用 —— 否则会把有记录的异常情况藏起来。
  if (!cell.configured && recordCount === 0) {
    return (
      <div
        className="flex h-[38px] items-center justify-center rounded-[5px] bg-heat-na text-zinc-300"
        title={`不适用：${cell.productModel} 的测试模板里没有「${cell.testItem}」这一项`}
      >
        {/* 弱化到几乎看不见 —— 21×5 的矩阵里若每个空格都写「不适用」，热点就被文字盖住了 */}
        <span aria-hidden>–</span>
        <span className="sr-only">不适用</span>
      </div>
    );
  }

  if (cell.judgedCount === 0) {
    return (
      <div
        className="flex h-[38px] items-center justify-center rounded-[5px] border border-dashed border-line-strong text-[11px] text-ink-3"
        title={
          cell.unparseableCount > 0
            ? `${cell.unparseableCount} 条记录的规格无法识别，系统拒绝判定`
            : `已配置这一项，但还没有已判定的测试记录（未填测量值的记录 ${cell.unjudgedCount} 条）`
        }
      >
        {cell.unparseableCount > 0 ? '规格?' : '未测'}
      </div>
    );
  }

  const level = heatLevel(cell.defectRate);
  return (
    <div
      className={`flex h-[38px] flex-col items-center justify-center rounded-[5px] ${level.className}`}
      title={`${cell.testItem} · ${cell.productModel}：${cell.failCount} 次不合格 / ${cell.judgedCount} 次已判定`}
    >
      <span className="tabular text-[12px] leading-none font-semibold">
        {cell.failCount === 0 ? '✓' : formatRate(cell.defectRate)}
      </span>
      {/* 分母必须露出来：1/1 和 12/12 都是 100%，但严重程度完全不同 */}
      <span className="tabular mt-0.5 text-[9.5px] leading-none opacity-70">
        {cell.failCount}/{cell.judgedCount}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ 小件 */

function Stat({
  label,
  value,
  tone = 'ink',
}: {
  readonly label: string;
  readonly value: string | number;
  readonly tone?: 'ink' | 'pass' | 'fail' | 'warn';
}) {
  const color = {
    ink: 'text-ink',
    pass: 'text-pass',
    fail: 'text-fail',
    warn: 'text-warn',
  }[tone];

  return (
    <div className="min-w-[116px] rounded-lg border border-line bg-panel px-4 py-2.5">
      <div className="text-[10.5px] tracking-wide text-ink-3">{label}</div>
      <div className={`tabular mt-0.5 text-[22px] leading-tight font-semibold ${color}`}>
        {value}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-ink-3">
      <span className="flex items-center gap-1.5">
        <Swatch className="bg-heat-0 text-pass">✓</Swatch> 零不合格
      </span>
      <span className="flex items-center gap-1.5">
        <Swatch className="bg-heat-1" /> ≤34%
      </span>
      <span className="flex items-center gap-1.5">
        <Swatch className="bg-heat-2" /> 35–67%
      </span>
      <span className="flex items-center gap-1.5">
        <Swatch className="bg-heat-3" /> &gt;67%
      </span>
      <span className="flex items-center gap-1.5">
        <Swatch className="border border-dashed border-line-strong bg-panel" /> 已配置未测
      </span>
      <span className="flex items-center gap-1.5">
        <Swatch className="bg-heat-na" /> 该产品无此项
      </span>
      <span className="text-ink-3/80">格子里的小字是「不合格次数 / 已判定次数」</span>
    </div>
  );
}

function Swatch({
  className,
  children,
}: {
  readonly className: string;
  readonly children?: React.ReactNode;
}) {
  return (
    <span
      aria-hidden
      className={`inline-flex size-4 items-center justify-center rounded-[3px] text-[9px] font-bold ${className}`}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ 纯函数 */

/** 四档色阶。档位边界必须和图例文案一致，改这里就得改 Legend。 */
function heatLevel(rate: number | null): { readonly className: string } {
  if (rate === null || rate === 0) return { className: 'bg-heat-0 text-pass' };
  if (rate <= 0.34) return { className: 'bg-heat-1 text-fail' };
  if (rate <= 0.67) return { className: 'bg-heat-2 text-red-900' };
  return { className: 'bg-heat-3 text-white' };
}

function formatRate(rate: number | null): string {
  // 分母为 0 时不良率是 null。显示 0% 会被读成「测过、没问题」，那是撒谎。
  if (rate === null) return '—';
  if (rate === 0) return '0%';
  const pct = rate * 100;
  return `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`;
}
