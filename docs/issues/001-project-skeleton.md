# Issue 1: 项目骨架 + 产品管理

## What to build

搭建项目的基础骨架：Express 服务器初始化、SQLite 数据库建表、静态文件服务、产品管理完整 CRUD。

这是后续所有 Issue 的基础设施，贯穿所有层面（数据库→API→前端）。

**数据库层**：初始化 products 表和后续所有表
**API 层**：`GET/POST /api/products`、`GET/PUT/DELETE /api/products/:id`
**前端层**：产品列表页（`products.html`）、新建/编辑产品的表单

## Acceptance criteria

- [ ] `npm install && npm start` 能正常启动服务，控制台输出 `服务器已启动: http://localhost:3789`
- [ ] 访问 `http://localhost:3789` 能看到导航页面
- [ ] 产品管理页面可查看已有产品列表
- [ ] 可新建产品（填写型号、名称、图纸编号、描述）
- [ ] 可编辑和删除产品
- [ ] 数据刷新后持久保留（SQLite 文件存储）

## Blocked by

None - can start immediately
