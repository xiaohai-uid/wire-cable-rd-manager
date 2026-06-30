<!--
*** 线材研发一体化管理系统 ***
-->

# 📐 Wire Cable RD Manager · 线材研发管理系统

> **线材研发岗位的一站式数字化工具** — 测试台账 / BOM 管理 / 工艺记录 / 测试报告自动生成

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![SQLite](https://img.shields.io/badge/database-SQLite-blue)](https://sqlite.org)

---

## ✨ 功能概览

| 模块 | 说明 |
|------|------|
| 📊 **仪表盘** | 不良率趋势图、最新测试动态、全局统计概览 |
| 📋 **测试台账** | 在线录入测试数据，**自动计算平均值**、**自动判定合格/不合格**、不合格自动高亮 |
| 📦 **产品管理** | 产品型号 + 图纸编号统一管理，贯穿所有文档的核心标识 |
| 📑 **BOM 物料清单** | 物料编码/名称/规格/用量/损耗率管理，关联产品型号和图纸编号 |
| 🔧 **打样工艺记录** | 设备信息 + 各工序参数 + 首件检验结果，便于追溯和复现 |
| 📝 **测试报告** | 基于台账数据**一键生成**结构化测试报告，可导出为 Word |

### 核心特色

- ⚡ **自动判定**：三种规格类型（上限/下限/范围）自动计算平均值并判定合格/不合格
- 📈 **不良率统计**：实时统计批次不良率，不合格记录红色高亮
- 🔗 **编号串联**：产品型号 + 图纸编号作为核心键，贯穿所有文档
- 🚀 **零配置部署**：`npm install && npm start` 即可运行

---

## 🚀 快速开始

### 前置要求

- [Node.js](https://nodejs.org/) ≥ 18.x
- npm（随 Node.js 安装）

### 安装与运行

```bash
# 1. 克隆仓库
git clone https://github.com/xiaohai-uid/wire-cable-rd-manager.git
cd wire-cable-rd-manager

# 2. 安装依赖
npm install

# 3. 启动服务
npm start

# 4. 打开浏览器访问
# http://localhost:3789
```

> 默认端口 **3789**，可在 `server.js` 中修改 `PORT` 变量。

---

## 🏗️ 技术栈

| 层面 | 技术 | 说明 |
|------|------|------|
| 后端 | Node.js + Express | 轻量 Web 框架，Windows 友好 |
| 数据库 | SQLite (better-sqlite3) | 零安装、单文件数据库 |
| 前端 | 原生 HTML + CSS + JavaScript | 无构建步骤，纯原生 |
| 部署 | 直接 `node server.js` | 无需 Docker 或额外服务 |

---

## 📂 项目结构

```
wire-cable-rd-manager/
├── server.js                 # Express 主入口（路由 + 静态文件）
├── database.js               # SQLite 数据库初始化与表结构
├── seed-real-data.js         # 示例数据填充脚本
├── public/                   # 前端静态文件
│   ├── index.html            # 仪表盘
│   ├── products.html         # 产品管理
│   ├── ledger.html           # 测试台账
│   ├── bom.html              # BOM 管理
│   ├── process.html          # 工艺记录
│   ├── reports.html          # 测试报告
│   ├── css/style.css         # 全局样式
│   └── js/api.js             # API 调用封装
├── docs/                     # 项目文档
│   ├── adr/                  # 架构决策记录
│   └── issues/               # 任务拆解
├── CONTEXT.md                # 领域术语表
├── PRD.md                    # 产品需求文档
└── package.json
```

---

## 🧪 判定逻辑（核心业务规则）

测试台账的自动判定支持四种规格类型：

| 规格类型 | 示例 | 判定规则 |
|---------|------|---------|
| **上限规格** | ≤0.5Ω | 三个测试值均 ≤ 上限 → 合格 |
| **下限规格** | ≥1000V | 三个测试值均 ≥ 下限 → 合格 |
| **范围规格** | 5.0±0.1mm | 三个测试值均在范围内 → 合格 |
| **定性项目** | 外观检查 | 输入"通过"/"合格"判定 |

---

## 📖 使用场景

本系统专为**线材/电缆研发岗位**设计，适用于：

- 🔬 **日常测试数据管理** — 替代 Excel 台账，自动计算和判定
- 📋 **批次质量管理** — 跟踪每批次的不良率和测试结果
- 📑 **BOM 版本管理** — 统一物料清单管理，关联图纸
- 🔧 **工艺参数追溯** — 记录打样工艺参数，方便后续复现
- 📝 **报告自动生成** — 减少重复排版工作，一键生成测试报告

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

本项目是为线材研发岗位打造的零门槛数字化工具，旨在缩减文案录入时间、规范文档管理。如有问题或建议，欢迎提交 [Issue](https://github.com/xiaohai-uid/wire-cable-rd-manager/issues)！
