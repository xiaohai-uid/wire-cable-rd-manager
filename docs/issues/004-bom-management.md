# Issue 4: BOM 管理

## What to build

BOM 物料清单管理模块。支持产品 BOM 的创建、物料明细管理、自动计算总用量。

**数据库层**：boms 表和 bom_items 表
**API 层**：
- `GET/POST /api/boms`、`GET/PUT/DELETE /api/boms/:id`
- `GET/POST /api/boms/:id/items`、`PUT/DELETE /api/boms/:id/items/:itemId`

**前端层**：BOM 列表页（`bom.html`）、BOM 详情页含物料明细表格

## Acceptance criteria

- [ ] 可创建 BOM（填写 BOM 编号、产品型号、图纸编号、版本、编制人）
- [ ] 可在 BOM 中添加多条物料明细（物料编码、名称、规格、用量、损耗率）
- [ ] 自动计算总用量 = 用量 × (1 + 损耗率/100)
- [ ] 可标记关键物料
- [ ] 可查看产品关联的所有 BOM

## Blocked by

- Issue 1 (需要产品和数据库)
