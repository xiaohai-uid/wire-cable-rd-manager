# ADR 0002: 改用现代技术栈，并把数据层抽象成双适配器

- **状态**: 已接受
- **日期**: 2026-08-14
- **取代**: PRD.md 中「前端：原生 HTML + CSS + JavaScript / UI 框架：无」的选择

## 背景

1.0 版刻意选了零构建的原生前端，理由是「无构建步骤、零依赖、直接浏览器打开」，
并要求「任意 Windows 机器上 `npm install && npm start` 一键启动」。

这个约束当时是合理的，但它带来了两类实际代价：

**代价一：边界处没有类型和校验，导致一批同源 bug。**
`docs/SWEEP-PLAN.md` 里记录的 76 个问题中，最严重的几个是同一个病：

| 症状 | 位置 | 根因 |
|---|---|---|
| CSV 导入和表单把合法值 `0` 吞成 `null` | `server.js` / `ledger.html` | `parseFloat(v) \|\| null`，`0` 是 falsy |
| 趋势图不良率恒为 0 | `index.html` | `rate` 硬编码，没有对应 API |
| 删除产品留下孤儿测试记录 | `database.js` | 忘记 `PRAGMA foreign_keys = ON` |
| 报告页批次下拉框加载不出 | `/api/ledger/batches` | 返回结构与前端预期不符，无人察觉 |

这些不是「不够仔细」造成的，是**边界处缺少结构性约束**造成的。
靠 code review 抓这类问题是碰运气；靠类型和 schema 校验则是必然抓到。

**代价二：手写 DOM 让重复代码不可避免。**
`server.js` 中 `DELETE /api/ledger/batch` 被定义了 4 次、`POST /api/templates/copy` 被定义了 2 次；
判定逻辑在 `server.js` 和 `seed-real-data.js` 里各写了一份。
没有模块边界，复制粘贴就是最省力的路径。

## 决策

**一、技术栈现代化**

| 层面 | 选择 | 解决什么 |
|---|---|---|
| 构建 | Vite | 秒级 HMR，取代「改完手动刷新」 |
| 语言 | TypeScript（strict） | 结构性消灭 `parseFloat(v) \|\| null` 这类 bug |
| UI | React + Tailwind | 组件复用，样式不再靠复制 CSS 块 |
| 表格 | TanStack Table | 台账是表格密集型应用，这是该场景的成熟解 |
| 校验 | Zod | 前后端共用一份 schema，边界处强制校验 |
| 后端 | Hono + better-sqlite3 | 保留 SQLite 单文件优势（见 ADR 0001） |
| 测试 | Vitest | 判定逻辑必须有测试兜底 |

**二、数据层抽象成 `DataPort` 接口，提供两个适配器**

```
        ┌──────────────── UI (React) ────────────────┐
        │        只依赖 DataPort 这个 interface        │
        └────────────────────┬───────────────────────┘
                             │
             ┌───────────────┴───────────────┐
             ▼                               ▼
      HttpAdapter                     MemoryAdapter
   fetch → Hono → SQLite        内存 + localStorage，真实种子数据
   （本地真实干活，数据落盘）      （GitHub Pages 在线 demo，点开就能试）
```

判定逻辑、规格解析、不良率统计等**领域逻辑是纯函数**，两个适配器共用，不重复实现。

## 后果

**得到**
- 类型与 Zod 在边界处掐死了 1.0 版那批数值/结构 bug
- 组件化后不再有重复 CSS 块和重复路由
- 多出一个可在线访问的 demo 链接，不必 clone 就能评估

**付出**
- 引入构建步骤，违背 1.0 版「零构建」原则 —— 但 `npm install && npm run dev` 依然是一条命令，
  对目标用户（研发岗，装过 Node）不构成真实门槛
- 双适配器意味着领域逻辑必须严格与传输层解耦（这本身是好事，但需要纪律）
- 在线 demo 的数据存在浏览器里，必须显著标注「演示模式，数据不持久」

## 备选方案

- **保持原生前端，只做干净重写**：成本最低，但无法结构性解决类型类 bug，且用户明确表示技术栈「太 low」。
- **纯静态 + 浏览器内 SQLite WASM**：部署最简单，但把真实工作数据放在浏览器里有丢数据风险，
  与「真要拿来干活」的定位冲突。
