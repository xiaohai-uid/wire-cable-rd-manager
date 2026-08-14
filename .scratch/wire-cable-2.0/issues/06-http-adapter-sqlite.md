# 06 — HttpAdapter + Hono + SQLite（本地真干活）

**What to build:** 让同一套界面在本地运行时把数据真正落到 SQLite 文件 ——
这是「真要拿来干活」的定位所要求的那一半（ADR 0002）。
`HttpAdapter` 实现与 `MemoryAdapter` 完全相同的 `DataPort` 接口，
所以 UI 一行都不用改。

本工单的验收核心是**契约测试跑两遍**：针对 `DataPort` 接口写一套测试，
对 `MemoryAdapter` 和 `HttpAdapter` 各跑一遍，两边都必须绿。
这直接保证「在线 demo 里看到的行为就是本地会得到的行为」，
也把 1.0 版「API 返回结构与前端预期不符却无人察觉」这类问题挡在边界上。

外键必须真的开着，整批写入必须真的是事务 —— 这两条都要有测试，不靠人记得。

**Blocked by:** 04 — 批次录入网格；05 — 产品与测试模板管理

**Status:** ready-for-agent

- [ ] Hono + better-sqlite3 后端可启动，数据落到 SQLite 文件
- [ ] `HttpAdapter` 实现完整 `DataPort` 接口，UI 切换适配器无需改动
- [ ] 建立连接时立即执行 `PRAGMA foreign_keys = ON`，并有测试证明外键真的生效
- [ ] 整批写入由 SQLite 事务保证原子性，有测试证明部分失败时不留残留
- [ ] 所有跨边界数据用 Zod schema 校验，前后端共用同一份定义
- [ ] `HttpAdapter` 的响应经 schema 解析后才交给 UI
- [ ] 一套 `DataPort` 契约测试对两个适配器各跑一遍，全部通过
- [ ] 契约测试覆盖：`0` 值往返不失真、查询空结果返回空集合而非 undefined、删除级联生效
- [ ] 每个 API 端点只定义一次（1.0 版有端点被定义 4 次）
- [ ] 构建时可通过环境变量选择默认适配器
