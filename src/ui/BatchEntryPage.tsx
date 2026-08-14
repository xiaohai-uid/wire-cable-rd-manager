import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ClipboardEvent, KeyboardEvent, MutableRefObject } from 'react';
import { parseSpec } from '../domain/spec';
import { resolveJudgment } from '../domain/judgment';
import { parseTableClipboard } from '../entry/paste';
import type { Judgment, ManualJudgment, MeasurementValues } from '../domain/types';
import { DataPortError, type BatchDraft } from '../ports/data-port';
import { useDataPort } from './data-port-context';
import { useUrlState } from './use-url-state';
import { navigationGuard } from './navigation-guard';

/**
 * 批次录入网格（工单 04）。
 *
 * 取代 1.0 版「录一个批次开 12 次模态框」的方式：选定产品和批号后，测试模板决定
 * 网格铺出多少行，每行一个测试项 + 三次测量。像电子表格一样 Tab / Enter / 方向键走位，
 * 支持从 Excel 粘贴一整块。每行填完立刻显示平均值与判定，当场发现异常值。
 *
 * 整批一次性保存，写入由 DataPort 保证原子（一次全成功或一次全失败，不出现「录了一半」）。
 */
export function BatchEntryPage() {
  const port = useDataPort();
  const { params, setParams } = useUrlState();

  const [productModel, setProductModel] = useState(params.product ?? '');
  const [batchNo, setBatchNo] = useState(params.batch ?? '');
  const [testDate, setTestDate] = useState(todayISO());
  const [tester, setTester] = useState('');
  const [rows, setRows] = useState<GridRow[]>([]);
  const [existingBatches, setExistingBatches] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' });

  const inputRefs = useRef(new Map<string, HTMLInputElement | null>());
  const numericRowIndexes = useMemo(
    () => rows.map((r, i) => (r.isQualitative ? -1 : i)).filter((i) => i >= 0),
    [rows],
  );
  const locateItem = params.item;

  /** 按产品 + 批号载入：模板铺行；若批号对应已有台账，则带出原数据（编辑模式）。 */
  const load = useCallback(
    async (product: string, batch: string) => {
      if (product.trim() === '') {
        setRows([]);
        setExistingBatches([]);
        setDirty(false);
        return;
      }
      const [templates, existing, batches] = await Promise.all([
        port.listTemplates(product),
        batch.trim() === ''
          ? Promise.resolve([])
          : port.listRecords({ productModel: product, batchNo: batch }),
        port.listBatchNos(product),
      ]);

      const byItem = new Map(existing.map((r) => [r.testItem, r]));
      const nextRows: GridRow[] = templates.map((t) => {
        const rec = byItem.get(t.testItem);
        return {
          testItem: t.testItem,
          spec: t.spec,
          isQualitative: parseSpec(t.spec).kind === 'qualitative',
          rawValues: rec
            ? rec.values.map((v) => (v === null ? '' : String(v)))
            : ['', '', ''],
          manualJudgment: rec?.manualJudgment ?? null,
          remark: rec?.remark ?? '',
        };
      });

      setRows(nextRows);
      setExistingBatches([...batches]);
      const first = existing[0];
      if (first) {
        setTestDate(first.testDate);
        setTester(first.tester);
      }
      setDirty(false);
      setStatus({ kind: 'idle' });
    },
    [port],
  );

  // 挂载时按 URL 初始值载入一次（从明细跳入、或顶栏「录入」带 product+batch 进来）
  useEffect(() => {
    void load(params.product ?? '', params.batch ?? '');
    // 仅在挂载时跑；产品 / 批号的后续切换由对应 onChange 显式触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onProductChange = (model: string) => {
    setProductModel(model);
    setBatchNo('');
    void load(model, '');
  };

  const onPickBatch = (b: string) => {
    setBatchNo(b);
    void load(productModel, b);
  };

  const editRow = (index: number, patch: Partial<GridRow>) => {
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  const setCell = (index: number, col: number, raw: string) => {
    setRows((rs) =>
      rs.map((r, i) => {
        if (i !== index) return r;
        const next = [...r.rawValues];
        next[col] = raw;
        return { ...r, rawValues: next };
      }),
    );
    setDirty(true);
  };

  const focusCell = (rowIndex: number, col: number) => {
    inputRefs.current.get(`${rowIndex}:${col}`)?.focus();
  };

  const onCellKeyDown = (
    e: KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    col: number,
  ) => {
    const pos = numericRowIndexes.indexOf(rowIndex);
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      focusCell(numericRowIndexes[pos + 1] ?? rowIndex, col);
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      focusCell(numericRowIndexes[pos - 1] ?? rowIndex, col);
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' && col > 0) {
      focusCell(rowIndex, col - 1);
      e.preventDefault();
    } else if (e.key === 'ArrowRight' && col < 2) {
      focusCell(rowIndex, col + 1);
      e.preventDefault();
    }
  };

  const onCellPaste = (
    e: ClipboardEvent<HTMLInputElement>,
    rowIndex: number,
    col: number,
  ) => {
    const text = e.clipboardData.getData('text');
    if (text.trim() === '') return;
    const matrix = parseTableClipboard(text);
    if (matrix.length === 0) return;
    e.preventDefault();
    setRows((rs) => {
      const next = rs.map((r) => ({ ...r, rawValues: [...r.rawValues] }));
      for (let dr = 0; dr < matrix.length; dr++) {
        const r = rowIndex + dr;
        if (r >= next.length) break;
        const row = next[r];
        if (!row || row.isQualitative) continue;
        const srcRow = matrix[dr];
        if (!srcRow) continue;
        for (let dc = 0; dc < srcRow.length; dc++) {
          const c = col + dc;
          if (c > 2) break;
          const cell = srcRow[dc];
          if (cell === undefined) continue;
          row.rawValues[c] = cell;
        }
      }
      return next;
    });
    setDirty(true);
  };

  const summary = useMemo(() => {
    let pass = 0;
    let fail = 0;
    let unjudged = 0;
    let unparseable = 0;
    for (const r of rows) {
      const jr = resolveJudgment({
        spec: r.spec,
        values: toValues(r.rawValues),
        manualJudgment: r.manualJudgment,
      });
      if (jr.judgment === 'pass') pass++;
      else if (jr.judgment === 'fail') fail++;
      else if (jr.judgment === 'unparseable') unparseable++;
      else unjudged++;
    }
    return { pass, fail, unjudged, unparseable, total: rows.length };
  }, [rows]);

  const onSave = async () => {
    if (productModel.trim() === '' || batchNo.trim() === '') {
      setStatus({ kind: 'error', message: '请先选择产品并填写批号' });
      return;
    }
    const draft: BatchDraft = {
      productModel,
      batchNo: batchNo.trim(),
      testDate,
      tester: tester.trim(),
      entries: rows.map((r) => ({
        testItem: r.testItem,
        spec: r.spec,
        values: toValues(r.rawValues),
        manualJudgment: r.manualJudgment,
        remark: r.remark.trim(),
      })),
    };
    setStatus({ kind: 'saving' });
    try {
      await port.saveBatch(draft);
      setDirty(false);
      setStatus({ kind: 'saved' });
      setExistingBatches([... (await port.listBatchNos(productModel))]);
    } catch (e) {
      const message = e instanceof DataPortError ? e.message : '保存失败，请重试';
      setStatus({ kind: 'error', message });
    }
  };

  // 未保存修改 → 关页面/刷新提醒 + SPA 内部导航守卫
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    navigationGuard.canLeave = () => !dirty;
    return () => {
      window.removeEventListener('beforeunload', handler);
      navigationGuard.canLeave = () => true;
    };
  }, [dirty]);

  // 从明细跳入时定位到指定测试项行
  useEffect(() => {
    if (!locateItem) return;
    const idx = rows.findIndex((r) => r.testItem === locateItem);
    if (idx < 0) return;
    const el =
      inputRefs.current.get(`${idx}:0`) ?? document.getElementById(`row-${idx}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [locateItem, rows]);

  const goBack = () => {
    if (dirty && !window.confirm('有未保存的修改，确定离开吗？修改将丢失。')) return;
    setParams({ page: undefined, product: undefined, item: undefined, batch: undefined });
  };

  if (productModel.trim() === '') {
    return <ProductPicker port={port} onPick={(m) => onProductChange(m)} />;
  }

  return (
    <main className="mx-auto max-w-[1160px] px-5 pt-5 pb-28">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={goBack}
            className="mb-1 text-[12px] text-ink-3 hover:text-ink"
          >
            ← 返回质量矩阵
          </button>
          <h1 className="text-[17px] font-semibold tracking-tight">批次录入</h1>
        </div>
      </div>

      {/* 表头：产品 / 批号 / 日期 / 测试员 */}
      <div className="mb-3 flex flex-wrap items-end gap-x-4 gap-y-2 rounded-lg border border-line bg-panel p-3">
        <label className="flex flex-col gap-1 text-[11px] text-ink-3">
          产品
          <ProductSelect
            value={productModel}
            onChange={onProductChange}
            port={port}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-ink-3">
          批号
          <input
            value={batchNo}
            onChange={(e) => {
              setBatchNo(e.target.value);
              setDirty(true);
            }}
            placeholder="如 RV-20260603"
            className="h-7 w-44 rounded-md border border-line bg-panel px-2 text-[12.5px] text-ink"
          />
        </label>
        {existingBatches.includes(batchNo.trim()) && batchNo.trim() !== '' && (
          <span className="self-center text-[11px] text-warn">已有批次 · 点「载入」可编辑</span>
        )}
        <label className="flex flex-col gap-1 text-[11px] text-ink-3">
          测试日期
          <input
            type="date"
            value={testDate}
            onChange={(e) => {
              setTestDate(e.target.value);
              setDirty(true);
            }}
            className="h-7 rounded-md border border-line bg-panel px-2 text-[12.5px] text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-ink-3">
          测试员
          <input
            value={tester}
            onChange={(e) => {
              setTester(e.target.value);
              setDirty(true);
            }}
            className="h-7 w-24 rounded-md border border-line bg-panel px-2 text-[12.5px] text-ink"
          />
        </label>
        <button
          type="button"
          onClick={() => void load(productModel, batchNo.trim())}
          className="self-center rounded-md border border-line-strong bg-panel px-3 py-1 text-[12px] font-medium hover:bg-zinc-50"
        >
          载入
        </button>
        {existingBatches.length > 0 && (
          <div className="flex w-full flex-wrap items-center gap-1.5 text-[11px] text-ink-3">
            已有批次：
            {existingBatches.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => onPickBatch(b)}
                className="rounded border border-line bg-zinc-50 px-1.5 py-0.5 tabular hover:bg-zinc-100"
              >
                {b}
              </button>
            ))}
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-line bg-panel p-6 text-center text-[12.5px] text-ink-3">
          该产品还没有测试模板，先去「产品与模板管理」配好测试项，这里才会铺出对应的行。
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-panel">
          <table className="w-full border-collapse">
            <thead>
              <tr className="[&>th]:border-b [&>th]:border-line [&>th]:px-2 [&>th]:py-1.5 [&>th]:text-left [&>th]:text-[11px] [&>th]:font-semibold [&>th]:whitespace-nowrap [&>th]:text-ink-3">
                <th>测试项</th>
                <th>规格</th>
                <th className="text-right">值 1</th>
                <th className="text-right">值 2</th>
                <th className="text-right">值 3</th>
                <th className="text-right">平均</th>
                <th>判定</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <GridRowView
                  key={row.testItem}
                  rowIndex={i}
                  row={row}
                  locate={locateItem === row.testItem}
                  inputRefs={inputRefs}
                  onCell={setCell}
                  onKeyDown={onCellKeyDown}
                  onPaste={onCellPaste}
                  onManual={(m) => editRow(i, { manualJudgment: m })}
                  onRemark={(v) => editRow(i, { remark: v })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SaveBar status={status} dirty={dirty} summary={summary} onSave={onSave} sticky />
    </main>
  );
}

/* ----------------------------------------------------------- 单行 */

function GridRowView({
  rowIndex,
  row,
  locate,
  inputRefs,
  onCell,
  onKeyDown,
  onPaste,
  onManual,
  onRemark,
}: {
  readonly rowIndex: number;
  readonly row: GridRow;
  readonly locate: boolean;
  readonly inputRefs: MutableRefObject<Map<string, HTMLInputElement | null>>;
  readonly onCell: (index: number, col: number, raw: string) => void;
  readonly onKeyDown: (
    e: KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    col: number,
  ) => void;
  readonly onPaste: (
    e: ClipboardEvent<HTMLInputElement>,
    rowIndex: number,
    col: number,
  ) => void;
  readonly onManual: (m: ManualJudgment) => void;
  readonly onRemark: (v: string) => void;
}) {
  const jr = resolveJudgment({
    spec: row.spec,
    values: toValues(row.rawValues),
    manualJudgment: row.manualJudgment,
  });
  const isFail = jr.judgment === 'fail';

  return (
    <tr
      id={`row-${rowIndex}`}
      className={`[&>td]:border-b [&>td]:border-line/50 [&>td]:px-2 [&>td]:py-1 ${
        locate ? 'bg-accent-soft' : isFail ? 'bg-fail-bg/60' : 'hover:bg-zinc-50/70'
      }`}
    >
      <td className="text-[12.5px] font-medium">
        {row.testItem}
        {row.isQualitative && (
          <span className="ml-1.5 rounded bg-zinc-100 px-1 py-px text-[10px] text-ink-3">
            定性
          </span>
        )}
      </td>
      <td className="tabular whitespace-nowrap text-[11.5px] text-ink-2">{row.spec}</td>

      {row.isQualitative ? (
        <td colSpan={3} className="py-1">
          <div className="flex gap-1.5">
            <ManualButton
              active={row.manualJudgment === 'pass'}
              label="合格"
              tone="pass"
              onClick={() => onManual('pass')}
            />
            <ManualButton
              active={row.manualJudgment === 'fail'}
              label="不合格"
              tone="fail"
              onClick={() => onManual('fail')}
            />
          </div>
        </td>
      ) : (
        row.rawValues.map((raw, c) => (
          <td key={c} className="p-1">
            <input
              ref={(el) => {
                if (el) inputRefs.current.set(`${rowIndex}:${c}`, el);
                else inputRefs.current.delete(`${rowIndex}:${c}`);
              }}
              value={raw}
              onChange={(e) => onCell(rowIndex, c, e.target.value)}
              onKeyDown={(e) => onKeyDown(e, rowIndex, c)}
              onPaste={(e) => onPaste(e, rowIndex, c)}
              inputMode="decimal"
              className="tabular h-7 w-[68px] rounded border border-line bg-panel px-1.5 text-right text-[12.5px] text-ink focus:border-accent focus:outline-none"
            />
          </td>
        ))
      )}

      <td className="tabular text-right text-[12.5px]">
        {jr.average === null ? <span className="text-zinc-300">–</span> : jr.average}
      </td>
      <td>
        <JudgmentTag judgment={jr.judgment} />
      </td>
      <td className="p-1">
        <input
          value={row.remark}
          onChange={(e) => onRemark(e.target.value)}
          placeholder="备注"
          className="h-7 w-28 rounded border border-line bg-panel px-1.5 text-[11.5px] text-ink focus:border-accent focus:outline-none"
        />
      </td>
    </tr>
  );
}

function ManualButton({
  active,
  label,
  tone,
  onClick,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly tone: 'pass' | 'fail';
  readonly onClick: () => void;
}) {
  const cls =
    tone === 'pass'
      ? active
        ? 'bg-pass-bg text-pass border-pass'
        : 'border-line text-ink-3 hover:bg-zinc-50'
      : active
        ? 'bg-fail-bg text-fail border-fail'
        : 'border-line text-ink-3 hover:bg-zinc-50';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded border px-2 py-0.5 text-[11.5px] font-medium ${cls}`}
    >
      {label}
    </button>
  );
}

