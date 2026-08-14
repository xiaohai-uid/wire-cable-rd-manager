import { useEffect, useState } from 'react';
import type { Product } from '../domain/types';
import { describeRule, parseSpec } from '../domain/spec';
import { isDataPortError, type DataPort } from '../ports/data-port';
import { useDataPort } from './data-port-context';
import { useAsync } from './use-async';
import { useUrlState } from './use-url-state';
import { navigationGuard } from './navigation-guard';
import {
  type TemplateRow,
  moveRow,
  newRow,
  toDrafts,
  toRows,
  validateTemplates,
} from '../entry/template-editor';

/**
 * 产品与测试模板管理。
 *
 * 这条页面要解决 1.0 版一个隐蔽的坑：规格写错了，系统却闷声用错阈值判合格/不合格，
 * 直到出质量事故才被发现。所以这里的头号规则是 —— **编辑规格的当下就把系统读到的判定规则显示出来**，
 * 规格无法识别则当场拦住、不让保存（validateTemplates 在保存按钮之前就挡）。
 *
 * 路由走 URL：page=manage 是产品列表，page=manage&product=MODEL 是某个产品的编辑台。
 * 切页走顶栏「维护」页签，未保存修改由 navigationGuard 拦一道。
 */
export function ProductsPage() {
  const { params, setParams } = useUrlState();

  if (params.product !== undefined) {
    return (
      <ProductEditor
        model={params.product}
        onBack={() => setParams({ product: undefined })}
      />
    );
  }
  return <Catalog onOpen={(model) => setParams({ product: model })} />;
}

/* ------------------------------------------------------------------ 列表 */

interface CatalogRow {
  readonly product: Product;
  readonly templateCount: number;
  readonly recordCount: number;
}

async function loadCatalog(port: DataPort): Promise<CatalogRow[]> {
  const products = await port.listProducts();
  return Promise.all(
    products.map(async (product) => ({
      product,
      templateCount: (await port.listTemplates(product.model)).length,
      recordCount: (await port.listRecords({ productModel: product.model })).length,
    })),
  );
}

function Catalog({ onOpen }: { readonly onOpen: (model: string) => void }) {
  const port = useDataPort();
  const { state, reload } = useAsync(() => loadCatalog(port), [port]);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<CatalogRow | null>(null);

  return (
    <main className="mx-auto max-w-[980px] px-5 pt-5 pb-24">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[17px] font-semibold tracking-tight">产品与测试模板</h1>
          <p className="mt-0.5 text-[12px] text-ink-3">
            维护产品档案，以及每个产品「测什么、规格是多少」。测试模板决定录入网格铺几行。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90"
        >
          + 新增产品
        </button>
      </div>

      {state.status === 'loading' && <p className="text-[12px] text-ink-3">正在读取产品列表…</p>}
      {state.status === 'error' && (
        <div className="rounded-lg border border-fail/25 bg-fail-bg p-4 text-[12.5px] text-fail">
          {state.error.message}
        </div>
      )}

      {state.status === 'ready' && (
        <div className="overflow-hidden rounded-lg border border-line bg-panel">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-line text-left text-[11px] font-semibold tracking-wide text-ink-3">
                <th className="px-3 py-2">型号</th>
                <th className="px-3 py-2">名称</th>
                <th className="px-3 py-2 text-right">模板项</th>
                <th className="px-3 py-2 text-right">台账记录</th>
                <th className="px-3 py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {state.data.map(({ product, templateCount, recordCount }) => (
                <tr key={product.model} className="border-b border-line/60 last:border-0">
                  <td className="tabular px-3 py-2 text-[12.5px] font-medium">{product.model}</td>
                  <td className="px-3 py-2 text-[12.5px] text-ink-2">{product.name}</td>
                  <td className="tabular px-3 py-2 text-right text-[12.5px]">{templateCount}</td>
                  <td className="tabular px-3 py-2 text-right text-[12.5px]">{recordCount}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onOpen(product.model)}
                      className="rounded-md px-2 py-1 text-[12px] font-medium text-accent hover:bg-accent-soft"
                    >
                      编辑模板
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(product)}
                      className="rounded-md px-2 py-1 text-[12px] font-medium text-ink-2 hover:bg-zinc-50"
                    >
                      编辑信息
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting({ product, templateCount, recordCount })}
                      className="rounded-md px-2 py-1 text-[12px] font-medium text-fail hover:bg-fail-bg"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <ProductFormModal
          mode="create"
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            reload();
          }}
        />
      )}
      {editing && (
        <ProductFormModal
          mode="edit"
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
      {deleting && (
        <DeleteConfirmModal
          row={deleting}
          onCancel={() => setDeleting(null)}
          onConfirmed={() => {
            setDeleting(null);
            reload();
          }}
        />
      )}
    </main>
  );
}

