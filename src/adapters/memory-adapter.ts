import { SEED_PRODUCTS, SEED_RECORDS, SEED_TEMPLATES } from '../data/seed';
import { buildHeatmap, type HeatmapMatrix } from '../domain/heatmap';
import type { LedgerRecord, Product, TestTemplateItem } from '../domain/types';
import {
  DataPortError,
  type BatchDraft,
  type CascadeSummary,
  type DataPort,
  type DataPortMode,
  type ProductPatch,
  type RecordQuery,
  type TemplateDraft,
} from '../ports/data-port';

/**
 * 演示模式适配器：数据全在内存里，刷新页面就还原。
 *
 * 它不是「假数据挡一挡」——GitHub Pages 上的在线 demo 就靠它跑，
 * 而且它和 HttpAdapter 通过同一套契约测试，行为必须一致。
 */
export class MemoryAdapter implements DataPort {
  readonly mode: DataPortMode = 'demo';

  #products: Product[];
  #templates: TestTemplateItem[];
  #records: LedgerRecord[];

  constructor(seed?: {
    readonly products?: readonly Product[];
    readonly templates?: readonly TestTemplateItem[];
    readonly records?: readonly LedgerRecord[];
  }) {
    this.#products = [...(seed?.products ?? SEED_PRODUCTS)];
    this.#templates = [...(seed?.templates ?? SEED_TEMPLATES)];
    this.#records = [...(seed?.records ?? SEED_RECORDS)];
  }

  /** 演示模式没有网络往返，但也不该是同步的 —— 保持和 HttpAdapter 一样的异步形状 */
  async listProducts(): Promise<readonly Product[]> {
    return [...this.#products];
  }

  async getProduct(model: string): Promise<Product | null> {
    return this.#products.find((p) => p.model === model) ?? null;
  }

  async createProduct(product: Product): Promise<Product> {
    if (product.model.trim().length === 0) {
      throw new DataPortError('invalid', '产品型号不能为空');
    }
    if (this.#products.some((p) => p.model === product.model)) {
      throw new DataPortError('conflict', `产品型号 ${product.model} 已存在`);
    }
    this.#products = [...this.#products, product];
    return product;
  }

  async updateProduct(model: string, patch: ProductPatch): Promise<Product> {
    const index = this.#products.findIndex((p) => p.model === model);
    const existing = this.#products[index];
    if (!existing) throw new DataPortError('not-found', `产品 ${model} 不存在`);

    const updated: Product = { ...existing, ...patch };
    this.#products = this.#products.map((p, i) => (i === index ? updated : p));
    return updated;
  }

  async deleteProduct(model: string): Promise<CascadeSummary> {
    if (!this.#products.some((p) => p.model === model)) {
      throw new DataPortError('not-found', `产品 ${model} 不存在`);
    }

    const removedTemplates = this.#templates.filter((t) => t.productModel === model).length;
    const removedRecords = this.#records.filter((r) => r.productModel === model).length;

    // 级联清除。1.0 版漏了 PRAGMA foreign_keys = ON，删产品会留下孤儿记录；
    // 这里级联是显式写出来的，且由契约测试盯着。
    this.#products = this.#products.filter((p) => p.model !== model);
    this.#templates = this.#templates.filter((t) => t.productModel !== model);
    this.#records = this.#records.filter((r) => r.productModel !== model);

    return { removedTemplates, removedRecords };
  }

  async listTemplates(productModel: string): Promise<readonly TestTemplateItem[]> {
    return this.#templates
      .filter((t) => t.productModel === productModel)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async replaceTemplates(
    productModel: string,
    items: readonly TemplateDraft[],
  ): Promise<readonly TestTemplateItem[]> {
    if (!this.#products.some((p) => p.model === productModel)) {
      throw new DataPortError('not-found', `产品 ${productModel} 不存在`);
    }
    assertNoDuplicate(
      items.map((i) => i.testItem),
      '测试模板',
    );

    const replacement: TestTemplateItem[] = items.map((item) => ({
      productModel,
      testItem: item.testItem,
      spec: item.spec,
      sortOrder: item.sortOrder,
    }));

    this.#templates = [
      ...this.#templates.filter((t) => t.productModel !== productModel),
      ...replacement,
    ];
    return this.listTemplates(productModel);
  }

  async copyTemplates(from: string, to: string): Promise<readonly TestTemplateItem[]> {
    if (!this.#products.some((p) => p.model === from)) {
      throw new DataPortError('not-found', `源产品 ${from} 不存在`);
    }
    const source = await this.listTemplates(from);
    return this.replaceTemplates(
      to,
      source.map(({ testItem, spec, sortOrder }) => ({ testItem, spec, sortOrder })),
    );
  }

  async listRecords(query: RecordQuery): Promise<readonly LedgerRecord[]> {
    return this.#records.filter(
      (r) =>
        (query.productModel === undefined || r.productModel === query.productModel) &&
        (query.testItem === undefined || r.testItem === query.testItem) &&
        (query.batchNo === undefined || r.batchNo === query.batchNo),
    );
  }

