import type { JudgmentRule } from './types';

/**
 * 规格串解析器。
 *
 * 1.0 版的实现是 `parseFloat(s.replace(/[^0-9.]/g, ''))` —— 把非数字字符全剥掉，
 * 剩下的当阈值。这会让 `≥1.5mm2` 的阈值变成 1.52（单位 mm2 里的 2 被吸进数值），
 * 并且不报错、不警告，安静地用错阈值判合格与不合格。
 *
 * 本实现显式区分「比较符 / 数值 / 单位」三段：
 * 数值段只允许匹配 -?\d+(\.\d+)?，紧随其后的剩余部分整体视为单位。
 * 单位段还要过一道校验，可疑写法一律拒绝解析（ADR 0004 规则五）。
 */

/** 数值段：可带负号、可带小数。刻意不支持指数记号 —— 见 UNSAFE_UNIT_PREFIX。 */
const NUMBER = String.raw`-?\d+(?:\.\d+)?`;

const QUALITATIVE = /^(合格|通过|OK|PASS|Pass|pass)$/;

const MAX_PATTERN = new RegExp(String.raw`^[≤<]=?\s*(${NUMBER})\s*(.*)$`);
const MIN_PATTERN = new RegExp(String.raw`^[≥>]=?\s*(${NUMBER})\s*(.*)$`);
const TOLERANCE_PATTERN = new RegExp(String.raw`^(${NUMBER})\s*±\s*(${NUMBER})\s*(.*)$`);
const RANGE_PATTERN = new RegExp(String.raw`^(${NUMBER})\s*[~～]\s*(${NUMBER})\s*(.*)$`);

/**
 * 单位段绝不允许以这些字符开头。
 *
 * 它们意味着数值段没被完整取到 —— 例如 `≥10^8Ω` 会被切成
 * 数值 10 + 单位 `^8Ω`，阈值差了七个数量级。比 1.0 版的 108 好，但仍然是错的。
 *
 * `±` 与 `~` 在这里出现说明规格是复合形式（如 `≤2.8±0.2`），语义不明确，同样拒绝。
 */
const UNSAFE_UNIT_PREFIX = /^[\^eE×xX*±~～]/;

function unsafeUnitReason(unit: string): string | null {
  if (UNSAFE_UNIT_PREFIX.test(unit)) {
    return `单位段以 "${unit[0] ?? ''}" 开头，疑似指数记号或复合规格，数值段可能未被完整取到`;
  }
  return null;
}

/**
 * 解析结果按「trim 后的规格串」做模块级记忆化（P1）。
 * `buildHeatmap` 对每条记录、`ProductsPage` 对每行的规格都会调用本函数，
 * 而同一产品的测试项规格往往高度重复（如「≤0.5Ω」），缓存能把重复正则解析降到一次。
 * 规则对象是不可变的，缓存同一引用安全。
 */
const specCache = new Map<string, JudgmentRule>();

/**
 * 把人写的规格串解析成带类型的判定规则。
 * 解析不了就明确返回 `unparseable`，绝不猜。
 */
export function parseSpec(raw: string): JudgmentRule {
  const source = String(raw ?? '').trim();
  const cached = specCache.get(source);
  if (cached !== undefined) return cached;
  const rule = parseSpecUncached(source);
  specCache.set(source, rule);
  return rule;
}

function parseSpecUncached(source: string): JudgmentRule {
  if (source.length === 0) {
    return { kind: 'unparseable', raw: source, reason: '规格为空' };
  }

  if (QUALITATIVE.test(source)) {
    return { kind: 'qualitative', expected: source };
  }

  const tolerance = TOLERANCE_PATTERN.exec(source);
  if (tolerance) {
    const [, center, tol, unit = ''] = tolerance;
    const bad = unsafeUnitReason(unit);
    if (bad) return { kind: 'unparseable', raw: source, reason: bad };
    return {
      kind: 'tolerance',
      center: Number(center),
      tolerance: Number(tol),
      unit: unit.trim(),
    };
  }

  const range = RANGE_PATTERN.exec(source);
  if (range) {
    const [, lower, upper, unit = ''] = range;
    const bad = unsafeUnitReason(unit);
    if (bad) return { kind: 'unparseable', raw: source, reason: bad };
    const lowerValue = Number(lower);
    const upperValue = Number(upper);
    if (lowerValue > upperValue) {
      return { kind: 'unparseable', raw: source, reason: '区间下界大于上界' };
    }
    return { kind: 'range', lower: lowerValue, upper: upperValue, unit: unit.trim() };
  }

  const max = MAX_PATTERN.exec(source);
  if (max) {
    const [, limit, unit = ''] = max;
    const bad = unsafeUnitReason(unit);
    if (bad) return { kind: 'unparseable', raw: source, reason: bad };
    return { kind: 'max', limit: Number(limit), unit: unit.trim() };
  }

  const min = MIN_PATTERN.exec(source);
  if (min) {
    const [, limit, unit = ''] = min;
    const bad = unsafeUnitReason(unit);
    if (bad) return { kind: 'unparseable', raw: source, reason: bad };
    return { kind: 'min', limit: Number(limit), unit: unit.trim() };
  }

  return {
    kind: 'unparseable',
    raw: source,
    reason: '不符合任何已知规格形态（≤x / ≥x / x±y / x~y / 合格）',
  };
}

/** 把判定规则渲染成人能核对的一行文字，用于「系统读懂了没有」的自检。 */
export function describeRule(rule: JudgmentRule): string {
  switch (rule.kind) {
    case 'max':
      return `上限 ${rule.limit}${rule.unit}（值需 ≤ ${rule.limit}）`;
    case 'min':
      return `下限 ${rule.limit}${rule.unit}（值需 ≥ ${rule.limit}）`;
    case 'tolerance':
      return `中心 ${rule.center} ± ${rule.tolerance}${rule.unit}（${
        rule.center - rule.tolerance
      } ~ ${rule.center + rule.tolerance}）`;
    case 'range':
      return `区间 ${rule.lower} ~ ${rule.upper}${rule.unit}`;
    case 'qualitative':
      return `定性判定（期望「${rule.expected}」，由人工确认）`;
    case 'unparseable':
      return `规格无法识别：${rule.reason}`;
  }
}
