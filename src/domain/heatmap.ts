import { resolveJudgment } from './judgment';
import { parseSpec } from './spec';
import type { LedgerRecord, Product, TestTemplateItem } from './types';

/**
 * 质量热力图聚合。
 *
 * 这是 2.0 首屏的数据引擎，取代 1.0 版的「四个大数字」。
 * 它要回答的问题是四个数字回答不了的那个：**是哪个产品的哪个测试项在出问题。**
 */

export interface HeatmapCell {
  readonly productModel: string;
  readonly testItem: string;
  /** 该产品的测试模板里是否有这一项。false 表示「不适用」，与「测了但零不合格」必须视觉可区分 */
  readonly configured: boolean;
  /** 已判定记录数 = 不良率的分母。用它区分 1/1 与 12/12 这两种严重程度完全不同的 100% */
  readonly judgedCount: number;
  readonly failCount: number;
  readonly unjudgedCount: number;
  readonly unparseableCount: number;
  /** failCount / judgedCount；分母为 0 时是 null，不是 0 —— 「没数据」不等于「没问题」 */
  readonly defectRate: number | null;
}

export interface HeatmapRow {
  readonly testItem: string;
  readonly isQualitative: boolean;
  readonly judgedCount: number;
  readonly failCount: number;
  readonly defectRate: number | null;
  /** 与 HeatmapMatrix.products 顺序一一对应 */
  readonly cells: readonly HeatmapCell[];
}

export interface HeatmapMatrix {
  readonly products: readonly string[];
  readonly rows: readonly HeatmapRow[];
  readonly overall: {
    readonly totalCount: number;
    readonly judgedCount: number;
    readonly failCount: number;
    readonly unjudgedCount: number;
    readonly unparseableCount: number;
    readonly defectRate: number | null;
  };
}

interface Tally {
  judgedCount: number;
  failCount: number;
  unjudgedCount: number;
  unparseableCount: number;
}

const emptyTally = (): Tally => ({
  judgedCount: 0,
  failCount: 0,
  unjudgedCount: 0,
  unparseableCount: 0,
});

const keyOf = (testItem: string, productModel: string): string => `${testItem}\u0000${productModel}`;

function rateOf(failCount: number, judgedCount: number): number | null {
  if (judgedCount === 0) return null;
  return failCount / judgedCount;
}

export function buildHeatmap(input: {
  readonly products: readonly Product[];
  readonly templates: readonly TestTemplateItem[];
  readonly records: readonly LedgerRecord[];
}): HeatmapMatrix {
  const products = input.products.map((p) => p.model);

  // 行的全集来自测试模板（应当测什么），而不是只来自已有记录 ——
  // 否则「配了但还没测」的项会整行消失，看不出漏测。
  const testItems: string[] = [];
  const seenItems = new Set<string>();
  const configured = new Set<string>();
  const qualitativeItems = new Set<string>();

  for (const template of input.templates) {
    if (!seenItems.has(template.testItem)) {
      seenItems.add(template.testItem);
      testItems.push(template.testItem);
    }
    configured.add(keyOf(template.testItem, template.productModel));
    if (parseSpec(template.spec).kind === 'qualitative') {
      qualitativeItems.add(template.testItem);
    }
  }

  const cellTallies = new Map<string, Tally>();
  const rowTallies = new Map<string, Tally>();
  const overall = emptyTally();

  for (const record of input.records) {
    const { judgment } = resolveJudgment(record);
    const cellKey = keyOf(record.testItem, record.productModel);

    if (!seenItems.has(record.testItem)) {
      seenItems.add(record.testItem);
      testItems.push(record.testItem);
    }

    const cell = cellTallies.get(cellKey) ?? emptyTally();
    const row = rowTallies.get(record.testItem) ?? emptyTally();

    for (const tally of [cell, row, overall]) {
      if (judgment === 'unparseable') tally.unparseableCount += 1;
      else if (judgment === 'unjudged') tally.unjudgedCount += 1;
      else {
        tally.judgedCount += 1;
        if (judgment === 'fail') tally.failCount += 1;
      }
    }

    cellTallies.set(cellKey, cell);
    rowTallies.set(record.testItem, row);
  }

  const rows: HeatmapRow[] = testItems.map((testItem) => {
    const row = rowTallies.get(testItem) ?? emptyTally();
    return {
      testItem,
      isQualitative: qualitativeItems.has(testItem),
      judgedCount: row.judgedCount,
      failCount: row.failCount,
      defectRate: rateOf(row.failCount, row.judgedCount),
      cells: products.map((productModel) => {
        const tally = cellTallies.get(keyOf(testItem, productModel)) ?? emptyTally();
        return {
          productModel,
          testItem,
          configured: configured.has(keyOf(testItem, productModel)),
          judgedCount: tally.judgedCount,
          failCount: tally.failCount,
          unjudgedCount: tally.unjudgedCount,
          unparseableCount: tally.unparseableCount,
          defectRate: rateOf(tally.failCount, tally.judgedCount),
        };
      }),
    };
  });

  // 最该处理的测试项浮到最上面：不良率降序 → 分母降序 → 名称，保证排序稳定可测。
  rows.sort((a, b) => {
    const rateA = a.defectRate ?? -1;
    const rateB = b.defectRate ?? -1;
    if (rateA !== rateB) return rateB - rateA;
    if (a.judgedCount !== b.judgedCount) return b.judgedCount - a.judgedCount;
    return a.testItem.localeCompare(b.testItem, 'zh-CN');
  });

  const totalCount =
    overall.judgedCount + overall.unjudgedCount + overall.unparseableCount;

  return {
    products,
    rows,
    overall: {
      totalCount,
      judgedCount: overall.judgedCount,
      failCount: overall.failCount,
      unjudgedCount: overall.unjudgedCount,
      unparseableCount: overall.unparseableCount,
      defectRate: rateOf(overall.failCount, overall.judgedCount),
    },
  };
}
