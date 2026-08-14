import {
  DataPortError,
  type BatchDraft,
  type CascadeSummary,
  type ProductPatch,
  type RecordQuery,
  type TemplateDraft,
} from '../ports/data-port';
import { buildHeatmap, type HeatmapMatrix } from '../domain/heatmap';
import type { LedgerRecord, Product, TestTemplateItem } from '../domain/types';
import { rowToRecord, transact, type Db, type RecordRow } from './db';

/**
 * 服务端的数据端口实现。规则与 MemoryAdapter 逐条对齐 ——
 * 不是巧合，是契约测试硬逼出来的（describeDataPortContract 对两者各跑一遍）。
 * 任何一边悄悄改了行为，另一边（或契约测试）会立刻变红。
 */
export class SqliteRepo {
  constructor(private readonly db: Db) {}

  listProducts(): Product[] {
    // 按 rowid（插入顺序）排，与 MemoryAdapter 的 [...products] 行为一致，
    // 也和契约测试里写死的种子顺序一致。不能 ORDER BY model（会变成字母序）。
    return this.db
      .prepare('SELECT model, name, drawingNo, description FROM products ORDER BY rowid')
      .all() as unknown as Product[];
  }

  getProduct(model: string): Product | null {
    return (
      (this.db
        .prepare('SELECT model, name, drawingNo, description FROM products WHERE model = ?')
        .get(model) as Product | undefined) ?? null
    );
  }

  createProduct(product: Product): Product {
    if (product.model.trim().length === 0) {
      throw new DataPortError('invalid', '产品型号不能为空');
    }
    if (this.getProduct(product.model)) {
      throw new DataPortError('conflict', `产品型号 ${product.model} 已存在`);
    }
    this.db
      .prepare('INSERT INTO products (model, name, drawingNo, description) VALUES (?, ?, ?, ?)')
      .run(product.model, product.name, product.drawingNo, product.description);
    return product;
  }

  updateProduct(model: string, patch: ProductPatch): Product {
    const existing = this.getProduct(model);
    if (!existing) throw new DataPortError('not-found', `产品 ${model} 不存在`);

    const next: Product = { ...existing, ...patch };
    this.db
      .prepare('UPDATE products SET name = ?, drawingNo = ?, description = ? WHERE model = ?')
      .run(next.name, next.drawingNo, next.description, model);
    return next;
  }

  deleteProduct(model: string): CascadeSummary {
    if (!this.getProduct(model)) {
      throw new DataPortError('not-found', `产品 ${model} 不存在`);
    }
    const removedTemplates = (
      this.db.prepare('SELECT COUNT(*) AS n FROM templates WHERE productModel = ?').get(model) as {
        n: number;
      }
    ).n;
    const removedRecords = (
      this.db.prepare('SELECT COUNT(*) AS n FROM records WHERE productModel = ?').get(model) as {
        n: number;
      }
    ).n;

    // 外键级联会一并清掉模板与台账；先数清楚要清多少，再删产品。
    this.db.prepare('DELETE FROM products WHERE model = ?').run(model);
    return { removedTemplates, removedRecords };
  }

  listTemplates(productModel: string): TestTemplateItem[] {
    return this.db
      .prepare(
        'SELECT productModel, testItem, spec, sortOrder FROM templates WHERE productModel = ? ORDER BY sortOrder',
      )
      .all(productModel) as unknown as TestTemplateItem[];
  }

  replaceTemplates(productModel: string, items: readonly TemplateDraft[]): TestTemplateItem[] {
    if (!this.getProduct(productModel)) {
      throw new DataPortError('not-found', `产品 ${productModel} 不存在`);
    }
    assertNoDuplicate(items.map((i) => i.testItem), '测试模板');

    transact(this.db, () => {
      this.db.prepare('DELETE FROM templates WHERE productModel = ?').run(productModel);
      const ins = this.db.prepare(
        'INSERT INTO templates (productModel, testItem, spec, sortOrder) VALUES (?, ?, ?, ?)',
      );
      for (const item of items) {
        ins.run(productModel, item.testItem, item.spec, item.sortOrder);
      }
    });
    return this.listTemplates(productModel);
  }

