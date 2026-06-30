# PRD: 线材研发一体化管理系统

> **版本**: 1.0  
> **状态**: 草稿  
> **生成依据**: 线材研发岗位台账整理、报告撰写重复工作量大的痛点需求

---

## Problem Statement

线材研发岗位在日常工作中面临大量重复性文档工作：
1. **测试台账手工录入**——每次测试需手动计算平均值、判定合格/不合格、统计不良率，容易出错且耗时
2. **报告撰写周期长**——每批次测试完成后需编写 Word 格式报告，排版和格式调整占用大量时间
3. **BOM 管理散乱**——物料清单缺乏统一管理，图纸-BOM-测试报告之间缺乏对应关系
4. **打样工艺追溯困难**——工艺参数靠纸质记录或分散 Excel，后续追溯不便
5. **信息孤岛**——台账、BOM、工艺记录、测试报告分属不同文档，无法一站式检索

## Solution

构建一个**轻量级 Web 应用**，将全套研发文档管理集中在一个平台：

- **测试台账管理**：在线录入测试数据，系统自动计算平均值、判定合格/不合格、统计不良率
- **BOM 管理**：统一管理物料清单，关联产品型号和图纸编号
- **打样工艺记录**：记录每批次工艺参数和首件检验结果
- **测试报告生成**：基于台账数据一键生成结构化测试报告（可导出为 Word）
- **统一检索**：按产品型号、批号、日期快速检索所有相关记录
- **仪表盘**：全局概览不良率趋势、最新测试动态

## User Stories

1. 作为一名研发助理，我想要在线录入测试数据时系统自动计算平均值和判定结果，以减少手动计算错误
2. 作为一名研发助理，我想要系统自动高亮不合格的测试数据，以便快速定位异常
3. 作为一名研发助理，我想要查看汇总统计面板了解当前批次的不良率，以便评估产品质量
4. 作为一名研发工程师，我想要管理产品 BOM 清单并与图纸编号关联，以便统一物料管理
5. 作为一名研发助理，我想要记录每批次的打样工艺参数，以便后续追溯和复现
6. 作为一名研发助理，我想要基于台账数据一键生成测试报告，以减少重复排版工作
7. 作为一名研发助理，我想要按产品型号/批号/日期筛选检索历史记录，以便快速找到历史数据
8. 作为一名研发经理，我想要查看仪表盘了解整体不良率趋势和检测动态，以便掌握研发质量状况
9. 作为一名研发助理，我想要导出测试报告为 Word 文档，以便发给客户或归档
10. 作为一名研发助理，我想要在系统中管理产品信息和图纸编号，以便统一产品数据

## Implementation Decisions

### 技术栈

| 层面 | 技术选择 | 理由 |
|------|---------|------|
| 后端框架 | Node.js + Express | 零配置、Windows 友好、单进程部署 |
| 数据库 | SQLite (better-sqlite3) | 零安装、单文件数据库、无需数据库服务器 |
| 前端 | 原生 HTML + CSS + JavaScript | 无构建步骤、零依赖、直接浏览器打开 |
| UI 框架 | 无（纯原生） | 保持零代码依赖理念，样式自包含 |
| 部署 | Node.js 直接运行 | npm install && npm start 即可使用 |

### 架构

```
线材研发管理系统/
├── server.js              # Express 主入口
├── database.js            # SQLite 数据库初始化
├── routes/                # API 路由
│   ├── products.js        # 产品管理 API
│   ├── ledger.js          # 测试台账 API
│   ├── bom.js             # BOM 管理 API
│   ├── process.js         # 工艺记录 API
│   └── reports.js         # 报告生成 API
├── public/                # 前端静态文件
│   ├── index.html         # 仪表盘
│   ├── products.html      # 产品管理
│   ├── ledger.html        # 测试台账
│   ├── ledger-new.html    # 新增测试记录
│   ├── bom.html           # BOM 管理
│   ├── process.html       # 工艺记录
│   ├── reports.html       # 测试报告
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── api.js         # API 调用封装
│       ├── utils.js       # 工具函数
│       └── ...            # 各页面脚本
└── package.json
```

### 数据库模型

核心实体：Product（产品）、BOM（物料清单）、TestRecord（测试记录）、ProcessRecord（工艺记录）、TestReport（测试报告）

- 一个 Product 对应多个 BOM、多个 TestRecord、多个 ProcessRecord、多个 TestReport
- 所有实体通过 `product_model` + `drawing_no` 关联

### API 设计

```
GET/POST   /api/products          — 产品CRUD
GET/PUT/DELETE /api/products/:id

GET/POST   /api/ledger            — 测试台账
GET/PUT/DELETE /api/ledger/:id
GET        /api/ledger/stats      — 统计（不良率等）

GET/POST   /api/boms              — BOM管理
GET/PUT/DELETE /api/boms/:id
GET        /api/boms/:id/items    — BOM明细

GET/POST   /api/process           — 工艺记录
GET/PUT/DELETE /api/process/:id
GET        /api/process/:id/params

GET/POST   /api/reports           — 测试报告
GET        /api/reports/:id
POST       /api/reports/generate  — 一键生成报告
GET        /api/reports/:id/export — 导出Word
```

### 判定逻辑（核心业务规则）

测试判定公式：
- 上限规格（如 ≤0.5Ω）：三个测试值均 ≤ 上限 → 合格
- 下限规格（如 ≥1000V）：三个测试值均 ≥ 下限 → 合格
- 范围规格（如 5.0±0.1mm）：三个测试值均在范围内 → 合格
- 定性项目（如外观）：输入"通过"/"合格"判定

## Testing Decisions

### 测试策略

对于这个新项目，采用**模型层单元测试 + API 层集成测试**：

- **测试缝**：数据库访问层（Model/Repository 函数）和 API 路由处理函数
- **测试原则**：只测外部行为（API 响应），不测内部实现细节
- **测试框架**：内建测试用 `database.test.js` + Node 原生 assert

### 测试范围

- 数据库模型 CRUD 操作
- 判定逻辑的正确性（上限/下限/范围/定性四种情况）
- 不良率统计计算
- API 路由响应的正确状态码和数据格式

## Out of Scope

- 用户登录/权限系统（单机本地使用，后续可加）
- 多用户协作（当前面向单岗位使用）
- 移动端适配（优先桌面体验）
- 云端部署（保持本地单机运行）
- AI 自动生成报告文案（保留 API 接口，后续对接 AI）

## Further Notes

- 本项目定位为"带 Web 界面的增强版 Excel 台账"，使用门槛不应高于 Excel
- 所有页面应当在 1024×768 分辨率下完整可用
- 项目应可在任意 Windows 机器上通过 `npm install && npm start` 一键启动，无需额外配置
