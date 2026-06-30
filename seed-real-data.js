const db = require('./database');

// 清空所有数据
db.exec('DELETE FROM report_items; DELETE FROM test_reports; DELETE FROM process_params; DELETE FROM process_records; DELETE FROM bom_items; DELETE FROM boms; DELETE FROM test_templates; DELETE FROM test_ledger; DELETE FROM products;');
console.log('✅ 所有旧数据已清空');

// ========== 1. 创建真实产品 ==========
const products = [
  {model:'RV-0.5',  name:'RV 0.5mm2 多股软电线', drawing_no:'DRG-RV-0.5-V2.1', desc:'GB/T 5023.3-2008 内部布线用'},
  {model:'RVV-3x1.5', name:'RVV 3x1.5mm2 护套线', drawing_no:'DRG-RVV-3x1.5-V1.0', desc:'GB/T 5023.5-2008 轻型护套软电缆'},
  {model:'SYV-75-5', name:'SYV 75-5 同轴电缆', drawing_no:'DRG-SYV-75-5-V3.0', desc:'SJ/T 11138-1997 视频同轴电缆'},
  {model:'BV-2.5', name:'BV 2.5mm2 单芯硬导体', drawing_no:'DRG-BV-2.5-V1.2', desc:'GB/T 5023.3-2008 固定布线用'},
  {model:'H05VV-F', name:'H05VV-F 3G1.0mm2 欧标电源线', drawing_no:'DRG-H05VV-F-V2.0', desc:'EN 50525-2-11 欧标电源线'},
];

const insertProduct = db.prepare('INSERT INTO products (model, name, drawing_no, description) VALUES (?,?,?,?)');
products.forEach(p => insertProduct.run(p.model, p.name, p.drawing_no, p.desc));
console.log('✅ 创建了 ' + products.length + ' 个真实产品');

// ========== 2. 创建产品测试模板 ==========
const templates = [
  {model:'RV-0.5', items:[
    {item:'导体电阻', spec:'≤0.5Ω'}, {item:'绝缘耐压', spec:'≥1500V'}, {item:'绝缘电阻', spec:'≥100MΩ'},
    {item:'外径尺寸', spec:'2.8±0.2mm'}, {item:'绝缘厚度', spec:'≥0.6mm'}, {item:'伸长率', spec:'≥120%'},
    {item:'老化测试', spec:'≥80%'}, {item:'外观检查', spec:'合格'}, {item:'导通测试', spec:'合格'},
    {item:'火花测试', spec:'≥3000V'},
  ]},
  {model:'RVV-3x1.5', items:[
    {item:'导体电阻', spec:'≤0.524Ω'}, {item:'绝缘耐压', spec:'≥2000V'}, {item:'绝缘电阻', spec:'≥100MΩ'},
    {item:'护套厚度', spec:'≥0.8mm'}, {item:'外径尺寸', spec:'8.4±0.4mm'}, {item:'绝缘厚度', spec:'≥0.8mm'},
    {item:'伸长率(绝缘)', spec:'≥100%'}, {item:'伸长率(护套)', spec:'≥100%'}, {item:'老化测试', spec:'≥80%'},
    {item:'外观检查', spec:'合格'}, {item:'导通测试', spec:'合格'}, {item:'曲挠试验', spec:'≥20000次'},
  ]},
  {model:'SYV-75-5', items:[
    {item:'导体电阻', spec:'≤0.5Ω'}, {item:'绝缘电阻', spec:'≥5000MΩ·km'}, {item:'特性阻抗', spec:'75±3Ω'},
    {item:'衰减常数(30MHz)', spec:'≤0.22dB/m'}, {item:'衰减常数(200MHz)', spec:'≤0.55dB/m'},
    {item:'电容', spec:'≤67pF/m'}, {item:'回波损耗', spec:'≥20dB'}, {item:'护套厚度', spec:'≥0.7mm'},
    {item:'外径尺寸', spec:'7.2±0.3mm'}, {item:'外观检查', spec:'合格'},
  ]},
  {model:'BV-2.5', items:[
    {item:'导体电阻', spec:'≤0.727Ω'}, {item:'绝缘耐压', spec:'≥2500V'}, {item:'绝缘电阻', spec:'≥100MΩ'},
    {item:'绝缘厚度', spec:'≥0.8mm'}, {item:'外径尺寸', spec:'3.7±0.2mm'}, {item:'伸长率', spec:'≥120%'},
    {item:'老化测试', spec:'≥80%'}, {item:'外观检查', spec:'合格'}, {item:'不延燃试验', spec:'合格'},
  ]},
  {model:'H05VV-F', items:[
    {item:'导体电阻', spec:'≤0.524Ω'}, {item:'绝缘耐压', spec:'≥2000V'}, {item:'绝缘电阻', spec:'≥100MΩ'},
    {item:'护套厚度', spec:'≥0.6mm'}, {item:'外径尺寸', spec:'6.8±0.4mm'}, {item:'绝缘厚度', spec:'≥0.6mm'},
    {item:'伸长率', spec:'≥100%'}, {item:'老化测试', spec:'≥80%'}, {item:'外观检查', spec:'合格'},
    {item:'耐压测试', spec:'≥2000V'}, {item:'曲挠试验', spec:'≥30000次'},
  ]},
];

