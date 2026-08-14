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
import type { StatementSync } from 'node:sqlite';
import { rowToRecord, transact, type Db, type RecordRow } from './db';

/**
 * 服务端的数据端口实现。规则与 MemoryAdapter 逐条对齐 ——
 * 不是巧合，是契约测试硬逼出来的（describeDataPortContract 对两者各跑一遍）。
 * 任何一边悄悄改了行为，另一边（或契约测试）会立刻变红。
 *
 * 本文件同时是几处性能与健壮性改造的落点：
 * - 预编译语句在构造时 prepare 一次（`#stmts`），避免每次调用都重新编译 SQL（P4）；
 * - `loadHeatmap` 用 `#revision` 失效的缓存，避免每次打开首页/下钻都重算整张矩阵（P1）；
 * - `listRecords` 支持可选 `limit/offset` 分页，列表页不再被迫拉取整表（P2）。
 */
export class SqliteRepo {
  #revision = 0;
  #heatmapCache: { revision: number; matrix: HeatmapMatrix } | null = null;

  // 预编译语句缓存（node:sqlite 每次 prepare 都会重新编译，热路径必须复用）
  readonly #stmts: {
    listProducts: StatementSync;
    getProduct: StatementSync;
    insertProduct: StatementSync;
    updateProduct: StatementSync;
    deleteProduct: StatementSync;
    countTemplates: StatementSync;
    countRecords: StatementSync;
    listTemplates: StatementSync;
    deleteTemplates: StatementSync;
    insertTemplate: StatementSync;
    listAllTemplates: StatementSync;
    listAllRecords: StatementSync;
    listBatchNos: StatementSync;
    deleteRecordsByBatch: StatementSync;
    insertRecord: StatementSync;
    countRecordsByBatch: StatementSync;
  };

  constructor(private readonly db: Db) {
    this.#stmts = {
      listProducts: db.prepare(
        'SELECT model, name, drawingNo, description FROM products ORDER BY rowid',
      ),
      getProduct: db.prepare(
        'SELECT model, name, drawingNo, description FROM products WHERE model = ?',
      ),
      insertProduct: db.prepare(
        'INSERT INTO products (model, name, drawingNo, description) VALUES (?, ?, ?, ?)',
      ),
      updateProduct: db.prepare(
        'UPDATE products SET name = ?, drawingNo = ?, description = ? WHERE model = ?',
      ),
      deleteProduct: db.prepare('DELETE FROM products WHERE model = ?'),
      countTemplates: db.prepare(
        'SELECT COUNT(*) AS n FROM templates WHERE productModel = ?',
      ),
      countRecords: db.prepare(
        'SELECT COUNT(*) AS n FROM records WHERE productModel = ?',
      ),
      listTemplates: db.prepare(
        'SELECT productModel, testItem, spec, sortOrder FROM templates WHERE productModel = ? ORDER BY sortOrder',
      ),
      deleteTemplates: db.prepare('DELETE FROM templates WHERE productModel = ?'),
      insertTemplate: db.prepare(
        'INSERT INTO templates (productModel, testItem, spec, sortOrder) VALUES (?, ?, ?, ?)',
      ),
      listAllTemplates: db.prepare(
        'SELECT productModel, testItem, spec, sortOrder FROM templates ORDER BY productModel, sortOrder',
      ),
      listAllRecords: db.prepare('SELECT * FROM records ORDER BY batchNo, testItem'),
      listBatchNos: db.prepare(
        'SELECT batchNo, testDate FROM records WHERE productModel = ?',
      ),
      deleteRecordsByBatch: db.prepare(
        'DELETE FROM records WHERE productModel = ? AND batchNo = ?',
      ),
      insertRecord: db.prepare(
        `INSERT INTO records
           (id, testDate, productModel, drawingNo, batchNo, testItem, spec, v0, v1, v2, manualJudgment, tester, remark)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ),
      countRecordsByBatch: db.prepare(
        'SELECT COUNT(*) AS n FROM records WHERE productModel = ? AND batchNo = ?',
      ),
    };
  }

  /** 任何会改数据的操作都调它，让依赖“整表镜像”的缓存失效（P1）。 */
  #bump(): void {
    this.#revision += 1;
    this.#heatmapCache = null;
  }

  listProducts(): Product[] {
    // 按 rowid（插入顺序）排，与 MemoryAdapter 的 [...products] 行为一致，
    // 也和契约测试里写死的种子顺序一致。不能 ORDER BY model（会变成字母序）。
    return this.#stmts.listProducts.all() as unknown as Product[];
  }

  getProduct(model: string): Product | null {
    return (
      (this.#stmts.getProduct.get(model) as Product | undefined) ?? null
    );
  }

  createProduct(product: Product): Product {
    if (product.model.trim().length === 0) {
      throw new DataPortError('invalid', '产品型号不能为空');
    }
    if (this.getProduct(product.model)) {
      throw new DataPortError('conflict', `产品型号 ${product.model} 已存在`);
    }
    this.#stmts.insertProduct.run(
      product.model,
      product.name,
      product.drawingNo,
      product.description,
    );
    this.#bump();
    return product;
  }

  updateProduct(model: string, patch: ProductPatch): Product {
    const existing = this.getProduct(model);
    if (!existing) throw new DataPortError('not-found', `产品 ${model} 不存在`);

    const next: Product = { ...existing, ...patch };
    this.#stmts.updateProduct.run(next.name, next.drawingNo, next.description, model);
    this.#bump();
    return next;
  }

  deleteProduct(model: string): CascadeSummary {
    if (!this.getProduct(model)) {
      throw new DataPortError('not-found', `产品 ${model} 不存在`);
    }
    const removedTemplates = (
      this.#stmts.countTemplates.get(model) as { n: number }
    ).n;
    const removedRecords = (this.#stmts.countRecords.get(model) as { n: number }).n;

    // 外键级联会一并清掉模板与台账；先数清楚要清多少，再删产品。
    this.#stmts.deleteProduct.run(model);
    this.#bump();
    return { removedTemplates, removedRecords };
  }

  listTemplates(productModel: string): TestTemplateItem[] {
    return this.#stmts.listTemplates.all(productModel) as unknown as TestTemplateItem[];
  }

  replaceTemplates(
    productModel: string,
    items: readonly TemplateDraft[],
  ): TestTemplateItem[] {
    if (!this.getProduct(productModel)) {
      throw new DataPortError('not-found', `产品 ${productModel} 不存在`);
    }
    assertNoDuplicate(items.map((i) => i.testItem), '测试模板');

    transact(this.db, () => {
      this.#stmts.deleteTemplates.run(productModel);
      for (const item of items) {
        this.#stmts.insertTemplate.run(
          productModel,
          item.testItem,
          item.spec,
          item.sortOrder,
        );
      }
    });
    this.#bump();
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

    let sql = `SELECT * FROM records ${where} ORDER BY batchNo, testItem`;
    if (query.limit !== undefined) {
      sql += ` LIMIT ${query.limit}`;
      if (query.offset !== undefined) sql += ` OFFSET ${query.offset}`;
    }

    const rows = this.db.prepare(sql).all(...params) as unknown as RecordRow[];
    return rows.map(rowToRecord);
  }

  countRecords(productModel: string): number {
    return (this.#stmts.countRecords.get(productModel) as { n: number }).n;
  }

  listBatchNos(productModel: string): string[] {
    const rows = this.#stmts.listBatchNos.all(productModel) as {
      batchNo: string;
      testDate: string;
    }[];

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
      this.#stmts.deleteRecordsByBatch.run(batch.productModel, batch.batchNo);
      for (const r of written) {
        this.#stmts.insertRecord.run(
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
    this.#bump();
    return written;
  }

  deleteBatch(productModel: string, batchNo: string): number {
    const { n } = this.#stmts.countRecordsByBatch.get(
      productModel,
      batchNo,
    ) as { n: number };
    if (n === 0) {
      throw new DataPortError('not-found', `批次 ${batchNo} 不存在`);
    }
    this.#stmts.deleteRecordsByBatch.run(productModel, batchNo);
    this.#bump();
    return n;
  }

  loadHeatmap(): HeatmapMatrix {
    // 基于 revision 的缓存：数据没变就不重算、不重拉整表（P1）。
    if (this.#heatmapCache && this.#heatmapCache.revision === this.#revision) {
      return this.#heatmapCache.matrix;
    }
    const products = this.listProducts();
    const templates = this.#stmts.listAllTemplates.all() as unknown as TestTemplateItem[];
    const records = (this.#stmts.listAllRecords.all() as unknown as RecordRow[]).map(
      rowToRecord,
    );
    const matrix = buildHeatmap({ products, templates, records });
    this.#heatmapCache = { revision: this.#revision, matrix };
    return matrix;
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