  async listBatchNos(productModel: string): Promise<readonly string[]> {
    const latestDate = new Map<string, string>();
    for (const r of this.#records) {
      if (r.productModel !== productModel) continue;
      const seen = latestDate.get(r.batchNo);
      if (seen === undefined || r.testDate > seen) latestDate.set(r.batchNo, r.testDate);
    }
    return [...latestDate.entries()]
      .sort(([aNo, aDate], [bNo, bDate]) =>
        aDate === bDate ? bNo.localeCompare(aNo) : bDate.localeCompare(aDate),
      )
      .map(([batchNo]) => batchNo);
  }

  async saveBatch(batch: BatchDraft): Promise<readonly LedgerRecord[]> {
    // 校验全部先做完再落盘 —— 这就是「整批原子」在内存实现里的形态：
    // 任何一条不合法，整批都不写入，不留半保存状态。
    const product = await this.getProduct(batch.productModel);
    if (!product) {
      throw new DataPortError('not-found', `产品 ${batch.productModel} 不存在`);
    }
    if (batch.batchNo.trim().length === 0) {
      throw new DataPortError('invalid', '批号不能为空');
    }
    if (batch.entries.length === 0) {
      throw new DataPortError('invalid', '批次至少要有一个测试项');
    }
    assertNoDuplicate(
      batch.entries.map((e) => e.testItem),
      '批次',
    );

    const written: LedgerRecord[] = batch.entries.map((entry) => ({
      id: `${batch.batchNo}::${entry.testItem}`,
      testDate: batch.testDate,
      productModel: batch.productModel,
      drawingNo: product.drawingNo,
      batchNo: batch.batchNo,
      testItem: entry.testItem,
      spec: entry.spec,
      values: [...entry.values],
      manualJudgment: entry.manualJudgment,
      tester: batch.tester,
      remark: entry.remark,
    }));

    // 同产品同批号重复保存视为覆盖 —— 网格是「改完整批一起存」，重存不该产生重复行。
    this.#records = [
      ...this.#records.filter(
        (r) => !(r.productModel === batch.productModel && r.batchNo === batch.batchNo),
      ),
      ...written,
    ];
    return written;
  }

  async deleteBatch(productModel: string, batchNo: string): Promise<number> {
    const doomed = this.#records.filter(
      (r) => r.productModel === productModel && r.batchNo === batchNo,
    );
    if (doomed.length === 0) {
      throw new DataPortError('not-found', `批次 ${batchNo} 不存在`);
    }
    this.#records = this.#records.filter(
      (r) => !(r.productModel === productModel && r.batchNo === batchNo),
    );
    return doomed.length;
  }

  async loadHeatmap(): Promise<HeatmapMatrix> {
    return buildHeatmap({
      products: this.#products,
      templates: this.#templates,
      records: this.#records,
    });
  }
}

function assertNoDuplicate(names: readonly string[], scope: string): void {
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) {
      throw new DataPortError('invalid', `${scope}内测试项重复：${name}`);
    }
    seen.add(name);
  }
}