const insertTmpl = db.prepare('INSERT INTO test_templates (product_model, test_item, spec, sort_order) VALUES (?,?,?,?)');
let tmplCount = 0;
templates.forEach(t => {
  t.items.forEach((item, i) => { insertTmpl.run(t.model, item.item, item.spec, i); tmplCount++; });
});
console.log('✅ 创建了 ' + tmplCount + ' 个测试模板项');

// ========== 3. 判定辅助函数 ==========
function judge(spec, v1, v2, v3) {
  const vals = [v1,v2,v3].filter(v => v !== null && !isNaN(v));
  if (vals.length === 0) return ['', null];
  const avg = Math.round(vals.reduce((a,b)=>a+b,0)/vals.length*10000)/10000;
  if (!spec) return ['待判定', avg];
  const s = String(spec).trim();
  if (s.startsWith('≤')||s.startsWith('<')) {
    const limit = parseFloat(s.replace(/[^0-9.]/g,''));
    return [vals.every(v=>v<=limit)?'合格':'不合格', avg];
  }
  if (s.startsWith('≥')||s.startsWith('>')) {
    const limit = parseFloat(s.replace(/[^0-9.]/g,''));
    return [vals.every(v=>v>=limit)?'合格':'不合格', avg];
  }
  if (s.includes('±')) {
    const parts = s.split('±');
    const center = parseFloat(parts[0]), range = parseFloat(parts[1]);
    return [vals.every(v=>v>=center-range&&v<=center+range)?'合格':'不合格', avg];
  }
  if (s.includes('~')||s.includes('～')) {
    const sep = s.includes('~')?'~':'～';
    const parts = s.split(sep);
    return [vals.every(v=>v>=parseFloat(parts[0])&&v<=parseFloat(parts[1]))?'合格':'不合格', avg];
  }
  if (s === '合格') return ['合格', avg]; // 定性判定: 输入1即为合格
  return ['待判定', avg];
}

// ========== 4. 生成真实测试数据 ==========
const insertLedger = db.prepare('INSERT INTO test_ledger (test_date, product_model, drawing_no, batch_no, sample_no, test_item, spec, value1, value2, value3, avg_value, judgment, defect_reason, tester, remark) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');

