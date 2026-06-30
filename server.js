const express = require('express');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3789;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==================== Helper: 判定逻辑 ====================

function calculateJudgment(spec, v1, v2, v3) {
  const values = [v1, v2, v3];
  // 定性判定
  if (values.some(v => typeof v === 'string')) {
    const passValues = ['通过', '合格', 'pass', 'Pass', 'OK'];
    return values.every(v => passValues.includes(String(v))) ? '合格' : '不合格';
  }
  const nums = values.filter(v => v != null && !isNaN(v));
  if (nums.length === 0) return '';
  
  const specStr = String(spec || '').trim();
  if (!specStr) return '待判定';
  
  // 上限 ≤X 或 <X
  if (specStr.startsWith('≤') || specStr.startsWith('<') || /^max/i.test(specStr)) {
    const limit = parseFloat(specStr.replace(/[^0-9.]/g, ''));
    if (specStr.startsWith('<')) {
      return nums.every(v => v < limit) ? '合格' : '不合格';
    }
    return nums.every(v => v <= limit) ? '合格' : '不合格';
  }
  // 下限 ≥X 或 >X
  if (specStr.startsWith('≥') || specStr.startsWith('>') || /^min/i.test(specStr)) {
    const limit = parseFloat(specStr.replace(/[^0-9.]/g, ''));
    if (specStr.startsWith('>')) {
      return nums.every(v => v > limit) ? '合格' : '不合格';
    }
    return nums.every(v => v >= limit) ? '合格' : '不合格';
  }
  // 范围 X±Y
  if (specStr.includes('±')) {
    const parts = specStr.split('±');
    const center = parseFloat(parts[0]);
    const range = parseFloat(parts[1]);
    return nums.every(v => v >= center - range && v <= center + range) ? '合格' : '不合格';
  }
  // 范围 X~Y
  if (specStr.includes('~') || specStr.includes('～')) {
    const sep = specStr.includes('~') ? '~' : '～';
    const parts = specStr.split(sep);
    const lower = parseFloat(parts[0]);
    const upper = parseFloat(parts[1]);
    return nums.every(v => v >= lower && v <= upper) ? '合格' : '不合格';
  }
  return '待判定';
}

function calculateAvg(v1, v2, v3) {
  const nums = [v1, v2, v3].filter(v => v != null && !isNaN(v));
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length * 10000) / 10000;
}

// ==================== Products API ====================