/* ----------------------------------------------------------- 小件 */

function JudgmentTag({ judgment }: { readonly judgment: Judgment }) {
  const style: Record<Judgment, string> = {
    pass: 'bg-pass-bg text-pass',
    fail: 'bg-fail-bg text-fail',
    unjudged: 'bg-zinc-100 text-ink-3',
    unparseable: 'bg-warn-bg text-warn',
  };
  const label: Record<Judgment, string> = {
    pass: '合格',
    fail: '不合格',
    unjudged: '未判定',
    unparseable: '规格无法识别',
  };
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-px text-[11px] font-semibold whitespace-nowrap ${style[judgment]}`}
    >
      {label[judgment]}
    </span>
  );
}

function SaveBar({
  status,
  dirty,
  summary,
  onSave,
  sticky,
}: {
  readonly status: SaveStatus;
  readonly dirty: boolean;
  readonly summary: { pass: number; fail: number; unjudged: number; unparseable: number };
  readonly onSave: () => void;
  readonly sticky?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 ${
        sticky ? 'sticky bottom-0 mt-4 rounded-lg border border-line bg-panel px-4 py-2.5 shadow-sm' : ''
      }`}
    >
      <div className="flex gap-3 text-[11.5px]">
        <span className="text-pass">合格 {summary.pass}</span>
        <span className="text-fail">不合格 {summary.fail}</span>
        <span className="text-ink-3">未判定 {summary.unjudged}</span>
        {summary.unparseable > 0 && (
          <span className="text-warn">无法识别 {summary.unparseable}</span>
        )}
      </div>
      <span className="flex-1" />
      {status.kind === 'error' && (
        <span className="text-[12px] text-fail">{status.message}</span>
      )}
      {status.kind === 'saved' && <span className="text-[12px] text-pass">已保存</span>}
      {dirty && status.kind !== 'saved' && (
        <span className="text-[11.5px] text-warn">有未保存修改</span>
      )}
      <button
        type="button"
        onClick={onSave}
        disabled={status.kind === 'saving'}
        className="rounded-md bg-accent px-4 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-60"
      >
        {status.kind === 'saving' ? '保存中…' : '整批保存'}
      </button>
    </div>
  );
}