const testData = [
  {date:'2026-06-20', model:'RV-0.5', drawing:'DRG-RV-0.5-V2.1', batch:'RV-20260601', tester:'李明', data:[
    {item:'导体电阻', spec:'≤0.5Ω', v:[0.42,0.44,0.43]},
    {item:'绝缘耐压', spec:'≥1500V', v:[1800,1750,1820]},
    {item:'绝缘电阻', spec:'≥100MΩ', v:[250,220,260]},
    {item:'外径尺寸', spec:'2.8±0.2mm', v:[2.85,2.82,2.88]},
    {item:'绝缘厚度', spec:'≥0.6mm', v:[0.68,0.65,0.70]},
    {item:'伸长率', spec:'≥120%', v:[145,138,152]},
    {item:'老化测试', spec:'≥80%', v:[92,89,95]},
    {item:'外观检查', spec:'合格', v:[1,1,1]},
    {item:'导通测试', spec:'合格', v:[1,1,1]},
    {item:'火花测试', spec:'≥3000V', v:[3500,3400,3550]},
  ]},
  {date:'2026-06-22', model:'RV-0.5', drawing:'DRG-RV-0.5-V2.1', batch:'RV-20260602', tester:'王芳', data:[
    {item:'导体电阻', spec:'≤0.5Ω', v:[0.48,0.52,0.49]},
    {item:'绝缘耐压', spec:'≥1500V', v:[1650,1700,1680]},
    {item:'绝缘电阻', spec:'≥100MΩ', v:[200,180,210]},
    {item:'外径尺寸', spec:'2.8±0.2mm', v:[2.75,2.80,2.72]},
    {item:'绝缘厚度', spec:'≥0.6mm', v:[0.62,0.60,0.64]},
    {item:'伸长率', spec:'≥120%', v:[130,125,135]},
    {item:'老化测试', spec:'≥80%', v:[88,85,90]},
    {item:'外观检查', spec:'合格', v:[1,1,1]},
    {item:'导通测试', spec:'合格', v:[1,1,1]},
    {item:'火花测试', spec:'≥3000V', v:[3200,3100,3300]},
  ]},
  {date:'2026-06-23', model:'RVV-3x1.5', drawing:'DRG-RVV-3x1.5-V1.0', batch:'RVV-20260601', tester:'李明', data:[
    {item:'导体电阻', spec:'≤0.524Ω', v:[0.45,0.47,0.44]},
    {item:'绝缘耐压', spec:'≥2000V', v:[2400,2350,2450]},
    {item:'绝缘电阻', spec:'≥100MΩ', v:[180,190,175]},
    {item:'护套厚度', spec:'≥0.8mm', v:[0.95,0.92,0.98]},
    {item:'外径尺寸', spec:'8.4±0.4mm', v:[8.30,8.35,8.25]},
    {item:'绝缘厚度', spec:'≥0.8mm', v:[0.88,0.85,0.90]},
    {item:'伸长率(绝缘)', spec:'≥100%', v:[115,110,120]},
    {item:'伸长率(护套)', spec:'≥100%', v:[125,118,130]},
    {item:'老化测试', spec:'≥80%', v:[90,87,93]},
    {item:'外观检查', spec:'合格', v:[1,1,1]},
    {item:'导通测试', spec:'合格', v:[1,1,1]},
    {item:'曲挠试验', spec:'≥20000次', v:[28500,27500,29500]},
  ]},
  {date:'2026-06-24', model:'SYV-75-5', drawing:'DRG-SYV-75-5-V3.0', batch:'SYV-20260601', tester:'张伟', data:[
    {item:'导体电阻', spec:'≤0.5Ω', v:[0.35,0.37,0.34]},
    {item:'绝缘电阻', spec:'≥5000MΩ·km', v:[8500,8200,8800]},
    {item:'特性阻抗', spec:'75±3Ω', v:[74.5,74.8,74.2]},
    {item:'衰减常数(30MHz)', spec:'≤0.22dB/m', v:[0.18,0.19,0.17]},
    {item:'衰减常数(200MHz)', spec:'≤0.55dB/m', v:[0.45,0.47,0.44]},
    {item:'电容', spec:'≤67pF/m', v:[58,60,56]},
    {item:'回波损耗', spec:'≥20dB', v:[18.5,19.2,17.8]},
    {item:'护套厚度', spec:'≥0.7mm', v:[0.78,0.75,0.80]},
    {item:'外径尺寸', spec:'7.2±0.3mm', v:[7.15,7.20,7.10]},
    {item:'外观检查', spec:'合格', v:[1,1,1]},
  ]},
  {date:'2026-06-25', model:'BV-2.5', drawing:'DRG-BV-2.5-V1.2', batch:'BV-20260601', tester:'王芳', data:[
    {item:'导体电阻', spec:'≤0.727Ω', v:[0.62,0.65,0.60]},
    {item:'绝缘耐压', spec:'≥2500V', v:[3000,2950,3050]},
    {item:'绝缘电阻', spec:'≥100MΩ', v:[300,280,320]},
    {item:'绝缘厚度', spec:'≥0.8mm', v:[0.92,0.90,0.95]},
    {item:'外径尺寸', spec:'3.7±0.2mm', v:[3.75,3.72,3.80]},
    {item:'伸长率', spec:'≥120%', v:[135,128,140]},
    {item:'老化测试', spec:'≥80%', v:[72,68,75]},
    {item:'外观检查', spec:'合格', v:[1,1,1]},
    {item:'不延燃试验', spec:'合格', v:[1,1,1]},
  ]},
  {date:'2026-06-26', model:'H05VV-F', drawing:'DRG-H05VV-F-V2.0', batch:'H05VV-20260601', tester:'李明', data:[
    {item:'导体电阻', spec:'≤0.524Ω', v:[0.42,0.44,0.41]},
    {item:'绝缘耐压', spec:'≥2000V', v:[2500,2450,2550]},
    {item:'绝缘电阻', spec:'≥100MΩ', v:[220,200,240]},
    {item:'护套厚度', spec:'≥0.6mm', v:[0.72,0.70,0.75]},
    {item:'外径尺寸', spec:'6.8±0.4mm', v:[6.65,6.70,6.60]},
    {item:'绝缘厚度', spec:'≥0.6mm', v:[0.68,0.65,0.70]},
    {item:'伸长率', spec:'≥100%', v:[118,112,122]},
    {item:'老化测试', spec:'≥80%', v:[92,89,94]},
    {item:'外观检查', spec:'合格', v:[1,1,1]},
    {item:'耐压测试', spec:'≥2000V', v:[2600,2550,2650]},
    {item:'曲挠试验', spec:'≥30000次', v:[38500,37500,39500]},
  ]},
];

