<!--
*** 线材研发一体化管理系统 · 2.0 ***
-->

# 📐 Wire Cable RD Manager · 线材研发质量管理系统（2.0）

> **线材 / 电缆研发岗位的一站式质量数据工具** —— 质量热力图、点格同页下钻、批次网格录入、产品与测试模板管理。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D24-brightgreen)](https://nodejs.org)
[![SQLite](https://img.shields.io/badge/database-SQLite-blue)](https://sqlite.org)
[![Tests](https://img.shields.io/badge/tests-204%20passed-brightgreen)](docs/TEST-RESULTS.md)

---

## ✨ 功能概览

| 模块 | 说明 |
|------|------|
| 🔥 **质量热力图首页** | 产品 × 测试项的不良率矩阵，红绿一眼看出哪批、哪项最该盯；点格即下钻，不跳页 |
| 🔍 **点格同页下钻** | 点任意格 → 右侧抽屉展开该格全部批次记录，URL 同步状态，刷新 / 分享链接都能还原 |
| 📋 **批次录入网格** | 一个网格整批录入（替代 1.0 的 12 次弹窗），自动算均值、自动判定合格 / 不合格、不合格高亮 |
| 🧩 **产品与测试模板** | 产品型号 + 图纸编号统一管理；测试模板带**实时规格解析预览**，写错规格当场标红 |
| 🗑️ **级联删除确认** | 删产品前先告诉你会连带清掉多少模板和台账记录，不让你误删留孤儿 |

### 核心特色

- ⚡ **判定引擎**：四种规格类型（上限 / 下限 / 范围 / 定性）自动算均值并判定，规则用类型化结构表达（`docs/adr/0004-spec-as-typed-judgment-rule.md`）
- 🧭 **双适配器架构**：UI 只认 `DataPort` 接口，演示用内存适配器、本地用 HTTP+SQLite 适配器，**同一套契约测试保证两端行为一致**（`docs/adr/0002-modern-stack-dual-adapter.md`）
- 🔗 **编号串联**：产品型号 + 图纸编号作为核心键，贯穿热力图、台账与模板
- 🪶 **零路由库**：SPA 状态走手写 query 参数，GitHub Pages 子路径下也不会 404

---

## 🚀 快速开始

### 前置要求

- [Node.js](https://nodejs.org/) ≥ 24.x（用到内置 `node:sqlite`，免原生编译）
- npm（随 Node.js 安装）

### 方式一：本地全功能（数据落盘）

```bash
npm install
npm run build      # 类型检查 + 打包前端
npm run server     # 启动 Hono + SQLite，默认 http://localhost:8787
```

打开 http://localhost:8787 —— 数据写进 `./wire-cable.db`，刷新不丢。

> 环境变量：`WIRE_DB`（库文件路径，默认 `./wire-cable.db`）、`PORT`（默认 `8787`）。

### 方式二：开发模式（带热更新）

```bash
npm run dev        # Vite 开发服务器，默认 http://localhost:5173（演示模式，内存数据）
```

### 在线演示

GitHub Pages 上跑的是**演示模式**（内存数据，刷新即还原），顶部常驻「演示模式 · 数据不持久」提示。
地址：https://xiaohai-uid.github.io/wire-cable-rd-manager/

---

## 🏗️ 技术栈

| 层面 | 技术 | 说明 |
|------|------|------|
| 前端 | React 19 + Vite 6 + TypeScript（strict） | 手写 query 参数做 SPA 状态，无路由库 |
| 样式 | Tailwind CSS v4 | —— |
| 本地后端 | Hono 4 + @hono/node-server | 每个端点只定义一次 |
| 数据库 | SQLite（`node:sqlite`，Node 24 内置） | `PRAGMA foreign_keys=ON` + `ON DELETE CASCADE` + 显式事务，免原生编译 |
| 校验 | Zod（前后端共享 schema） | 服务端校验入站、HttpAdapter 校验出站，同 schema 保证前后端一致 |
| 测试 | Vitest 3 + Testing Library | 契约测试对 MemoryAdapter 与 HttpAdapter 各跑一遍 |

---

## 📂 项目结构

```
wire-cable-rd-manager/
├── src/
│   ├── domain/            # 纯领域逻辑（判定引擎、规格解析、热力图聚合）—— 零 I/O，契约测试 seam 2
│   ├── ports/
│   │   ├── data-port.ts        # DataPort 接口 + DataPortError（唯一数据访问契约）
│   │   └── data-port.contract.ts  # 适配器契约测试，两端各跑一遍
│   ├── adapters/
│   │   ├── memory-adapter.ts   # 演示模式：内存实现（GitHub Pages 用这个）
│   │   └── http-adapter.ts     # 本地模式：打 Hono+SQLite 的 HTTP 实现
│   ├── server/            # 服务端：db.ts / repo.ts / app.ts / index.ts
│   ├── shared/api.ts      # 前后端共享 Zod 线协议
│   ├── ui/                # React 界面（热力图 / 下钻 / 批次网格 / 产品管理）
│   ├── entry/             # 纯前端逻辑（模板编辑状态机、粘贴解析）
│   ├── App.tsx / main.tsx # 界面装配 + 适配器在此按构建变量选定
│   └── index.css
├── docs/
│   ├── adr/              # 架构决策记录（0001–0004）
│   ├── issues/           # 工单拆解（001–007）
│   └── SPEC.md           # 产品规格
├── .github/workflows/    # Pages 部署流水线
└── package.json
```

---

## 🧪 判定逻辑（核心业务规则）

测试台账的自动判定支持四种规格类型，规则用类型化结构表达：

| 规格类型 | 示例 | 判定规则 |
|---------|------|---------|
| **上限规格** | ≤0.5Ω | 三个测试值均 ≤ 上限 → 合格 |
| **下限规格** | ≥1000V | 三个测试值均 ≥ 下限 → 合格 |
| **范围规格** | 5.0±0.1mm | 三个测试值均在范围内 → 合格 |
| **定性项目** | 外观检查 | 输入「通过 / 合格」判定 |

---

## 📖 架构决策（节选）

- **ADR 0001 — 用 SQLite**：外键级联 + 事务，根治 1.0「删产品留孤儿记录」的坑。
- **ADR 0002 — 现代栈 + 双适配器**：UI 只认 `DataPort`，演示 / 本地两套实现共用契约测试。
- **ADR 0003 — 网格优先的台账录入**：一个网格整批录入，替代 1.0 的多次弹窗。
- **ADR 0004 — 规格即类型化判定规则**：规格字符串解析成结构，UI 实时预览、校验、判定同源。

---

## 🤝 贡献指南

欢迎贡献！请提交 Issue 或 Pull Request。

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/amazing-feature`
3. 提交修改：`git commit -m 'Add amazing feature'`
4. 推送分支：`git push origin feature/amazing-feature`
5. 提交 Pull Request

---

## 📄 许可证

本项目采用 **MIT License** — 详见 [LICENSE](LICENSE) 文件。

---

## 💬 关于

本项目是为线材研发岗位打造的零门槛质量数据工具，旨在减少重复录入、规范文档管理。如有问题或建议，欢迎提交 [Issue](https://github.com/xiaohai-uid/wire-cable-rd-manager/issues)！
