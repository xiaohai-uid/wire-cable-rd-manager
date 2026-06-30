// ===== API 调用封装 =====
const API = {
  async get(url) {
    const r = await fetch(url);
    if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.error || `HTTP ${r.status}`); }
    return r.json();
  },
  async post(url, data) {
    const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.error || `HTTP ${r.status}`); }
    return r.json();
  },
  async put(url, data) {
    const r = await fetch(url, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.error || `HTTP ${r.status}`); }
    return r.json();
  },
  async del(url) {
    const r = await fetch(url, { method:'DELETE' });
    if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.error || `HTTP ${r.status}`); }
    return r.json();
  }
};

// ===== 工具函数 =====
function $(id) { return document.getElementById(id); }
function showToast(msg, type='success') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}
function escapeHtml(s) { 
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;').replace(/`/g,'&#96;');
}
function judgmentBadge(j) {
  if (j === '合格') return '<span class="badge badge-pass">合格</span>';
  if (j === '不合格') return '<span class="badge badge-fail">不合格</span>';
  return '<span class="badge badge-pending">待判定</span>';
}
function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('zh-CN');
}

// ===== 加载产品下拉选项 =====
async function loadProductSelect(selectId) {
  try {
    const products = await API.get('/api/products');
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = '<option value="">请选择</option>' + 
      products.map(p => `<option value="${escapeHtml(p.model)}">${escapeHtml(p.model)}${p.name ? ' - '+escapeHtml(p.name) : ''}</option>`).join('');
  } catch(e) {
    console.error('加载产品列表失败:', e);
  }
}