function ProductSelect({
  value,
  onChange,
  port,
}: {
  readonly value: string;
  readonly onChange: (model: string) => void;
  readonly port: ReturnType<typeof useDataPort>;
}) {
  const [products, setProducts] = useState<{ model: string; name: string }[]>([]);
  useEffect(() => {
    void port.listProducts().then((ps) =>
      setProducts(ps.map((p) => ({ model: p.model, name: p.name }))),
    );
  }, [port]);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 w-44 rounded-md border border-line bg-panel px-2 text-[12.5px] text-ink"
    >
      <option value="">选择产品…</option>
      {products.map((p) => (
        <option key={p.model} value={p.model}>
          {p.model} · {p.name}
        </option>
      ))}
    </select>
  );
}

function ProductPicker({
  port,
  onPick,
}: {
  readonly port: ReturnType<typeof useDataPort>;
  readonly onPick: (model: string) => void;
}) {
  const [products, setProducts] = useState<{ model: string; name: string }[]>([]);
  useEffect(() => {
    void port.listProducts().then((ps) =>
      setProducts(ps.map((p) => ({ model: p.model, name: p.name }))),
    );
  }, [port]);
  return (
    <main className="mx-auto max-w-[760px] px-5 pt-16 pb-24 text-center">
      <h1 className="text-[18px] font-semibold tracking-tight">批次录入</h1>
      <p className="mt-1 text-[12.5px] text-ink-3">先选一个产品，系统按它的测试模板铺出录入行。</p>
      <div className="mt-5 flex flex-col gap-2">
        {products.map((p) => (
          <button
            key={p.model}
            type="button"
            onClick={() => onPick(p.model)}
            className="rounded-lg border border-line bg-panel px-4 py-3 text-left hover:bg-zinc-50"
          >
            <div className="text-[13.5px] font-medium">{p.model}</div>
            <div className="text-[12px] text-ink-3">{p.name}</div>
          </button>
        ))}
      </div>
    </main>
  );
}

/* ----------------------------------------------------------- 类型与工具 */

interface GridRow {
  readonly testItem: string;
  readonly spec: string;
  readonly isQualitative: boolean;
  readonly rawValues: string[];
  readonly manualJudgment: ManualJudgment | null;
  readonly remark: string;
}

type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string };

/** 文本单元格 → 数值（0 是合法值，只有空串算未填）。解析不出的（如 "0."）按未填处理。 */
function toValues(raw: readonly string[]): MeasurementValues {
  return raw.map((s) => {
    const t = s.trim();
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
