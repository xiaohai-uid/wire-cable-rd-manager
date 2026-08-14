import { useEffect, useRef } from 'react';
import { resolveJudgment } from '../domain/judgment';
import { describeRule, parseSpec } from '../domain/spec';
import type { Judgment, LedgerRecord } from '../domain/types';
import { useDataPort } from './data-port-context';
import { useAsync } from './use-async';

/**
 * 下钻明细：某个「产品 + 测试项」组合的全部测试记录。
 *
 * 这一屏的职责是**让人复核判定过程**，而不是只给个结论。所以：
 * - 三次测量里越界的那一次单独标红。研发要区分「三次全坏」（工艺问题）
 *   和「只有一次坏」（可能是测量或个体波动），整行标红把这个区别抹掉了。
 * - 把系统读出的判定规则显示出来。人写的是 `≥20dB`，系统读成什么必须能看见 ——
 *   1.0 版把 `≥1.5mm2` 读成阈值 1.52 却什么都不显示，错判就是这么藏住的。
 */
export function DetailPanel({
  productModel,
  testItem,
  configured,
  onClose,
  onOpenBatch,
}: {
  readonly productModel: string;
  readonly testItem: string;
  readonly configured: boolean;
  readonly onClose: () => void;
  readonly onOpenBatch: (batchNo: string) => void;
}) {
  const port = useDataPort();
  const { state } = useAsync(
    () => port.listRecords({ productModel, testItem }),
    [port, productModel, testItem],
  );

  const anchor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // 展开后把面板带进视野。用 nearest 而不是 center，避免页面猛地跳动。
    anchor.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [productModel, testItem]);

  return (
    <div
      ref={anchor}
      className="mt-4 overflow-hidden rounded-lg border border-line bg-panel"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b border-line px-4 py-2.5">
        <b className="text-[13.5px]">{testItem}</b>
        <span className="tabular text-ink-3">{productModel}</span>
        <span className="flex-1" />
        {state.status === 'ready' && <Summary records={state.data} />}
        <button
          type="button"
          onClick={onClose}
          className="ml-2 rounded px-1.5 text-ink-3 hover:bg-zinc-100 hover:text-ink"
          title="收起明细"
          aria-label="收起明细"
        >
          ✕
        </button>
      </div>

      {state.status === 'loading' && (
        <p className="px-4 py-6 text-[12.5px] text-ink-3">正在读取明细…</p>
      )}

      {state.status === 'error' && (
        <p className="px-4 py-6 text-[12.5px] text-fail">读取明细失败：{state.error.message}</p>
      )}

      {state.status === 'ready' &&
        (state.data.length === 0 ? (
          <EmptyDetail configured={configured} testItem={testItem} />
        ) : (
          <RecordTable records={state.data} onOpenBatch={onOpenBatch} />
        ))}
    </div>
  );
}

function Summary({ records }: { readonly records: readonly LedgerRecord[] }) {
  const resolved = records.map((r) => resolveJudgment(r));
  const judged = resolved.filter((r) => r.judgment === 'pass' || r.judgment === 'fail').length;
  const fail = resolved.filter((r) => r.judgment === 'fail').length;
  const rules = [...new Set(records.map((r) => r.spec))];

  return (
    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11.5px] text-ink-3">
      <span className="tabular">
        {records.length} 次测试 · {fail} 次不合格
        {judged !== records.length && ` · ${records.length - judged} 条未判定`}
      </span>
      {/* 系统读到的判定规则。人写的规格和系统的理解必须能对上 —— 这是自检的地方 */}
      {rules.map((spec) => (
        <span
          key={spec}
          className="rounded border border-line bg-zinc-50 px-1.5 py-px"
          title={`规格「${spec}」被系统读成：${describeRule(parseSpec(spec))}`}
        >
          <span className="tabular">{spec}</span>
          <span className="mx-1 text-line-strong">→</span>
          {describeRule(parseSpec(spec))}
        </span>
      ))}
    </span>
  );
}

function EmptyDetail({
  configured,
  testItem,
}: {
  readonly configured: boolean;
  readonly testItem: string;
}) {
  return (
    <div className="px-4 py-8 text-center">
      <p className="text-[12.5px] font-medium">
        {configured ? '已配置这一项，但还没有测试记录' : '未配置此测试项'}
      </p>
      <p className="mx-auto mt-1 max-w-md text-[12px] text-ink-3">
        {configured
          ? `这个产品的测试模板里有「${testItem}」，但台账里还没有对应的测试数据。`
          : `这个产品的测试模板里没有「${testItem}」，所以它不参与这个产品的不良率统计。要测这一项，先在测试模板里加上它。`}
      </p>
    </div>
  );
}

