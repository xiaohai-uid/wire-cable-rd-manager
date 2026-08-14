import { parseSpec } from './spec';
import type {
  Judgment,
  JudgmentRule,
  ManualJudgment,
  MeasurementValues,
} from './types';

/**
 * 判定引擎。整个系统只有这一份实现。
 *
 * 1.0 版把同一套判定逻辑在 server.js 和 seed-real-data.js 里各写了一份，
 * 改一处不会同步另一处 —— 两份当时还基本一致，纯属运气（ADR 0004）。
 */

/**
 * 浮点容差。
 *
 * 直接比较会出问题：JS 里 `2.8 + 0.2 === 3.0000000000000004`，
 * 于是 3.0 这个恰好在公差上界的值会被判成超差。
 * 用容差比较把这种由二进制表示带来的假越界消掉。
 * 1e-9 远小于任何真实测量精度（本领域最细到小数点后三位）。
 */
const EPSILON = 1e-9;

const isGreater = (a: number, b: number): boolean => a - b > EPSILON;
const isLess = (a: number, b: number): boolean => b - a > EPSILON;

const isFilled = (v: number | null): v is number => v !== null && Number.isFinite(v);

/** 已填的测量值。`0` 是合法值，只有 `null` 才算未填。 */
export function filledValues(values: MeasurementValues): number[] {
  return values.filter(isFilled);
}

/** 平均值。全未填返回 null（而不是 0 —— 0 是个合法测量值，不能用来表示「没有」）。 */
export function averageOf(values: MeasurementValues): number | null {
  const filled = filledValues(values);
  if (filled.length === 0) return null;
  const sum = filled.reduce((a, b) => a + b, 0);
  return Math.round((sum / filled.length) * 10_000) / 10_000;
}

/**
 * 单个测量值是否越界。
 * UI 用它只标红越界的那一次测量，而不是整行含糊标红 ——
 * 「三次全坏」和「只有一次坏」是两种完全不同的问题。
 */
export function isValueOutOfSpec(rule: JudgmentRule, value: number): boolean {
  switch (rule.kind) {
    case 'max':
      return isGreater(value, rule.limit);
    case 'min':
      return isLess(value, rule.limit);
    case 'tolerance':
      return (
        isLess(value, rule.center - rule.tolerance) ||
        isGreater(value, rule.center + rule.tolerance)
      );
    case 'range':
      return isLess(value, rule.lower) || isGreater(value, rule.upper);
    case 'qualitative':
    case 'unparseable':
      // 定性项无数值界限；无法识别的规格不做任何数值推断。
      return false;
  }
}

/**
 * 由判定规则和测量值给出判定。
 *
 * 数值项：三次测量必须全部落在规格内才算合格（质检惯例，一次越界即不合格）。
 * 只填了一两次时按已填的判 —— 现场只做部分测量是常态。
 */
export function judge(rule: JudgmentRule, values: MeasurementValues): Judgment {
  if (rule.kind === 'unparseable') return 'unparseable';
  // 定性项（外观检查、导通测试）由人工给结论，系统不去猜。
  if (rule.kind === 'qualitative') return 'unjudged';

  const filled = filledValues(values);
  if (filled.length === 0) return 'unjudged';

  return filled.some((v) => isValueOutOfSpec(rule, v)) ? 'fail' : 'pass';
}

export interface ResolvedJudgment {
  readonly rule: JudgmentRule;
  readonly judgment: Judgment;
  readonly average: number | null;
  /** 越界测量值在 values 中的下标，供 UI 精确标红 */
  readonly outOfSpecIndexes: readonly number[];
}

/**
 * 一条台账记录的完整判定结果。这是 UI 和聚合唯一该调用的入口。
 * 定性项取人工判定；数值项由测量值算出。
 */
export function resolveJudgment(record: {
  readonly spec: string;
  readonly values: MeasurementValues;
  readonly manualJudgment?: ManualJudgment | null;
}): ResolvedJudgment {
  const rule = parseSpec(record.spec);
  const average = averageOf(record.values);

  const outOfSpecIndexes: number[] = [];
  record.values.forEach((v, index) => {
    if (isFilled(v) && isValueOutOfSpec(rule, v)) outOfSpecIndexes.push(index);
  });

  if (rule.kind === 'qualitative') {
    return {
      rule,
      average,
      outOfSpecIndexes,
      judgment: record.manualJudgment ?? 'unjudged',
    };
  }

  return { rule, average, outOfSpecIndexes, judgment: judge(rule, record.values) };
}

/** 已判定的记录才进入不良率分母。未判定与规格无法识别都不进。 */
export function isJudged(judgment: Judgment): boolean {
  return judgment === 'pass' || judgment === 'fail';
}