let totalRecords = 0;
const tx = db.transaction(() => {
  testData.forEach(batch => {
    batch.data.forEach(d => {
      const [j, avg] = judge(d.spec, d.v[0], d.v[1], d.v[2]);
      insertLedger.run(batch.date, batch.model, batch.drawing, batch.batch, '', d.item, d.spec, d.v[0], d.v[1], d.v[2], avg, j,
        j === '不合格' ? '待分析' : '', batch.tester, '');
      totalRecords++;
    });
  });
});
tx();
const pass = db.prepare("SELECT COUNT(*) as c FROM test_ledger WHERE judgment='合格'").get().c;
const fail = db.prepare("SELECT COUNT(*) as c FROM test_ledger WHERE judgment='不合格'").get().c;
console.log('✅ 创建了 ' + totalRecords + ' 条测试记录');
console.log('   合格: ' + pass + ' | 不合格: ' + fail + ' | 不良率: ' + (fail/totalRecords*100).toFixed(1) + '%');

// ========== 5. 创建BOM ==========
const insertBom = db.prepare('INSERT INTO boms (bom_no, product_model, drawing_no, version, creator, description) VALUES (?,?,?,?,?,?)');
const insertItem = db.prepare('INSERT INTO bom_items (bom_id, row_no, material_code, material_name, spec, material, unit, quantity, loss_rate, total_quantity, supplier, is_key, remark) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');

