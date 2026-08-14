import { z } from 'zod';

/**
 * 前后端共用的线缆数据端口（DataPort）线格式定义。
 *
 * 这是 ADR 0002 里「演示模式（MemoryAdapter）与本地模式（HttpAdapter）行为一致」的物理保证之一：
 * 服务器用这些 schema 校验入站请求体，HttpAdapter 用**同一份** schema 校验出站响应。
 * 两端各有一套独立实现，但都得过同一把尺子 —— 一旦某端偷偷改了字段形状，
 * 另一端（或契约测试）立刻报错，把 1.0 版「API 返回结构和前端预期对不上却无人察觉」挡在边界上。
 *
 * 这里只描述「线上长什么样」，内部领域模型（src/domain/types.ts）是另一回事，
 * 由适配器负责在两者间转换。
 */

/** 日期统一为 `YYYY-MM-DD`，避免脏日期串入库后排序/解析出错。 */
const DateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD');

/** 业务短文本上限，防止超大字符串撑爆请求体 / 数据库行。 */
const ShortText = z.string().max(200);

const MeasurementValuesSchema = z.tuple([
  z.number().nullable(),
  z.number().nullable(),
  z.number().nullable(),
]);

export const ProductSchema = z.object({
  model: ShortText,
  name: ShortText,
  drawingNo: ShortText,
  description: z.string().max(2000),
});
export type ProductDTO = z.infer<typeof ProductSchema>;

export const TestTemplateItemSchema = z.object({
  productModel: ShortText,
  testItem: ShortText,
  spec: ShortText,
  sortOrder: z.number(),
});
export type TestTemplateItemDTO = z.infer<typeof TestTemplateItemSchema>;

export const LedgerRecordSchema = z.object({
  id: ShortText,
  testDate: DateSchema,
  productModel: ShortText,
  drawingNo: ShortText,
  batchNo: ShortText,
  testItem: ShortText,
  spec: ShortText,
  values: MeasurementValuesSchema,
  manualJudgment: z.enum(['pass', 'fail']).nullable(),
  tester: ShortText,
  remark: z.string().max(2000),
});
export type LedgerRecordDTO = z.infer<typeof LedgerRecordSchema>;

export const TemplateDraftSchema = z.object({
  testItem: ShortText,
  spec: ShortText,
  sortOrder: z.number(),
});
export type TemplateDraftDTO = z.infer<typeof TemplateDraftSchema>;

export const BatchEntrySchema = z.object({
  testItem: ShortText,
  spec: ShortText,
  values: MeasurementValuesSchema,
  manualJudgment: z.enum(['pass', 'fail']).nullable(),
  remark: z.string().max(2000),
});
export type BatchEntryDTO = z.infer<typeof BatchEntrySchema>;

export const BatchDraftSchema = z.object({
  productModel: ShortText,
  batchNo: ShortText,
  testDate: DateSchema,
  tester: ShortText,
  entries: z.array(BatchEntrySchema).min(1).max(1000),
});
export type BatchDraftDTO = z.infer<typeof BatchDraftSchema>;

export const RecordQuerySchema = z.object({
  productModel: z.string().optional(),
  testItem: z.string().optional(),
  batchNo: z.string().optional(),
  limit: z.number().int().min(1).max(5000).optional(),
  offset: z.number().int().min(0).optional(),
});
export type RecordQueryDTO = z.infer<typeof RecordQuerySchema>;

export const CascadeSummarySchema = z.object({
  removedTemplates: z.number(),
  removedRecords: z.number(),
});
export type CascadeSummaryDTO = z.infer<typeof CascadeSummarySchema>;

export const CopyTemplatesBodySchema = z.object({
  from: z.string(),
});

const HeatmapCellSchema = z.object({
  productModel: z.string(),
  testItem: z.string(),
  configured: z.boolean(),
  judgedCount: z.number(),
  failCount: z.number(),
  unjudgedCount: z.number(),
  unparseableCount: z.number(),
  defectRate: z.number().nullable(),
});

const HeatmapRowSchema = z.object({
  testItem: z.string(),
  isQualitative: z.boolean(),
  judgedCount: z.number(),
  failCount: z.number(),
  defectRate: z.number().nullable(),
  cells: z.array(HeatmapCellSchema),
});

export const HeatmapMatrixSchema = z.object({
  products: z.array(z.string()),
  rows: z.array(HeatmapRowSchema),
  overall: z.object({
    totalCount: z.number(),
    judgedCount: z.number(),
    failCount: z.number(),
    unjudgedCount: z.number(),
    unparseableCount: z.number(),
    defectRate: z.number().nullable(),
  }),
});
export type HeatmapMatrixDTO = z.infer<typeof HeatmapMatrixSchema>;

/** 跨边界错误信封。服务器 onError 统一产出，HttpAdapter 据此还原成 DataPortError。 */
export const ErrorEnvelopeSchema = z.object({
  code: z.enum(['not-found', 'conflict', 'invalid', 'network', 'internal']),
  message: z.string(),
});
export type ErrorEnvelopeDTO = z.infer<typeof ErrorEnvelopeSchema>;
