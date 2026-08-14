# 01 — 项目骨架与判定引擎

**What to build:** 一个可以跑测试的 2.0 工程骨架，以及其中唯一一份判定引擎。
做完之后，`npm test` 能一次性回答「这套规格串系统读懂了没有、判定对不对」——
不需要任何界面。这是整个 2.0 的地基：后面所有工单的判定结果都由这一份纯函数决定。

判定引擎负责三件事：把人写的规格串解析成带类型的判定规则；
拿规则和三次测量值给出判定；把台账记录聚合成热力图矩阵。
它是纯函数模块 —— 不碰 I/O、不碰 DOM、不依赖框架，这是两个适配器能共用它的前提（ADR 0002）。

解析器的核心契约（来自 `prototype/ledger-ui.PROTOTYPE.html` 的已验证实现，
保留这段是因为它把决策编码得比散文精确）：

```ts
type JudgmentRule =
  | { kind: 'max';         limit: number; unit: string }
  | { kind: 'min';         limit: number; unit: string }
  | { kind: 'tolerance';   center: number; tolerance: number; unit: string }
  | { kind: 'range';       lower: number; upper: number; unit: string }
  | { kind: 'qualitative'; expected: string }
  | { kind: 'unparseable'; raw: string };

// 数值段只允许匹配 -?\d+(\.\d+)? ，紧随其后的剩余部分整体视为单位。
// 绝不用「剥掉非数字字符」取数 —— 那是 1.0 版静默错判的根因。
// 单位段以 ^ / e / E / × / * 开头时判为 unparseable（ADR 0004 规则五）。
```

**Blocked by:** None — can start immediately.

**Status:** done

- [x] Vite + TypeScript(strict) + React + Tailwind + Vitest 骨架可跑，`npm test` 与 `npm run dev` 都通
- [x] 现有 52 条真实规格串逐条断言解析结果（种类、阈值、单位）全部通过
- [x] `≥1.5mm2` 与 `≥1.5 mm2` 的阈值解析为 `1.5`，单位为 `mm2`（不是阈值 1.52）
- [x] `≥10^8Ω`、`≥1×10^8Ω`、`2.5mm2±0.1` 均判为 `unparseable`
- [x] 数值项判定规则：三次测量全部落在规格内才算合格；只填部分时按已填的判
- [x] 测量值 `0` 参与判定，不被当作未填；未填只能是 `null`
- [x] 三次全未填返回「未判定」，且不进入不良率分母
- [x] 规格 `unparseable` 时判定拒绝给出合格/不合格结论
- [x] 单值越界判断函数可用（供 UI 只标红越界的那一次测量）
- [x] 热力图聚合函数以真实 62 条记录为夹具，总体不良率断言为 4.84%
- [x] 三条已知不合格项断言通过：RV-0.5 导体电阻超 0.5Ω、SYV-75-5 回波损耗低于 20dB、BV-2.5 老化测试低于 80%
- [x] 领域核心模块无任何 I/O、DOM、框架依赖（可用依赖检查或 import 审查确认）
