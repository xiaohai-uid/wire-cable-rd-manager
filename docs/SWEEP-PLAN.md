# 全面扫尾优化计划 (Sweep Plan)

> 基于全面代码审计发现的 76 个问题，分四批按优先级推进。

## P0: 严重 Bug 修复（4 项）

### B1: CSV导入/前端表单丢失零值
- **问题**: `parseFloat(v) || null` 将合法值 `0` 转为 `null`
- **修复**: 
  - `server.js:236-238` → 改用 `v1 = v1Idx >=0 ? (cols[v1Idx] === '' ? null : parseFloat(cols[v1Idx])) : null`
  - `ledger.html:196-197` → 同上
- **波及**: CSV 导入 + 前端新增/编辑表单

### B2: 趋势图实际查询真实数据
- **问题**: 折线图的 `rate` 硬编码为 `0`
- **修复**:
  - 新增 API `GET /api/ledger/trend?days=7` 按日汇总不良率
  - 前端调用该 API 绘制真实折线

### B6: 启用外键约束
- **问题**: 未执行 `PRAGMA foreign_keys = ON`
- **修复**: `database.js:13` 加 `db.pragma('foreign_keys = ON')`

### B4: BOM物料改用表单替代9个prompt弹窗
- **问题**: 9 个连续 `prompt()`，取消即丢失全部数据
- **修复**: `bom.html` 物料录入改为 Modal 表单（单窗口完成全部字段）

---

## P1: 用户体验提升（6 项）

### UX3: 全局加载状态
- **问题**: 所有页面无 loading 指示，网络延迟时显示空白
- **修复**: 给每个数据列表/卡片添加加载动画（CSS spinner + 骨架屏）

### UX2: 编辑单条记录使用精确 API
- **问题**: `ledger.html:161` 拉取全部记录再用 `.find()` 匹配
- **修复**: 改用 `GET /api/ledger/:id`

### UX6: 报告生成批次号下拉选择
- **问题**: 批次号需手动输入，不知有哪些批次
- **修复**: 新增 `GET /api/ledger/batches` 返回去重批次列表，报告生成页用 `<select>`

### UX8: Dashboard 快捷入口
- **问题**: 首页无快速跳转
- **修复**: 添加"快速操作"卡片组：新增测试 / 生成报告 / 管理产品

### MF14: 报告签名界面
- **问题**: API 存在但前端无签名功能
- **修复**: 报告预览/列表添加审核人、批准人填写/编辑入口

### 首页趋势图数据绑定
- 联动 B2 的后端 API，使首页折线图展示真实不良率走势

---

## P2: 核心功能补全（5 项）

### MF1: Word 导出
- **方案**: 生成 Word 兼容 HTML（支持 word/document.xml mhtml 或 html->doc）
- **修复**: `GET /api/reports/:id/export` 增加 `?format=doc` 参数
- **备选**: 不引入额外依赖，使用 Word 可打开的 `.doc` 格式 HTML

### MF2: 全局搜索
- **新增**: 导航栏添加搜索框，可跨产品/台账/BOM/工艺记录搜索
- **API**: `GET /api/search?q=xxx` 多表全文搜索

### 产品详情聚合页
- **新增**: 点击产品可查看该产品的所有测试记录、BOM、工艺记录、报告
- **实现**: 新增页面 `product-detail.html` 或产品列表增加展开行

### CSV 数据导出
- **新增**: 台账列表增加"导出 CSV"按钮
- **API**: `GET /api/ledger/export?product_model=xxx` 返回 CSV 文件

### 前端 CSV 导入界面
- **新增**: 台账页增加"导入 CSV"入口，弹出文件选择→预览→确认导入流程

---

## P3: 代码质量（批量）

### N+1 查询优化
- `products.html` 模板计数批量查询
- `bom.html` 物料明细批量加载
- `process.html` 参数批量加载

### 数据校验增强
- 所有表单添加 `maxlength` 限制
- 日期格式校验
- 数量非零校验

### escapeHtml 完善
- `api.js:34-37` 增加单引号和反引号转义

### 代码一致性
- `var` → `let`/`const` 统一
- 重复 CSS 样式提取
- 表单验证统一模式

---

## 执行顺序

```
P0 (Bug修复) → 测试验证 → 
P1 (UX提升) → 测试验证 → 
P2 (功能补全) → 测试验证 → 
P3 (代码质量) → 最终验证
```