const boms = [
  {bom_no:'BOM-RV-0.5-V1.0', model:'RV-0.5', drawing:'DRG-RV-0.5-V2.1', creator:'李明',
   items:[
     {row:1, code:'CU-0.15-7', name:'镀锡铜绞线 0.15mmx7', spec:'0.15mm×7', mat:'镀锡铜', unit:'kg', qty:4.2, loss:3, key:1, supplier:'铜陵有色'},
     {row:2, code:'PVC-I-80A', name:'PVC绝缘料 80A 红', spec:'80A 红色', mat:'PVC', unit:'kg', qty:3.8, loss:5, key:0, supplier:'中化塑料'},
   ]},
  {bom_no:'BOM-RVV-3x1.5-V1.0', model:'RVV-3x1.5', drawing:'DRG-RVV-3x1.5-V1.0', creator:'王芳',
   items:[
     {row:1, code:'CU-0.20-24', name:'裸铜绞线 0.20mmx24', spec:'0.20mm×24', mat:'裸铜', unit:'kg', qty:14.5, loss:3, key:1, supplier:'铜陵有色'},
     {row:2, code:'PVC-I-90A', name:'PVC绝缘料 90A', spec:'90A', mat:'PVC', unit:'kg', qty:8.2, loss:5, key:0, supplier:'中化塑料'},
     {row:3, code:'PVC-S-80A', name:'PVC护套料 80A 黑', spec:'80A 黑色', mat:'PVC', unit:'kg', qty:6.5, loss:5, key:0, supplier:'中化塑料'},
     {row:4, code:'FILLER-PP', name:'PP填充绳', spec:'3mm', mat:'PP', unit:'kg', qty:1.2, loss:8, key:0, supplier:'华源塑胶'},
   ]},
  {bom_no:'BOM-SYV-75-5-V2.0', model:'SYV-75-5', drawing:'DRG-SYV-75-5-V3.0', creator:'张伟',
   items:[
     {row:1, code:'CU-1.0-BC', name:'裸铜线 1.0mm', spec:'1.0mm', mat:'裸铜', unit:'kg', qty:3.5, loss:2, key:1, supplier:'铜陵有色'},
     {row:2, code:'PE-FOAM', name:'物理发泡PE绝缘料', spec:'发泡度≥75%', mat:'PE', unit:'kg', qty:2.8, loss:6, key:1, supplier:'埃克森美孚'},
     {row:3, code:'AL-FOIL', name:'铝箔麦拉带', spec:'0.05mm×50mm', mat:'铝箔', unit:'m', qty:120, loss:5, key:0, supplier:'金汇科技'},
     {row:4, code:'CU-BRAID-16x3', name:'镀锡铜编织网 16x3', spec:'16×3/0.15', mat:'镀锡铜', unit:'kg', qty:1.8, loss:4, key:0, supplier:'金汇科技'},
     {row:5, code:'PVC-S-70A', name:'PVC护套料 70A 黑', spec:'70A 黑色', mat:'PVC', unit:'kg', qty:4.5, loss:5, key:0, supplier:'中化塑料'},
   ]},
];

let bomCount = 0, itemCount = 0;
boms.forEach(b => {
  const r = insertBom.run(b.bom_no, b.model, b.drawing, 'V1.0', b.creator, '');
  const bomId = r.lastInsertRowid; bomCount++;
  b.items.forEach(item => {
    const totalQty = item.qty * (1 + item.loss/100);
    insertItem.run(bomId, item.row, item.code, item.name, item.spec, item.mat, item.unit, item.qty, item.loss, Math.round(totalQty*1000)/1000, item.supplier, item.key, '');
    itemCount++;
  });
});
console.log('✅ 创建了 ' + bomCount + ' 个BOM, 共 ' + itemCount + ' 条物料明细');

