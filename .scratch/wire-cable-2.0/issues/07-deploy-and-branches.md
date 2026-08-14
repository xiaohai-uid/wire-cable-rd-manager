# 07 — 部署与分支整理

**What to build:** 让别人不用 clone 代码就能评估这个系统 ——
一个点开就能用的在线 demo（演示模式，真实种子数据，数据不持久）。
同时把仓库整理干净：1.0 版完整保留在 `legacy` 分支可回溯，
`main` 成为 2.0 的正式历史，并消除远端同时存在 `main` 和 `master` 的混乱。

README 要说清楚两种运行方式的区别：在线 demo 是演示模式，
本地 `npm install && npm run dev` 才是真正落盘干活的模式。

**Blocked by:** 06 — HttpAdapter + Hono + SQLite

**Status:** ready-for-agent

- [ ] 1.0 版代码完整保留在 `legacy` 分支，可随时切回运行
- [ ] `main` 为 2.0 正式分支，远端默认分支统一为 `main`
- [ ] 在线 demo 可通过链接直接打开，界面与本地模式一致
- [ ] 在线 demo 使用 `MemoryAdapter`，带真实种子数据，可走通热力图 → 下钻 → 录入 → 判定闭环
- [ ] 在线 demo 有持续可见的「演示模式，数据不持久」标注
- [ ] README 说明两种运行方式、技术栈、以及 2.0 相对 1.0 的范围差异
- [ ] README 明确列出尚未迁移的 1.0 功能（BOM、工艺记录、测试报告、导入导出、搜索）及其去处
- [ ] 一次性原型文件 `prototype/ledger-ui.PROTOTYPE.html` 已删除
