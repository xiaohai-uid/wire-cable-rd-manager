# Issue 5: 打样工艺记录

## What to build

打样工艺记录模块。记录每批次打样的设备参数、各工序参数和首件检验结果。

**数据库层**：process_records 表和 process_params 表
**API 层**：
- `GET/POST /api/process`、`GET/PUT/DELETE /api/process/:id`
- `GET/POST /api/process/:id/params`、`PUT/DELETE /api/process/:id/params/:paramId`

**前端层**：工艺记录列表页（`process.html`）、工艺详情页含参数表格

## Acceptance criteria

- [ ] 可创建工艺记录（记录编号、产品型号、图纸、BOM、批次、日期）
- [ ] 可在记录中添加多个工序参数（工序名称、参数名、规格、实际值）
- [ ] 支持三个实际值录入和自动判定
- [ ] 可查看产品关联的所有工艺记录

## Blocked by

- Issue 1 (需要产品和数据库)
