import type { HeatmapMatrix } from '../domain/heatmap';
import type {
  LedgerRecord,
  ManualJudgment,
  MeasurementValues,
  Product,
  TestTemplateItem,
} from '../domain/types';

/**
 * 数据端口。UI 只依赖这个接口，不依赖任何具体适配器（ADR 0002）。
 *
 * 两个实现：
 * - `MemoryAdapter` —— 演示模式，数据在内存里，刷新即还原（GitHub Pages 用）
 * - `HttpAdapter`   —— 本地模式，走 Hono + SQLite（工单 06）
 *
 * 一套契约测试针对本接口写，对两个实现各跑一遍 ——
 * 这是「演示模式和本地模式行为一致」的保证，也把 1.0 版
 * 「API 返回结构与前端预期不符却无人察觉」这类问题挡在边界上。
 *
 * 方法集刻意保持最小。每加一个方法，两个适配器都得实现、契约测试都得覆盖。
 */
export interface DataPort {
  /** 当前运行模式。UI 用它决定是否显示「演示模式，数据不持久」标注 */
  readonly mode: DataPortMode;

  listProducts(): Promise<readonly Product[]>;
  getProduct(model: string): Promise<Product | null>;
  createProduct(product: Product): Promise<Product>;
  updateProduct(model: string, patch: ProductPatch): Promise<Product>;
  /** 删除产品，级联清除其模板与台账记录，返回被清除的关联条数 */
  deleteProduct(model: string): Promise<CascadeSummary>;

  /** 按 sortOrder 升序返回 */
  listTemplates(productModel: string): Promise<readonly TestTemplateItem[]>;
  /** 整表替换：不在新列表里的项会被删除 */
  replaceTemplates(
    productModel: string,
    items: readonly TemplateDraft[],
  ): Promise<readonly TestTemplateItem[]>;
  /** 跨产品复制模板，目标产品原有模板被整表替换 */
  copyTemplates(from: string, to: string): Promise<readonly TestTemplateItem[]>;

  /** 查询台账记录。供下钻（产品 + 测试项）与批次读取（产品 + 批号）共用 */
  listRecords(query: RecordQuery): Promise<readonly LedgerRecord[]>;
  /** 某产品下已有的批号，按测试日期倒序 */
  listBatchNos(productModel: string): Promise<readonly string[]>;
  /**
   * 整批写入，**原子操作**：一个批次的全部测试项要么全部成功、要么全部失败。
   * 同一产品同一批号重复保存视为覆盖，不产生重复记录。
   */
  saveBatch(batch: BatchDraft): Promise<readonly LedgerRecord[]>;
  /** 删除整批，返回被删除的记录数 */
  deleteBatch(productModel: string, batchNo: string): Promise<number>;

  loadHeatmap(): Promise<HeatmapMatrix>;
}

export type DataPortMode = 'demo' | 'local';

export type ProductPatch = Partial<Omit<Product, 'model'>>;

export interface CascadeSummary {
  readonly removedTemplates: number;
  readonly removedRecords: number;
}

export type TemplateDraft = Omit<TestTemplateItem, 'productModel'>;

export interface RecordQuery {
  readonly productModel?: string;
  readonly testItem?: string;
  readonly batchNo?: string;
}

export interface BatchEntryDraft {
  readonly testItem: string;
  readonly spec: string;
  readonly values: MeasurementValues;
  /** 仅定性项使用；数值项传 null */
  readonly manualJudgment: ManualJudgment | null;
  readonly remark: string;
}

export interface BatchDraft {
  readonly productModel: string;
  readonly batchNo: string;
  readonly testDate: string;
  readonly tester: string;
  readonly entries: readonly BatchEntryDraft[];
}

/**
 * 端口层的错误。两个适配器抛同样的 code，UI 才能用同一套分支处理 ——
 * 否则「演示模式能用、本地模式报错」这类差异会一直漏到用户面前。
 */
export type DataPortErrorCode =
  /** 目标不存在（产品、批次） */
  | 'not-found'
  /** 与已有数据冲突（产品型号重复） */
  | 'conflict'
  /** 入参本身不合法（批次为空、批内测试项重复） */
  | 'invalid'
  /** 传输层失败，仅 HttpAdapter 会抛 */
  | 'network';

export class DataPortError extends Error {
  constructor(
    readonly code: DataPortErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DataPortError';
  }
}

export const isDataPortError = (e: unknown): e is DataPortError =>
  e instanceof DataPortError;