  copyTemplates(from: string, to: string): TestTemplateItem[] {
    const source = this.listTemplates(from);
    return this.replaceTemplates(
      to,
      source.map(({ testItem, spec, sortOrder }) => ({ testItem, spec, sortOrder })),
    );
  }

  listRecords(query: RecordQuery): LedgerRecord[] {
    const clauses: string[] = [];
    const params: string[] = [];
    if (query.productModel !== undefined) {
      clauses.push('productModel = ?');
      params.push(query.productModel);
    }
    if (query.testItem !== undefined) {
      clauses.push('testItem = ?');
      params.push(query.testItem);
    }
    if (query.batchNo !== undefined) {
      clauses.push('batchNo = ?');
      params.push(query.batchNo);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db
      .prepare(`SELECT * FROM records ${where} ORDER BY batchNo, testItem`)
      .all(...params) as unknown as RecordRow[];
    return rows.map(rowToRecord);
  }

  listBatchNos(productModel: string): string[] {
    const rows = this.db
      .prepare('SELECT batchNo, testDate FROM records WHERE productModel = ?')
      .all(productModel) as { batchNo: string; testDate: string }[];

    const latestDate = new Map<string, string>();
    for (const r of rows) {
      const seen = latestDate.get(r.batchNo);
      if (seen === undefined || r.testDate > seen) latestDate.set(r.batchNo, r.testDate);
    }
    return [...latestDate.entries()]
      .sort(([aNo, aDate], [bNo, bDate]) =>
        aDate === bDate ? bNo.localeCompare(aNo) : bDate.localeCompare(aDate),
      )
      .map(([batchNo]) => batchNo);
  }

  saveBatch(batch: BatchDraft): LedgerRecord[] {
    const product = this.getProduct(batch.productModel);
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

    // 整批原子：先校验（含上面的去重），再在单个事务里「删旧 + 插新」。
    // 任一条失败（含外键/唯一约束），事务整体回滚，不留半保存状态。
    transact(this.db, () => {
      this.db
        .prepare('DELETE FROM records WHERE productModel = ? AND batchNo = ?')
        .run(batch.productModel, batch.batchNo);
      const ins = this.db.prepare(
        `INSERT INTO records
           (id, testDate, productModel, drawingNo, batchNo, testItem, spec, v0, v1, v2, manualJudgment, tester, remark)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const r of written) {
        ins.run(
          r.id,
          r.testDate,
          r.productModel,
          r.drawingNo,
          r.batchNo,
          r.testItem,
          r.spec,
          r.values[0] ?? null,
          r.values[1] ?? null,
          r.values[2] ?? null,
          r.manualJudgment,
          r.tester,
          r.remark,
        );
      }
    });
    return written;
  }

  deleteBatch(productModel: string, batchNo: string): number {
    const { n } = this.db
      .prepare('SELECT COUNT(*) AS n FROM records WHERE productModel = ? AND batchNo = ?')
      .get(productModel, batchNo) as { n: number };
    if (n === 0) {
      throw new DataPortError('not-found', `批次 ${batchNo} 不存在`);
    }
    this.db
      .prepare('DELETE FROM records WHERE productModel = ? AND batchNo = ?')
      .run(productModel, batchNo);
    return n;
  }

  loadHeatmap(): HeatmapMatrix {
    const products = this.listProducts();
    const templates = this.db
      .prepare('SELECT productModel, testItem, spec, sortOrder FROM templates')
      .all() as unknown as TestTemplateItem[];
    const records = (
      this.db.prepare('SELECT * FROM records').all() as unknown as RecordRow[]
    ).map(rowToRecord);
    return buildHeatmap({ products, templates, records });
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