app.get('/api/products', (req, res) => {
  try {
    const products = db.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
    res.json(products);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/products/:id', (req, res) => {
  try {
    const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!p) return res.status(404).json({ error: '产品不存在' });
    res.json(p);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/products', (req, res) => {
  try {
    const { model, name, drawing_no, description } = req.body;
    if (!model) return res.status(400).json({ error: '产品型号不能为空' });
    const r = db.prepare('INSERT INTO products (model, name, drawing_no, description) VALUES (?, ?, ?, ?)')
      .run(model, name || '', drawing_no || '', description || '');
    res.status(201).json({ id: r.lastInsertRowid, model });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: `产品型号已存在` });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/products/:id', (req, res) => {
  try {
    const { model, name, drawing_no, description } = req.body;
    const r = db.prepare('UPDATE products SET model=?, name=?, drawing_no=?, description=? WHERE id=?')
      .run(model, name || '', drawing_no || '', description || '', req.params.id);
    if (r.changes === 0) return res.status(404).json({ error: '产品不存在' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/products/:id', (req, res) => {
  try {
    const r = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    if (r.changes === 0) return res.status(404).json({ error: '产品不存在' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== Batch Delete API ====================
app.delete('/api/ledger/batch', (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: '请选择要删除的记录' });
    const placeholders = ids.map(() => '?').join(',');
    const r = db.prepare(`DELETE FROM test_ledger WHERE id IN (${placeholders})`).run(...ids);
    res.json({ success: true, deleted: r.changes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== Batch Delete API ====================
app.delete('/api/ledger/batch', (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: '请选择要删除的记录' });
    const placeholders = ids.map(() => '?').join(',');
    const r = db.prepare(`DELETE FROM test_ledger WHERE id IN (${placeholders})`).run(...ids);
    res.json({ success: true, deleted: r.changes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== Test Templates API ====================

app.get('/api/templates', (req, res) => {
  try {
    const { product_model } = req.query;
    let sql = 'SELECT * FROM test_templates';
    const params = [];
    if (product_model) { sql += ' WHERE product_model = ?'; params.push(product_model); }
    sql += ' ORDER BY sort_order, id';
    res.json(db.prepare(sql).all(...params));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/templates', (req, res) => {
  try {
    const { product_model, test_item, spec, sort_order } = req.body;
    if (!product_model || !test_item) return res.status(400).json({ error: '产品型号和测试项目不能为空' });
    const r = db.prepare('INSERT INTO test_templates (product_model, test_item, spec, sort_order) VALUES (?,?,?,?)')
      .run(product_model, test_item, spec||'', sort_order||0);
    res.status(201).json({ id: r.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: '该产品已存在此测试项目' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/templates/:id', (req, res) => {
  try {
    const { test_item, spec, sort_order } = req.body;
    const r = db.prepare('UPDATE test_templates SET test_item=?, spec=?, sort_order=? WHERE id=?')
      .run(test_item, spec||'', sort_order||0, req.params.id);
    if (r.changes === 0) return res.status(404).json({ error: '模板不存在' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/templates/:id', (req, res) => {
  try {
    const r = db.prepare('DELETE FROM test_templates WHERE id = ?').run(req.params.id);
    if (r.changes === 0) return res.status(404).json({ error: '模板不存在' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== Template Copy API ====================
app.post('/api/templates/copy', (req, res) => {
  try {
    const { source_model, target_model } = req.body;
    if (!source_model || !target_model) return res.status(400).json({ error: '源产品型号和目标产品型号不能为空' });
    if (source_model === target_model) return res.status(400).json({ error: '源产品和目标产品不能相同' });
    
    const sourceTmpls = db.prepare('SELECT * FROM test_templates WHERE product_model = ? ORDER BY sort_order').all(source_model);
    if (sourceTmpls.length === 0) return res.status(404).json({ error: '源产品没有测试模板' });
    
    const insert = db.prepare('INSERT OR IGNORE INTO test_templates (product_model, test_item, spec, sort_order) VALUES (?,?,?,?)');
    let copied = 0;
    for (const t of sourceTmpls) {
      insert.run(target_model, t.test_item, t.spec, t.sort_order);
      copied++;
    }
    res.json({ success: true, copied });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== Template Copy API ====================
app.post('/api/templates/copy', (req, res) => {
  try {
    const { source_model, target_model } = req.body;
    if (!source_model || !target_model) return res.status(400).json({ error: '源产品型号和目标产品型号不能为空' });
    if (source_model === target_model) return res.status(400).json({ error: '源产品和目标产品不能相同' });
    
    const sourceTmpls = db.prepare('SELECT * FROM test_templates WHERE product_model = ? ORDER BY sort_order').all(source_model);
    if (sourceTmpls.length === 0) return res.status(404).json({ error: '源产品没有测试模板' });
    
    const insert = db.prepare('INSERT OR IGNORE INTO test_templates (product_model, test_item, spec, sort_order) VALUES (?,?,?,?)');
    let copied = 0;
    for (const t of sourceTmpls) {
      insert.run(target_model, t.test_item, t.spec, t.sort_order);
      copied++;
    }
    res.json({ success: true, copied });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== Test Ledger API ====================

app.get('/api/ledger', (req, res) => {
  try {
    const { product_model, batch_no, judgment } = req.query;
    let sql = 'SELECT * FROM test_ledger WHERE 1=1';
    const params = [];
    if (product_model) { sql += ' AND product_model = ?'; params.push(product_model); }
    if (batch_no) { sql += ' AND batch_no = ?'; params.push(batch_no); }
    if (judgment) { sql += ' AND judgment = ?'; params.push(judgment); }
    sql += ' ORDER BY test_date DESC, id DESC LIMIT 500';
    res.json(db.prepare(sql).all(...params));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/ledger', (req, res) => {
  try {
    const { test_date, product_model, drawing_no, bom_no, batch_no, sample_no,
            test_item, spec, value1, value2, value3, defect_reason, tester, remark } = req.body;
    if (!test_date || !test_item) return res.status(400).json({ error: '测试日期和测试项目不能为空' });

    const avg = calculateAvg(value1, value2, value3);
    const judgment = calculateJudgment(spec, value1, value2, value3);

    const r = db.prepare(`INSERT INTO test_ledger 
      (test_date, product_model, drawing_no, bom_no, batch_no, sample_no,
       test_item, spec, value1, value2, value3, avg_value, judgment, defect_reason, tester, remark)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      test_date, product_model||'', drawing_no||'', bom_no||'', batch_no||'', sample_no||'',
      test_item, spec||'', value1, value2, value3, avg, judgment,
      judgment === '不合格' ? (defect_reason || '待分析') : '', tester||'', remark||''
    );
    res.status(201).json({ id: r.lastInsertRowid, judgment, avg_value: avg });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/ledger/stats', (req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) as c FROM test_ledger').get().c;
    const pass = db.prepare("SELECT COUNT(*) as c FROM test_ledger WHERE judgment = '合格'").get().c;
    const fail = db.prepare("SELECT COUNT(*) as c FROM test_ledger WHERE judgment = '不合格'").get().c;
    res.json({
      total, pass_count: pass, fail_count: fail,
      defect_rate: total > 0 ? Number((fail / total * 100).toFixed(2)) : 0
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== CSV Import API ====================
app.post('/api/ledger/import', (req, res) => {
  try {
    const { csv } = req.body;
    if (!csv) return res.status(400).json({ error: '请提供CSV数据' });

    const lines = csv.trim().split('\n');
    if (lines.length < 2) return res.status(400).json({ error: 'CSV至少需要标题行和一行数据' });

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const dateIdx = headers.findIndex(h => h.includes('日期') || h === 'test_date');
    const modelIdx = headers.findIndex(h => h.includes('型号') || h === 'product_model');
    const batchIdx = headers.findIndex(h => h.includes('批号') || h === 'batch_no');
    const itemIdx = headers.findIndex(h => h.includes('项目') || h === 'test_item');
    const specIdx = headers.findIndex(h => h.includes('规格') || h === 'spec');
    const v1Idx = headers.findIndex(h => h.includes('值1') || h === 'value1');
    const v2Idx = headers.findIndex(h => h.includes('值2') || h === 'value2');
    const v3Idx = headers.findIndex(h => h.includes('值3') || h === 'value3');
    const testerIdx = headers.findIndex(h => h.includes('测试人') || h === 'tester');

    const insert = db.prepare(`INSERT INTO test_ledger 
      (test_date, product_model, batch_no, test_item, spec, value1, value2, value3, avg_value, judgment, tester)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`);

    const results = { total: 0, success: 0, failed: 0, errors: [] };
    
    const tx = db.transaction(() => {
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim());
        results.total++;
        
        const test_date = dateIdx >= 0 ? cols[dateIdx] : '';
        const product_model = modelIdx >= 0 ? cols[modelIdx] : '';
        const batch_no = batchIdx >= 0 ? cols[batchIdx] : '';
        const test_item = itemIdx >= 0 ? cols[itemIdx] : '';
        const spec = specIdx >= 0 ? cols[specIdx] : '';
        const parseVal = (idx) => { if (idx < 0) return null; const v = cols[idx]; return v === '' || v === undefined ? null : parseFloat(v); };
        const v1 = parseVal(v1Idx);
        const v2 = parseVal(v2Idx);
        const v3 = parseVal(v3Idx);
        const tester = testerIdx >= 0 ? cols[testerIdx] : '';

        if (!test_date || !test_item) {
          results.failed++;
          results.errors.push(`行${i+1}: 日期和测试项目不能为空`);
          continue;
        }

        const avg = calculateAvg(v1, v2, v3);
        const judgment = calculateJudgment(spec, v1, v2, v3);

        insert.run(test_date, product_model||'', batch_no||'', test_item, spec||'', v1, v2, v3, avg, judgment, tester||'');
        results.success++;
      }
    });

    tx();
    res.json(results);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== Trend API ====================
app.get('/api/ledger/trend', (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 7, 90);
    const rows = db.prepare(`
      SELECT test_date,
             COUNT(*) as total,
             SUM(CASE WHEN judgment = '不合格' THEN 1 ELSE 0 END) as fail_count
      FROM test_ledger
      WHERE test_date >= date('now', ?)
      GROUP BY test_date
      ORDER BY test_date ASC
    `).all(`-${days} days`);

    // 填充缺失日期
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const found = rows.find(r => r.test_date === dateStr);
      result.push({
        date: dateStr,
        label: (d.getMonth() + 1) + '/' + d.getDate(),
        total: found ? found.total : 0,
        fail_count: found ? found.fail_count : 0,
        rate: found && found.total > 0 ? Number((found.fail_count / found.total * 100).toFixed(1)) : 0
      });
    }
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== CSV Export ====================
app.get('/api/ledger/export', (req, res) => {
  try {
    const { product_model, batch_no } = req.query;
    let sql = 'SELECT * FROM test_ledger WHERE 1=1';
    const params = [];
    if (product_model) { sql += ' AND product_model = ?'; params.push(product_model); }
    if (batch_no) { sql += ' AND batch_no = ?'; params.push(batch_no); }
    sql += ' ORDER BY test_date DESC';
    const records = db.prepare(sql).all(...params);
    
    const headers = '测试日期,产品型号,批号,测试项目,规格要求,值1,值2,值3,平均值,判定,不良原因,测试人\n';
    const rows = records.map(r => `${r.test_date},${r.product_model},${r.batch_no},${r.test_item},${r.spec},${r.value1??''},${r.value2??''},${r.value3??''},${r.avg_value??''},${r.judgment},${r.defect_reason||''},${r.tester||''}`).join('\n');
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="test_ledger_export.csv"');
    res.send('\uFEFF' + headers + rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== Global Search API ====================
app.get('/api/search', (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 1) return res.json({ products: [], ledger: [], boms: [], process: [], reports: [] });
    const like = `%${q}%`;
    const products = db.prepare('SELECT id, model, name, drawing_no FROM products WHERE model LIKE ? OR name LIKE ? OR drawing_no LIKE ? LIMIT 10').all(like, like, like);
    const ledger = db.prepare("SELECT id, test_date, product_model, test_item, batch_no, judgment FROM test_ledger WHERE test_item LIKE ? OR product_model LIKE ? OR batch_no LIKE ? OR spec LIKE ? LIMIT 10").all(like, like, like, like);
    const boms = db.prepare('SELECT id, bom_no, product_model, version FROM boms WHERE bom_no LIKE ? OR product_model LIKE ? LIMIT 10').all(like, like);
    const process = db.prepare("SELECT id, record_no, product_model, batch_no FROM process_records WHERE record_no LIKE ? OR product_model LIKE ? OR batch_no LIKE ? LIMIT 10").all(like, like, like);
    const reports = db.prepare('SELECT id, report_no, product_model, batch_no FROM test_reports WHERE report_no LIKE ? OR product_model LIKE ? OR batch_no LIKE ? LIMIT 10').all(like, like, like);
    res.json({ products, ledger, boms, process: process, reports });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== Batch list API ====================
app.get('/api/ledger/batches', (req, res) => {
  try {
    const rows = db.prepare("SELECT DISTINCT batch_no FROM test_ledger WHERE batch_no != '' ORDER BY batch_no DESC").all();
    res.json(rows.map(r => r.batch_no));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/ledger/:id', (req, res) => {
  try {
    const r = db.prepare('SELECT * FROM test_ledger WHERE id = ?').get(req.params.id);
    if (!r) return res.status(404).json({ error: '记录不存在' });
    res.json(r);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/ledger/:id', (req, res) => {
  try {
    const { test_date, product_model, drawing_no, bom_no, batch_no, sample_no,
            test_item, spec, value1, value2, value3, defect_reason, tester, remark } = req.body;
    const avg = calculateAvg(value1, value2, value3);
    const judgment = calculateJudgment(spec, value1, value2, value3);
    
    const r = db.prepare(`UPDATE test_ledger SET test_date=?, product_model=?, drawing_no=?, bom_no=?,
      batch_no=?, sample_no=?, test_item=?, spec=?, value1=?, value2=?, value3=?, 
      avg_value=?, judgment=?, defect_reason=?, tester=?, remark=? WHERE id=?`).run(
      test_date, product_model||'', drawing_no||'', bom_no||'', batch_no||'', sample_no||'',
      test_item, spec||'', value1, value2, value3, avg, judgment,
      judgment === '不合格' ? (defect_reason || '待分析') : '', tester||'', remark||'', req.params.id
    );
    if (r.changes === 0) return res.status(404).json({ error: '记录不存在' });
    res.json({ success: true, judgment, avg_value: avg });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/ledger/:id', (req, res) => {
  try {
    const r = db.prepare('DELETE FROM test_ledger WHERE id = ?').run(req.params.id);
    if (r.changes === 0) return res.status(404).json({ error: '记录不存在' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== Batch Delete API ====================
app.delete('/api/ledger/batch', (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: '请选择要删除的记录' });
    const placeholders = ids.map(() => '?').join(',');
    const r = db.prepare(`DELETE FROM test_ledger WHERE id IN (${placeholders})`).run(...ids);
    res.json({ success: true, deleted: r.changes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== Batch Delete API ====================
app.delete('/api/ledger/batch', (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: '请选择要删除的记录' });
    const placeholders = ids.map(() => '?').join(',');
    const r = db.prepare(`DELETE FROM test_ledger WHERE id IN (${placeholders})`).run(...ids);
    res.json({ success: true, deleted: r.changes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== BOM API ====================

app.get('/api/boms', (req, res) => {
  try {
    const { product_model } = req.query;
    let sql = 'SELECT * FROM boms';
    const params = [];
    if (product_model) { sql += ' WHERE product_model = ?'; params.push(product_model); }
    sql += ' ORDER BY created_at DESC';
    res.json(db.prepare(sql).all(...params));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/boms', (req, res) => {
  try {
    const { bom_no, product_model, drawing_no, version, creator, description } = req.body;
    if (!bom_no || !product_model) return res.status(400).json({ error: 'BOM编号和产品型号不能为空' });
    const r = db.prepare('INSERT INTO boms (bom_no, product_model, drawing_no, version, creator, description) VALUES (?,?,?,?,?,?)')
      .run(bom_no, product_model, drawing_no||'', version||'V1.0', creator||'', description||'');
    res.status(201).json({ id: r.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'BOM编号已存在' });
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/boms/:id/items', (req, res) => {
  try {
    res.json(db.prepare('SELECT * FROM bom_items WHERE bom_id = ? ORDER BY row_no').all(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/boms/:id/items', (req, res) => {
  try {
    const { row_no, material_code, material_name, spec, material, unit, quantity, loss_rate, supplier, is_key, remark } = req.body;
    const totalQty = (quantity || 0) * (1 + (loss_rate || 0) / 100);
    const r = db.prepare(`INSERT INTO bom_items 
      (bom_id, row_no, material_code, material_name, spec, material, unit, quantity, loss_rate, total_quantity, supplier, is_key, remark)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      req.params.id, row_no||0, material_code||'', material_name||'', spec||'', material||'',
      unit||'', quantity||0, loss_rate||0, Math.round(totalQty*1000)/1000, supplier||'', is_key||0, remark||''
    );
    res.status(201).json({ id: r.lastInsertRowid });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/boms/:id/items/:itemId', (req, res) => {
  try {
    db.prepare('DELETE FROM bom_items WHERE id = ? AND bom_id = ?').run(req.params.itemId, req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/boms/:id', (req, res) => {
  try {
    const { bom_no, product_model, drawing_no, version, creator, description } = req.body;
    const r = db.prepare('UPDATE boms SET bom_no=?, product_model=?, drawing_no=?, version=?, creator=?, description=? WHERE id=?')
      .run(bom_no, product_model, drawing_no||'', version||'V1.0', creator||'', description||'', req.params.id);
    if (r.changes === 0) return res.status(404).json({ error: 'BOM不存在' });
    res.json({ success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'BOM编号已存在' });
    res.status(500).json({ error: err.message });
  }
});

// ==================== Process API ====================

app.get('/api/process', (req, res) => {
  try {
    const { product_model } = req.query;
    let sql = 'SELECT * FROM process_records';
    const params = [];
    if (product_model) { sql += ' WHERE product_model = ?'; params.push(product_model); }
    sql += ' ORDER BY created_at DESC';
    res.json(db.prepare(sql).all(...params));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/process', (req, res) => {
  try {
    const { record_no, product_model, drawing_no, bom_no, batch_no, process_date, quantity, unit, responsible } = req.body;
    if (!record_no) return res.status(400).json({ error: '记录编号不能为空' });
    const r = db.prepare(`INSERT INTO process_records 
      (record_no, product_model, drawing_no, bom_no, batch_no, process_date, quantity, unit, responsible)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(record_no, product_model||'', drawing_no||'', bom_no||'', batch_no||'', process_date||'', quantity||0, unit||'m', responsible||'');
    res.status(201).json({ id: r.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: '记录编号已存在' });
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/process/:id/params', (req, res) => {
  try {
    res.json(db.prepare('SELECT * FROM process_params WHERE record_id = ?').all(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/process/:id/params', (req, res) => {
  try {
    const { process_name, param_name, spec, actual1, actual2, actual3, remark } = req.body;
    // 自动判定
    let judgment = '合格';
    if (spec && (actual1 !== null || actual2 !== null || actual3 !== null)) {
      const vals = [actual1, actual2, actual3].filter(v => v !== null && !isNaN(v));
      if (vals.length > 0) {
        const s = String(spec).trim();
        if (s.startsWith('≤') || s.startsWith('<')) {
          const limit = parseFloat(s.replace(/[^0-9.]/g, ''));
          judgment = vals.every(v => v <= limit) ? '合格' : '不合格';
        } else if (s.startsWith('≥') || s.startsWith('>')) {
          const limit = parseFloat(s.replace(/[^0-9.]/g, ''));
          judgment = vals.every(v => v >= limit) ? '合格' : '不合格';
        } else if (s.includes('±')) {
          const parts = s.split('±');
          const center = parseFloat(parts[0]), range = parseFloat(parts[1]);
          judgment = vals.every(v => v >= center - range && v <= center + range) ? '合格' : '不合格';
        } else if (s.includes('~') || s.includes('～')) {
          const sep = s.includes('~') ? '~' : '～';
          const parts = s.split(sep);
          judgment = vals.every(v => v >= parseFloat(parts[0]) && v <= parseFloat(parts[1])) ? '合格' : '不合格';
        }
      }
    }
    const r = db.prepare(`INSERT INTO process_params 
      (record_id, process_name, param_name, spec, actual1, actual2, actual3, judgment, remark) VALUES (?,?,?,?,?,?,?,?,?)`).run(
      req.params.id, process_name||'', param_name||'', spec||'', actual1, actual2, actual3, judgment, remark||''
    );
    res.status(201).json({ id: r.lastInsertRowid });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/process/:id', (req, res) => {
  try {
    const { record_no, product_model, drawing_no, bom_no, batch_no, process_date, quantity, unit, responsible } = req.body;
    const r = db.prepare(`UPDATE process_records SET record_no=?, product_model=?, drawing_no=?, bom_no=?,
      batch_no=?, process_date=?, quantity=?, unit=?, responsible=? WHERE id=?`)
      .run(record_no, product_model||'', drawing_no||'', bom_no||'', batch_no||'', process_date||'', quantity||0, unit||'m', responsible||'', req.params.id);
    if (r.changes === 0) return res.status(404).json({ error: '工艺记录不存在' });
    res.json({ success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: '记录编号已存在' });
    res.status(500).json({ error: err.message });
  }
});

// ==================== Reports API ====================

app.post('/api/reports/generate', (req, res) => {
  try {
    const { batch_no, product_model, client_name, standard, tester } = req.body;
    if (!batch_no) return res.status(400).json({ error: '批号不能为空' });

    // 获取该批次的所有测试记录
    const records = db.prepare('SELECT * FROM test_ledger WHERE batch_no = ?').all(batch_no);
    if (records.length === 0) return res.status(404).json({ error: '该批次没有测试记录' });

    // 生成报告编号
    const model = records[0].product_model || product_model || 'UNKNOWN';
    const reportNo = `TR-${model}-${batch_no}-V1.0`;
    
    // 创建报告
    const allPass = records.every(r => r.judgment === '合格');
    const conclusion = allPass ? '经测试，该批产品所有项目均符合规格要求，判定为合格。' : `经测试，该批产品存在不合格项，详见不良记录。`;
    
    const r = db.prepare(`INSERT INTO test_reports 
      (report_no, product_model, drawing_no, bom_no, batch_no, client_name, standard, test_date, report_date, conclusion, tester)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
      reportNo, model, records[0].drawing_no||'', records[0].bom_no||'', batch_no,
      client_name||'', standard||'', records[0].test_date, new Date().toISOString().slice(0,10), conclusion, tester||''
    );
    
    // 插入报告项目
    const insertItem = db.prepare(`INSERT INTO report_items 
      (report_id, test_item, spec, value1, value2, value3, avg_value, judgment) VALUES (?,?,?,?,?,?,?,?)`);
    for (const rec of records) {
      insertItem.run(r.lastInsertRowid, rec.test_item, rec.spec, rec.value1, rec.value2, rec.value3, rec.avg_value, rec.judgment);
    }

    res.status(201).json({ id: r.lastInsertRowid, report_no: reportNo });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: '该批次已存在测试报告' });
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports', (req, res) => {
  try {
    res.json(db.prepare('SELECT * FROM test_reports ORDER BY created_at DESC').all());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/reports/:id', (req, res) => {
  try {
    const report = db.prepare('SELECT * FROM test_reports WHERE id = ?').get(req.params.id);
    if (!report) return res.status(404).json({ error: '报告不存在' });
    report.items = db.prepare('SELECT * FROM report_items WHERE report_id = ?').all(req.params.id);
    res.json(report);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/reports/:id/export', (req, res) => {
  try {
    const report = db.prepare('SELECT * FROM test_reports WHERE id = ?').get(req.params.id);
    if (!report) return res.status(404).json({ error: '报告不存在' });
    report.items = db.prepare('SELECT * FROM report_items WHERE report_id = ?').all(req.params.id);
    
    // 生成HTML
    let itemsHtml = report.items.map((item, i) => `
      <tr${item.judgment === '不合格' ? ' style="background:#fff0f0"' : ''}>
        <td>${i+1}</td><td>${item.test_item}</td><td>${item.spec}</td>
        <td>${item.value1 ?? ''}</td><td>${item.value2 ?? ''}</td><td>${item.value3 ?? ''}</td>
        <td>${item.avg_value ?? ''}</td>
        <td style="color:${item.judgment === '合格' ? 'green' : 'red'};font-weight:bold">${item.judgment}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${report.report_no}</title>
<style>
body{font-family:SimSun,serif;max-width:900px;margin:40px auto;padding:20px}
h1{text-align:center;font-size:22px;margin-bottom:30px}
table{width:100%;border-collapse:collapse;margin:15px 0}
th,td{border:1px solid #333;padding:8px;text-align:center}
th{background:#e8e8e8}
.info-table td:first-child{background:#f5f5f5;width:120px;font-weight:bold}
.signature{margin-top:40px}
.signature td{width:33%;text-align:center}
</style></head><body>
<h1>线材测试报告</h1>
<p style="text-align:center;color:#666;margin-bottom:30px">${report.report_no}</p>
<table class="info-table">
<tr><td>产品型号</td><td>${report.product_model}</td><td>批号</td><td>${report.batch_no}</td></tr>
<tr><td>图纸编号</td><td>${report.drawing_no}</td><td>BOM编号</td><td>${report.bom_no}</td></tr>
<tr><td>测试标准</td><td>${report.standard||'—'}</td><td>客户</td><td>${report.client_name||'—'}</td></tr>
<tr><td>测试日期</td><td>${report.test_date||'—'}</td><td>报告日期</td><td>${report.report_date||'—'}</td></tr>
</table>
<h3>测试数据</h3>
<table><thead><tr>
<th>序号</th><th>测试项目</th><th>规格要求</th><th>测试值1</th><th>测试值2</th><th>测试值3</th><th>平均值</th><th>判定</th>
</tr></thead><tbody>${itemsHtml}</tbody></table>
<h3>结论</h3><p>${report.conclusion}</p>
<table class="signature"><tr><td>测试人: ${report.tester||'______'}</td><td>审核人: ${report.reviewer||'______'}</td><td>批准人: ${report.approver||'______'}</td></tr></table>
</body></html>`;
    if (req.query.format === 'doc') {
      res.setHeader('Content-Disposition', 'attachment; filename="'+report.report_no+'.doc"');
      res.setHeader('Content-Type', 'application/msword');
    } else {
      res.set('Content-Type', 'text/html; charset=utf-8');
    }
    res.send(html);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/reports/:id/sign', (req, res) => {
  try {
    const { reviewer, approver } = req.body;
    db.prepare('UPDATE test_reports SET reviewer=?, approver=? WHERE id=?')
      .run(reviewer||'', approver||'', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/reports/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM report_items WHERE report_id = ?').run(req.params.id);
    const r = db.prepare('DELETE FROM test_reports WHERE id = ?').run(req.params.id);
    if (r.changes === 0) return res.status(404).json({ error: '报告不存在' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== Start ====================
app.listen(PORT, () => {
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  线材研发管理系统 已启动`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
});
