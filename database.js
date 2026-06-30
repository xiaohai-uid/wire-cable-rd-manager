const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data', 'rd-manager.db');
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  -- 产品表
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model TEXT NOT NULL UNIQUE,
    name TEXT DEFAULT '',
    drawing_no TEXT DEFAULT '',
    description TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  -- 测试台账表
  CREATE TABLE IF NOT EXISTS test_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_date TEXT NOT NULL,
    product_model TEXT DEFAULT '',
    drawing_no TEXT DEFAULT '',
    bom_no TEXT DEFAULT '',
    batch_no TEXT DEFAULT '',
    sample_no TEXT DEFAULT '',
    test_item TEXT NOT NULL,
    spec TEXT DEFAULT '',
    value1 REAL,
    value2 REAL,
    value3 REAL,
    avg_value REAL,
    judgment TEXT DEFAULT '',
    defect_reason TEXT DEFAULT '',
    tester TEXT DEFAULT '',
    remark TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_model) REFERENCES products(model) ON DELETE CASCADE
  );

  -- BOM 主表
  CREATE TABLE IF NOT EXISTS boms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bom_no TEXT NOT NULL UNIQUE,
    product_model TEXT NOT NULL,
    drawing_no TEXT DEFAULT '',
    version TEXT DEFAULT 'V1.0',
    creator TEXT DEFAULT '',
    description TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  -- BOM 明细表
  CREATE TABLE IF NOT EXISTS bom_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bom_id INTEGER NOT NULL,
    row_no INTEGER,
    material_code TEXT DEFAULT '',
    material_name TEXT DEFAULT '',
    spec TEXT DEFAULT '',
    material TEXT DEFAULT '',
    unit TEXT DEFAULT '',
    quantity REAL DEFAULT 0,
    loss_rate REAL DEFAULT 0,
    total_quantity REAL DEFAULT 0,
    supplier TEXT DEFAULT '',
    is_key INTEGER DEFAULT 0,
    remark TEXT DEFAULT '',
    FOREIGN KEY (bom_id) REFERENCES boms(id) ON DELETE CASCADE
  );

  -- 打样工艺记录表
  CREATE TABLE IF NOT EXISTS process_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_no TEXT NOT NULL UNIQUE,
    product_model TEXT DEFAULT '',
    drawing_no TEXT DEFAULT '',
    bom_no TEXT DEFAULT '',
    batch_no TEXT DEFAULT '',
    process_date TEXT,
    quantity REAL DEFAULT 0,
    unit TEXT DEFAULT 'm',
    responsible TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  -- 工艺参数明细表
  CREATE TABLE IF NOT EXISTS process_params (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id INTEGER NOT NULL,
    process_name TEXT DEFAULT '',
    param_name TEXT DEFAULT '',
    spec TEXT DEFAULT '',
    actual1 REAL,
    actual2 REAL,
    actual3 REAL,
    judgment TEXT DEFAULT '合格',
    remark TEXT DEFAULT '',
    FOREIGN KEY (record_id) REFERENCES process_records(id) ON DELETE CASCADE
  );

  -- 测试报告表
  CREATE TABLE IF NOT EXISTS test_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_no TEXT NOT NULL UNIQUE,
    product_model TEXT DEFAULT '',
    drawing_no TEXT DEFAULT '',
    bom_no TEXT DEFAULT '',
    batch_no TEXT DEFAULT '',
    client_name TEXT DEFAULT '',
    standard TEXT DEFAULT '',
    test_date TEXT,
    report_date TEXT,
    test_qty INTEGER DEFAULT 0,
    unit TEXT DEFAULT 'm',
    temp REAL,
    humidity REAL,
    conclusion TEXT DEFAULT '',
    tester TEXT DEFAULT '',
    reviewer TEXT DEFAULT '',
    approver TEXT DEFAULT '',
    remark TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  -- 测试报告项目表
  CREATE TABLE IF NOT EXISTS report_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL,
    test_item TEXT DEFAULT '',
    spec TEXT DEFAULT '',
    value1 REAL,
    value2 REAL,
    value3 REAL,
    avg_value REAL,
    judgment TEXT DEFAULT '',
    FOREIGN KEY (report_id) REFERENCES test_reports(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_ledger_date ON test_ledger(test_date);
  CREATE INDEX IF NOT EXISTS idx_ledger_model ON test_ledger(product_model);
  CREATE INDEX IF NOT EXISTS idx_ledger_batch ON test_ledger(batch_no);

  -- 产品测试模板表
  CREATE TABLE IF NOT EXISTS test_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_model TEXT NOT NULL,
    test_item TEXT NOT NULL,
    spec TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_model, test_item)
  );
`);

module.exports = db;
