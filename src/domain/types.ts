/**
 * 领域类型定义。
 *
 * 本目录（src/domain）是领域核心：纯函数、零 I/O、零框架依赖。
 * 这是 HttpAdapter 与 MemoryAdapter 能共用同一份领域逻辑的前提（ADR 0002）。
 */

/**
 * 判定规则 —— 规格串解析后得到的带类型结构。
 * 系统内部只使用它，不再见到裸规格串（ADR 0004）。
 */
export type JudgmentRule =
  | { readonly kind: 'max'; readonly limit: number; readonly unit: string }
  | { readonly kind: 'min'; readonly limit: number; readonly unit: string }
  | {
      readonly kind: 'tolerance';
      readonly center: number;
      readonly tolerance: number;
      readonly unit: string;
    }
  | {
      readonly kind: 'range';
      readonly lower: number;
      readonly upper: number;
      readonly unit: string;
    }
  | { readonly kind: 'qualitative'; readonly expected: string }
  /**
   * 解析失败。绝不回退到猜测 —— 对质检系统而言，
   * 「静默给出错误判定」比「拒绝判定」严重得多（ADR 0004）。
   */
  | { readonly kind: 'unparseable'; readonly raw: string; readonly reason: string };

export type JudgmentRuleKind = JudgmentRule['kind'];

/**
 * 判定结果。
 * - `pass` / `fail`  已判定，进入不良率分母
 * - `unjudged`       未填测量值，或定性项尚无人工判定；不进入分母
 * - `unparseable`    规格无法识别，系统拒绝判定；不进入分母，且 UI 必须显式提示
 */
export type Judgment = 'pass' | 'fail' | 'unjudged' | 'unparseable';

/** 人工判定，仅定性项使用（外观检查、导通测试等） */
export type ManualJudgment = 'pass' | 'fail';

/**
 * 三次测量值。`null` 表示未填，`0` 是合法测量值。
 * 禁止用 falsy 判断区分二者 —— 1.0 版 `parseFloat(v) || null` 是既有 bug 的来源。
 */
export type MeasurementValues = readonly (number | null)[];

export interface Product {
  readonly model: string;
  readonly name: string;
  readonly drawingNo: string;
  readonly description: string;
}

/** 测试模板项：某产品应当测哪一项、规格是什么 */
export interface TestTemplateItem {
  readonly productModel: string;
  readonly testItem: string;
  readonly spec: string;
  readonly sortOrder: number;
}

/** 测试台账记录：一个测试项在一个批次里的三次测量 */
export interface LedgerRecord {
  readonly id: string;
  readonly testDate: string;
  readonly productModel: string;
  readonly drawingNo: string;
  readonly batchNo: string;
  readonly testItem: string;
  readonly spec: string;
  readonly values: MeasurementValues;
  /** 仅定性项使用；数值项恒为 null，判定由测量值算出 */
  readonly manualJudgment: ManualJudgment | null;
  readonly tester: string;
  readonly remark: string;
}
