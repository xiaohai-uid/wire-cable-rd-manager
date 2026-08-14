import { SEED_PRODUCTS, SEED_RECORDS, SEED_TEMPLATES } from './data/seed';
import { buildHeatmap } from './domain/heatmap';

/**
 * 工单 01 的临时外壳：只证明「领域核心 → React → Tailwind」这条线是通的。
 * 工单 02 会用真正的热力图首页替换掉整个文件。
 */
export function App() {
  const matrix = buildHeatmap({
    products: SEED_PRODUCTS,
    templates: SEED_TEMPLATES,
    records: SEED_RECORDS,
  });

  const { overall } = matrix;
  const rate = overall.defectRate === null ? '—' : `${(overall.defectRate * 100).toFixed(2)}%`;

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-xl font-semibold">线材研发管理系统 2.0</h1>
      <p className="mt-2 text-sm text-slate-500">
        地基自检 —— 判定引擎已在 {SEED_RECORDS.length} 条真实记录上跑通。
      </p>

      <dl className="mt-8 grid grid-cols-2 gap-4 text-sm">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <dt className="text-slate-500">已判定 / 总记录</dt>
          <dd className="tabular mt-1 text-lg">
            {overall.judgedCount} / {overall.totalCount}
          </dd>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <dt className="text-slate-500">不合格数</dt>
          <dd className="tabular mt-1 text-lg text-rose-600">{overall.failCount}</dd>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <dt className="text-slate-500">总体不良率</dt>
          <dd className="tabular mt-1 text-lg">{rate}</dd>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <dt className="text-slate-500">矩阵规模</dt>
          <dd className="tabular mt-1 text-lg">
            {matrix.rows.length} 项 × {matrix.products.length} 产品
          </dd>
        </div>
      </dl>
    </main>
  );
}