function RecordTable({
  records,
  onOpenBatch,
}: {
  readonly records: readonly LedgerRecord[];
  readonly onOpenBatch: (batchNo: string) => void;
}) {
  const rows = [...records].sort((a, b) =>
    a.testDate === b.testDate
      ? b.batchNo.localeCompare(a.batchNo)
      : b.testDate.localeCompare(a.testDate),
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="[&>th]:border-b [&>th]:border-line [&>th]:px-2 [&>th]:py-1.5 [&>th]:text-left [&>th]:text-[11px] [&>th]:font-semibold [&>th]:whitespace-nowrap [&>th]:text-ink-3">
            <th>测试日期</th>
            <th>批号</th>
            <th>规格</th>
            <th className="text-right">值 1</th>
            <th className="text-right">值 2</th>
            <th className="text-right">值 3</th>
            <th className="text-right">平均</th>
            <th>判定</th>
            <th>测试员</th>
            <th>备注</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((record) => (
            <RecordRow key={record.id} record={record} onOpenBatch={onOpenBatch} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecordRow({
  record,
  onOpenBatch,
}: {
  readonly record: LedgerRecord;
  readonly onOpenBatch: (batchNo: string) => void;
}) {
  const { rule, judgment, average, outOfSpecIndexes } = resolveJudgment(record);
  const isFail = judgment === 'fail';
  const isQualitative = rule.kind === 'qualitative';

  return (
    <tr
      className={`[&>td]:h-[30px] [&>td]:border-b [&>td]:border-line/50 [&>td]:px-2 [&>td]:align-middle ${
        isFail ? 'bg-fail-bg [&>td:first-child]:shadow-[inset_2px_0_0_var(--color-fail)]' : 'hover:bg-zinc-50/70'
      }`}
    >
      <td className="tabular whitespace-nowrap">{record.testDate}</td>
      <td className="tabular whitespace-nowrap">{record.batchNo}</td>
      <td className="tabular whitespace-nowrap text-ink-2">{record.spec}</td>

      {isQualitative ? (
        <td colSpan={3} className="text-center text-[11.5px] text-ink-3">
          定性项 · 由人工判定
        </td>
      ) : (
        record.values.map((value, index) => (
          <td
            key={index}
            className={`tabular text-right ${
              // 只标越界的那一次。「三次全坏」和「一次坏」是两种不同的问题。
              outOfSpecIndexes.includes(index) ? 'font-semibold text-fail' : ''
            }`}
            title={outOfSpecIndexes.includes(index) ? `第 ${index + 1} 次测量超出规格` : undefined}
          >
            {value === null ? <span className="text-zinc-300">–</span> : value}
          </td>
        ))
      )}

      <td className="tabular text-right">
        {average === null ? <span className="text-zinc-300">–</span> : average}
      </td>
      <td>
        <JudgmentTag judgment={judgment} reason={rule.kind === 'unparseable' ? rule.reason : null} />
      </td>
      <td className="whitespace-nowrap text-ink-2">{record.tester}</td>
      <td className="max-w-[160px] truncate text-[11.5px] text-ink-3" title={record.remark}>
        {record.remark}
      </td>
      <td className="text-right whitespace-nowrap">
        <button
          type="button"
          disabled
          onClick={() => onOpenBatch(record.batchNo)}
          className="rounded px-1.5 py-0.5 text-[11.5px] text-ink-3 disabled:cursor-not-allowed disabled:opacity-45"
          title={`跳到批次 ${record.batchNo} 的录入网格 —— 录入界面在工单 04 落地，暂未启用`}
        >
          去录入 →
        </button>
      </td>
    </tr>
  );
}

function JudgmentTag({
  judgment,
  reason,
}: {
  readonly judgment: Judgment;
  readonly reason: string | null;
}) {
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
    // 拒绝判定必须说出口。静默给个「合格」是这套系统最不能犯的错。
    unparseable: '规格无法识别 · 拒绝自动判定',
  };

  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-px text-[11px] font-semibold whitespace-nowrap ${style[judgment]}`}
      title={reason ?? undefined}
    >
      {label[judgment]}
    </span>
  );
}
