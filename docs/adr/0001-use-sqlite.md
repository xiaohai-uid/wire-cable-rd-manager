# ADR 0001: 使用 SQLite 作为数据库

## 状态

✅ 已采纳

## 背景

线材研发管理系统需要持久化存储测试台账、BOM、工艺记录、测试报告等数据。需选择一个适合本项目场景的数据库方案。

## 选项对比

| 选项 | 优势 | 劣势 |
|------|------|------|
| SQLite | 零配置、单文件、无需数据库服务、Windows 友好 | 不适合高并发写入 |
| MySQL | 功能完善、生态成熟 | 需要安装服务端、配置复杂 |
| JSON 文件存储 | 最简单、无需依赖 | 查询能力弱、并发不安全 |

## 决策

选择 **SQLite** 作为本地持久化数据库。

> **工单 06 落地更新**：具体实现采用 **Node 24 内置的 `node:sqlite`（`DatabaseSync`，同步 API）**，而非 `better-sqlite3`。
> 两者都满足本系统的两条硬要求（外键级联 + 显式事务），但 `node:sqlite` 无需原生编译，彻底规避
> `better-sqlite3` 在 Windows / 不同 Node 版本下的编译风险，且 API 形态（同步、预处理语句、事务）几乎一致。
> 详情见 `src/server/db.ts`。

## 理由

1. **零运维** —— 无数据库服务需要启动、停止、配置
2. **单文件数据** —— 整个数据库就是一个文件，复制即备份
3. **零原生编译** —— `node:sqlite` 随 Node 运行时自带，装好 Node 24 即可用，没有 `node-gyp` 编译环节
4. **足够性能** —— 单用户场景下 SQLite 性能绰绰有余
5. **支持 SQL** —— 相比 JSON 文件，支持条件查询、聚合统计（不良率计算）
6. **外键级联 + 事务** —— `PRAGMA foreign_keys = ON` 配合 `ON DELETE CASCADE`，删除产品时由内核保证不留孤儿记录；整批写入用显式 `BEGIN/COMMIT/ROLLBACK` 保证原子性（根治 1.0 的坑）

## 后果

- 本地服务的数据文件默认位于 `./wire-cable.db`（可用 `WIRE_DB` 环境变量覆盖），运行期被 gitignore
- 演示模式（GitHub Pages）走 MemoryAdapter，不碰 SQLite —— 见 ADR 0002
- 未来如需扩展到多用户，可把 `SqliteRepo` 换成远程实现，UI 与 `DataPort` 契约不变