// ========== 6. 创建一个工艺记录 ==========
const insertProcess = db.prepare('INSERT INTO process_records (record_no, product_model, drawing_no, bom_no, batch_no, process_date, quantity, unit, responsible) VALUES (?,?,?,?,?,?,?,?,?)');
const insertParam = db.prepare('INSERT INTO process_params (record_id, process_name, param_name, spec, actual1, actual2, actual3, judgment, remark) VALUES (?,?,?,?,?,?,?,?,?)');

const pr = insertProcess.run('GY-RV-0.5-20260601', 'RV-0.5', 'DRG-RV-0.5-V2.1', 'BOM-RV-0.5-V1.0', 'RV-20260601', '2026-06-19', 5000, 'm', '李明');
const pid = pr.lastInsertRowid;
const params = [
  {proc:'导体绞合', param:'绞距', spec:'18±1mm', v:[18.5,18.2,18.8]},
  {proc:'导体绞合', param:'张力', spec:'5±0.5N', v:[5.2,5.0,5.3]},
  {proc:'绝缘挤出', param:'螺杆温度1区', spec:'165±5°C', v:[167,166,168]},
  {proc:'绝缘挤出', param:'螺杆温度2区', spec:'170±5°C', v:[172,171,173]},
  {proc:'绝缘挤出', param:'线速', spec:'120±10m/min', v:[118,122,120]},
  {proc:'火花测试', param:'电压', spec:'≥3000V', v:[3200,3100,3300]},
  {proc:'成卷包装', param:'卷长', spec:'100±1m', v:[100.2,100.0,100.3]},
];
params.forEach(p => {
  const avg = (p.v[0]+p.v[1]+p.v[2])/3;
  insertParam.run(pid, p.proc, p.param, p.spec, p.v[0], p.v[1], p.v[2], avg >= 0 ? '合格' : '不合格', '');
});
console.log('✅ 创建了 1 条工艺记录, 含 ' + params.length + ' 个工艺参数');

// ========== 7. 生成测试报告 ==========
// 为RV-20260601批次生成报告
const rvRecords = db.prepare("SELECT * FROM test_ledger WHERE batch_no='RV-20260601'").all();
const allPass = rvRecords.every(r => r.judgment === '合格');
const conclusion = allPass
  ? '经测试，该批产品所有项目均符合规格要求，判定为合格。'
  : '经测试，该批产品存在不合格项，详见不良记录。';
const reportNo = 'TR-RV-0.5-RV-20260601-V1.0';
const insertReport = db.prepare('INSERT INTO test_reports (report_no, product_model, drawing_no, bom_no, batch_no, client_name, standard, test_date, report_date, conclusion, tester) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
const insertReportItem = db.prepare('INSERT INTO report_items (report_id, test_item, spec, value1, value2, value3, avg_value, judgment) VALUES (?,?,?,?,?,?,?,?)');

const report = insertReport.run(reportNo, 'RV-0.5', 'DRG-RV-0.5-V2.1', 'BOM-RV-0.5-V1.0', 'RV-20260601', '华为技术', 'GB/T 5023.3-2008', '2026-06-20', '2026-06-21', conclusion, '李明');
rvRecords.forEach(r => {
  insertReportItem.run(report.lastInsertRowid, r.test_item, r.spec, r.value1, r.value2, r.value3, r.avg_value, r.judgment);
});
console.log('✅ 创建了 1 份测试报告');

console.log('\n========== 数据填充完成 ==========');
console.log('产品: ' + products.length);
console.log('测试模板: ' + tmplCount);
console.log('测试记录: ' + totalRecords + ' (合格' + pass + '/不合格' + fail + ')');
console.log('BOM: ' + bomCount);
console.log('工艺记录: ' + 1);
console.log('测试报告: ' + 1);
console.log('不良率: ' + (fail/totalRecords*100).toFixed(1) + '%');