/* ------------------------------------------------------------- 产品表单弹窗 */

function ProductFormModal({
  mode,
  initial,
  onClose,
  onSaved,
}: {
  readonly mode: 'create' | 'edit';
  readonly initial?: Product;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const port = useDataPort();
  const [model, setModel] = useState(initial?.model ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [drawingNo, setDrawingNo] = useState(initial?.drawingNo ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSave() {
    setError(null);
    setBusy(true);
    try {
      if (mode === 'create') {
        await port.createProduct({ model: model.trim(), name, drawingNo, description });
      } else if (initial) {
        await port.updateProduct(initial.model, { name, drawingNo, description });
      }
      onSaved();
    } catch (e) {
      setError(isDataPortError(e) ? e.message : `保存失败：${String(e)}`);
      setBusy(false);
    }
  }

  return (
    <ModalShell title={mode === 'create' ? '新增产品' : '编辑产品信息'} onClose={onClose}>
      <div className="space-y-3">
        <Field label="型号">
          {mode === 'create' ? (
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="如 RV-0.5"
              className={inputCls}
            />
          ) : (
            <div className="tabular rounded-md border border-line bg-zinc-50 px-3 py-1.5 text-[12.5px] text-ink-2">
              {model}
            </div>
          )}
        </Field>
        <Field label="名称">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如 RV 0.5mm2 多股软电线"
            className={inputCls}
          />
        </Field>
        <Field label="图纸编号">
          <input
            value={drawingNo}
            onChange={(e) => setDrawingNo(e.target.value)}
            placeholder="如 DRG-RV-0.5-V2.1"
            className={inputCls}
          />
        </Field>
        <Field label="说明">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="标准、用途等"
            className={inputCls}
          />
        </Field>

        {error && (
          <p className="rounded border border-fail/25 bg-fail-bg px-2.5 py-1.5 text-[11.5px] text-fail">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-line-strong bg-panel px-3 py-1.5 text-[12.5px] font-medium hover:bg-zinc-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={busy}
            className="rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

/* ----------------------------------------------------------- 删除确认弹窗 */

function DeleteConfirmModal({
  row,
  onCancel,
  onConfirmed,
}: {
  readonly row: CatalogRow;
  readonly onCancel: () => void;
  readonly onConfirmed: () => void;
}) {
  const port = useDataPort();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setBusy(true);
    setError(null);
    try {
      await port.deleteProduct(row.product.model);
      onConfirmed();
    } catch (e) {
      setError(isDataPortError(e) ? e.message : `删除失败：${String(e)}`);
      setBusy(false);
    }
  }

  return (
    <ModalShell
      title="删除产品"
      onClose={busy ? () => {} : onCancel}
    >
      <p className="text-[12.5px] text-ink-2">
        确定删除产品 <span className="tabular font-semibold text-ink">{row.product.model}</span> 吗？
      </p>
      <div className="mt-3 rounded-md border border-line bg-zinc-50 px-3 py-2 text-[12px] text-ink-2">
        将一并删除：
        <span className="tabular ml-1 font-semibold text-ink">{row.templateCount}</span> 条测试模板、
        <span className="tabular ml-1 font-semibold text-ink">{row.recordCount}</span> 条测试台账记录。
        此操作不可撤销，且不留孤儿记录。
      </div>
      {error && (
        <p className="mt-3 rounded border border-fail/25 bg-fail-bg px-2.5 py-1.5 text-[11.5px] text-fail">
          {error}
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-md border border-line-strong bg-panel px-3 py-1.5 text-[12.5px] font-medium hover:bg-zinc-50 disabled:opacity-50"
        >
          取消
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="rounded-md bg-fail px-3 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? '删除中…' : '删除产品'}
        </button>
      </div>
    </ModalShell>
  );
}

/* ----------------------------------------------------------------- 编辑台 */

function ProductEditor({ model, onBack }: { readonly model: string; readonly onBack: () => void }) {
  const port = useDataPort();

  const [product, setProduct] = useState<Product | null>(null);
  const [notFound, setNotFound] = useState(false);

  // 产品档案字段（可编辑）
  const [name, setName] = useState('');
  const [drawingNo, setDrawingNo] = useState('');
  const [description, setDescription] = useState('');
  const [infoSaved, setInfoSaved] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);

  // 模板编辑态
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copyFrom, setCopyFrom] = useState('');
  const [otherProducts, setOtherProducts] = useState<readonly string[]>([]);

  // 载入产品档案 + 模板 + 可复制来源
  useEffect(() => {
    let alive = true;
    (async () => {
      const p = await port.getProduct(model);
      if (!alive) return;
      if (!p) {
        setNotFound(true);
        return;
      }
      setProduct(p);
      setName(p.name);
      setDrawingNo(p.drawingNo);
      setDescription(p.description);
      setRows(toRows(await port.listTemplates(model)));

      const all = await port.listProducts();
      setOtherProducts(all.map((x) => x.model).filter((m) => m !== model));
    })();
    return () => {
      alive = false;
    };
  }, [port, model]);

  // 切换页面时若有未保存修改，由 navigationGuard 拦一道
  useEffect(() => {
    navigationGuard.canLeave = () => !dirty;
    return () => {
      navigationGuard.canLeave = () => true;
    };
  }, [dirty]);

  const errors = validateTemplates(rows);
  const canSave = errors.length === 0 && dirty;

  function patch(next: TemplateRow[]) {
    setRows(next);
    setDirty(true);
    setSaveMsg(null);
    setSaveError(null);
  }

  async function onSaveInfo() {
    if (!product) return;
    setInfoError(null);
    setInfoSaved(false);
    try {
      const updated = await port.updateProduct(model, { name, drawingNo, description });
      setProduct(updated);
      setInfoSaved(true);
    } catch (e) {
      setInfoError(isDataPortError(e) ? e.message : `保存失败：${String(e)}`);
    }
  }

  async function onSaveTemplates() {
    if (!canSave) return;
    setSaveError(null);
    try {
      await port.replaceTemplates(model, toDrafts(rows));
      setDirty(false);
      setSaveMsg('已保存');
    } catch (e) {
      setSaveError(isDataPortError(e) ? e.message : `保存失败：${String(e)}`);
    }
  }

  async function onCopyFrom() {
    if (!copyFrom) return;
    setSaveError(null);
    try {
      await port.copyTemplates(copyFrom, model);
      setRows(toRows(await port.listTemplates(model)));
      setDirty(false);
      setSaveMsg(`已从 ${copyFrom} 复制模板`);
      setCopyFrom('');
    } catch (e) {
      setSaveError(isDataPortError(e) ? e.message : `复制失败：${String(e)}`);
    }
  }

  if (notFound) {
    return (
      <main className="mx-auto max-w-[980px] px-5 pt-10">
        <div className="rounded-lg border border-line bg-panel p-8 text-center">
          <p className="text-[13.5px] font-semibold">找不到产品 {model}</p>
          <p className="mt-1.5 text-[12.5px] text-ink-3">它可能已被删除，或链接里的型号写错了。</p>
          <button
            type="button"
            onClick={onBack}
            className="mt-4 rounded-md border border-line-strong bg-panel px-3 py-1.5 text-[12.5px] font-medium hover:bg-zinc-50"
          >
            返回产品列表
          </button>
        </div>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="mx-auto max-w-[980px] px-5 pt-5">
        <p className="text-[12px] text-ink-3">正在读取 {model}…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[980px] px-5 pt-5 pb-24">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 text-[12px] text-ink-3 hover:text-ink"
      >
        ← 产品列表
      </button>

      {/* 产品档案 */}
      <section className="rounded-lg border border-line bg-panel p-4">
        <h2 className="text-[13.5px] font-semibold">
          产品档案 · <span className="tabular text-accent">{model}</span>
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="名称">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </Field>
          <Field label="图纸编号">
            <input
              value={drawingNo}
              onChange={(e) => setDrawingNo(e.target.value)}
              className={inputCls}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="说明">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className={inputCls}
              />
            </Field>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={onSaveInfo}
            className="rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90"
          >
            保存产品信息
          </button>
          {infoSaved && <span className="text-[12px] text-pass">已保存</span>}
          {infoError && (
            <span className="text-[12px] text-fail">{infoError}</span>
          )}
        </div>
      </section>

      {/* 测试模板编辑台 */}
      <section className="mt-5 rounded-lg border border-line bg-panel p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[13.5px] font-semibold">测试模板</h2>
            <p className="mt-0.5 text-[12px] text-ink-3">
              每行一个测试项。右侧实时显示系统读到的判定规则 —— 写错规格当场就能发现。
            </p>
          </div>
          <div className="flex items-end gap-2">
            <label className="text-[11.5px] text-ink-3">
              复制自
              <select
                value={copyFrom}
                onChange={(e) => setCopyFrom(e.target.value)}
                className={`${inputCls} mt-1 min-w-[140px]`}
              >
                <option value="">选择产品…</option>
                {otherProducts.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={onCopyFrom}
              disabled={!copyFrom}
              className="rounded-md border border-line-strong bg-panel px-2.5 py-1.5 text-[12px] font-medium hover:bg-zinc-50 disabled:opacity-50"
            >
              应用
            </button>
          </div>
        </div>

        <div className="mt-3 overflow-hidden rounded-md border border-line">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-line text-left text-[11px] font-semibold tracking-wide text-ink-3">
                <th className="w-9 px-2 py-1.5" />
                <th className="px-2 py-1.5">测试项</th>
                <th className="px-2 py-1.5">规格</th>
                <th className="px-2 py-1.5">系统读到的判定规则</th>
                <th className="w-9 px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <TemplateRowView
                  key={r.id}
                  row={r}
                  index={i}
                  total={rows.length}
                  onChange={(next) => patch(rows.map((x) => (x.id === r.id ? next : x)))}
                  onMove={(dir) => patch(moveRow(rows, i, dir))}
                  onRemove={() => patch(rows.filter((x) => x.id !== r.id))}
                />
              ))}
            </tbody>
          </table>
        </div>

        <button
          type="button"
          onClick={() => patch([...rows, newRow()])}
          className="mt-2 rounded-md border border-dashed border-line-strong px-3 py-1.5 text-[12px] font-medium text-ink-2 hover:bg-zinc-50"
        >
          + 新增测试项
        </button>

        {errors.length > 0 && (
          <ul className="mt-3 space-y-1 rounded-md border border-fail/25 bg-fail-bg px-3 py-2 text-[11.5px] text-fail">
            {errors.map((e, i) => (
              <li key={i}>• {e}</li>
            ))}
          </ul>
        )}
        {saveError && (
          <p className="mt-3 rounded border border-fail/25 bg-fail-bg px-2.5 py-1.5 text-[11.5px] text-fail">
            {saveError}
          </p>
        )}

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={onSaveTemplates}
            disabled={!canSave}
            className="rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            title={errors.length > 0 ? '有规格无法保存，请先修正' : undefined}
          >
            整批保存测试模板
          </button>
          {dirty && errors.length === 0 && (
            <span className="text-[12px] text-warn">有未保存的修改</span>
          )}
          {saveMsg && errors.length === 0 && <span className="text-[12px] text-pass">{saveMsg}</span>}
        </div>
      </section>
    </main>
  );
}

function TemplateRowView({
  row,
  index,
  total,
  onChange,
  onMove,
  onRemove,
}: {
  readonly row: TemplateRow;
  readonly index: number;
  readonly total: number;
  readonly onChange: (next: TemplateRow) => void;
  readonly onMove: (dir: 'up' | 'down') => void;
  readonly onRemove: () => void;
}) {
  const trimmed = row.spec.trim();
  const rule = parseSpec(row.spec);

  return (
    <tr className="border-b border-line/60 last:border-0 align-top">
      <td className="px-2 py-2 text-center">
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={() => onMove('up')}
            disabled={index === 0}
            title="上移"
            className="text-[11px] text-ink-3 hover:text-ink disabled:opacity-30"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={() => onMove('down')}
            disabled={index === total - 1}
            title="下移"
            className="text-[11px] text-ink-3 hover:text-ink disabled:opacity-30"
          >
            ▼
          </button>
        </div>
      </td>
      <td className="px-2 py-2">
        <input
          value={row.testItem}
          onChange={(e) => onChange({ ...row, testItem: e.target.value })}
          placeholder="测试项"
          className={`${inputCls} w-full`}
        />
      </td>
      <td className="px-2 py-2">
        <input
          value={row.spec}
          onChange={(e) => onChange({ ...row, spec: e.target.value })}
          placeholder="如 ≤0.5Ω / 合格"
          className={`${inputCls} w-full`}
        />
      </td>
      <td className="px-2 py-2">
        {trimmed.length === 0 ? (
          <span className="text-[11.5px] text-ink-3">未填规格</span>
        ) : rule.kind === 'unparseable' ? (
          <span className="text-[11.5px] text-fail" title={rule.reason}>
            ⚠ {rule.reason}
          </span>
        ) : (
          <span className="text-[11.5px] text-ink-2">{describeRule(rule)}</span>
        )}
      </td>
      <td className="px-2 py-2 text-center">
        <button
          type="button"
          onClick={onRemove}
          title="删除这一行"
          className="text-[12px] text-fail/70 hover:text-fail"
        >
          ✕
        </button>
      </td>
    </tr>
  );
}

/* ----------------------------------------------------------------- 小件 */

const inputCls =
  'w-full rounded-md border border-line-strong bg-panel px-2.5 py-1.5 text-[12.5px] outline-none focus:border-accent focus:ring-1 focus:ring-accent/30';

function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-medium text-ink-3">{label}</span>
      {children}
    </label>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[460px] rounded-xl border border-line bg-panel p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-[14px] font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}
