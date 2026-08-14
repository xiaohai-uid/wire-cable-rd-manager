import { DatabaseSync } from 'node:sqlite';
import { SEED_PRODUCTS, SEED_RECORDS, SEED_TEMPLATES } from '../data/seed';
import type { LedgerRecord, Product, TestTemplateItem } from '../domain/types';

/**
 * SQLite 数据层。用 Node 24 内置的 `node:sqlite`（同步 API），
 * 不需要原生编译，且和 better-sqlite3 一样能满足本系统的两条硬要求：
 *
 * 1. `PRAGMA foreign_keys = ON` —— 否则删产品会留孤儿记录（1.0 的坑）；
 * 2. 显式 `BEGIN / COMMIT / ROLLBACK` 事务 —— 整批写入原子性的物理保证。
 *
 * 表结构用外键级联（`ON DELETE CASCADE`），这样「删除产品」一行 DELETE 就连带清掉
 * 它的模板与台账，且由 SQLite 内核保证不留孤儿；级联条数在删除前先数出来返回给 UI。
 */

export type Db = DatabaseSync;

export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  // 这条必须最先执行，且对当前连接生效。少了它，外键约束形同虚设。
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      model       TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      drawingNo   TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS templates (
      productModel TEXT NOT NULL REFERENCES products(model) ON DELETE CASCADE,
      testItem     TEXT NOT NULL,
      spec         TEXT NOT NULL,
      sortOrder    INTEGER NOT NULL,
      PRIMARY KEY (productModel, testItem)
    );

    CREATE TABLE IF NOT EXISTS records (
      id            TEXT PRIMARY KEY,
      testDate      TEXT NOT NULL,
      productModel  TEXT NOT NULL REFERENCES products(model) ON DELETE CASCADE,
      drawingNo     TEXT NOT NULL,
      batchNo       TEXT NOT NULL,
      testItem      TEXT NOT NULL,
      spec          TEXT NOT NULL,
      v0            REAL,
      v1            REAL,
      v2            REAL,
      manualJudgment TEXT,
      tester        TEXT NOT NULL,
      remark        TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_records_product ON records(productModel);
    CREATE INDEX IF NOT EXISTS idx_records_batch   ON records(batchNo);
    CREATE INDEX IF NOT EXISTS idx_records_testitem ON records(testItem);
  `);
}

/** 仅在库为空时灌入标准种子（5 产品 / 52 模板 / 62 记录）。本地库重复启动不会重复灌。 */
export function seedIfEmpty(db: Db): void {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM products').get() as { n: number };
  if (n > 0) return;

  const insP = db.prepare(
    'INSERT INTO products (model, name, drawingNo, description) VALUES (?, ?, ?, ?)',
  );
  for (const p of SEED_PRODUCTS) insP.run(p.model, p.name, p.drawingNo, p.description);

  const insT = db.prepare(
    'INSERT INTO templates (productModel, testItem, spec, sortOrder) VALUES (?, ?, ?, ?)',
  );
  SEED_TEMPLATES.forEach((t, i) => insT.run(t.productModel, t.testItem, t.spec, t.sortOrder ?? i));

  const insR = db.prepare(
    `INSERT INTO records
       (id, testDate, productModel, drawingNo, batchNo, testItem, spec, v0, v1, v2, manualJudgment, tester, remark)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const r of SEED_RECORDS) {
    insR.run(
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
}

/** 把一行 records 列映射回领域 LedgerRecord（v0/v1/v2 → values 数组）。 */
export function rowToRecord(row: RecordRow): LedgerRecord {
  return {
    id: row.id,
    testDate: row.testDate,
    productModel: row.productModel,
    drawingNo: row.drawingNo,
    batchNo: row.batchNo,
    testItem: row.testItem,
    spec: row.spec,
    values: [row.v0, row.v1, row.v2],
    manualJudgment: (row.manualJudgment as LedgerRecord['manualJudgment']) ?? null,
    tester: row.tester,
    remark: row.remark,
  };
}

/** 显式事务包裹：fn 抛错则整段回滚。saveBatch / replaceTemplates 都走它。 */
export function transact<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export interface RecordRow {
  id: string;
  testDate: string;
  productModel: string;
  drawingNo: string;
  batchNo: string;
  testItem: string;
  spec: string;
  v0: number | null;
  v1: number | null;
  v2: number | null;
  manualJudgment: string | null;
  tester: string;
  remark: string;
}

export type { Product, TestTemplateItem };
