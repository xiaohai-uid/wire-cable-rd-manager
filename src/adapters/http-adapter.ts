import { z } from 'zod';
import {
  DataPortError,
  isDataPortError,
  type BatchDraft,
  type CascadeSummary,
  type DataPort,
  type DataPortMode,
  type ProductPatch,
  type RecordQuery,
  type TemplateDraft,
} from '../ports/data-port';
import type { LedgerRecord, Product, TestTemplateItem } from '../domain/types';
import type { HeatmapMatrix } from '../domain/heatmap';
import * as S from '../shared/api';

/**
 * 本地模式适配器：UI 只认 DataPort，所以这层和 MemoryAdapter 是**同一个接口**的两个实现。
 * UI 一行都不用改 —— 唯一区别是数据落在 SQLite 文件里，刷新不丢。
 *
 * 两个纪律（ADR 0002 / 工单 06）：
 * 1. 出站响应先用共享 Zod schema 解析，schema 不过就抛 —— 服务器改了字段形状，这里立刻炸，
 *    而不是静默拿到 undefined 然后页面崩在别处；
 * 2. 错误响应解析成 DataPortError 的同一个 `code`，于是 UI 一套分支能同时伺候两种模式。
 *
 * `fetchImpl` 可注入（契约测试里把它接成内存中的 Hono 实例），默认用全局 fetch 打真实服务器。
 */
export class HttpAdapter implements DataPort {
  readonly mode: DataPortMode = 'local';

  constructor(
    private readonly opts: {
      readonly baseUrl: string;
      readonly fetchImpl?: typeof fetch;
    },
  ) {}

  private async call<T>(
    method: string,
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
  ): Promise<T> {
    const f = this.opts.fetchImpl ?? fetch;
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.headers = { 'content-type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    const res = await f(`${this.opts.baseUrl}${path}`, init);
    const json = await res.json().catch(() => null);

    if (!res.ok) {
      const env = S.ErrorEnvelopeSchema.safeParse(json);
      if (env.success) {
        // 服务器内部错误在信封里记为 'internal'，但 DataPort 契约没有这一档，归并到 network
        const code = env.data.code === 'internal' ? 'network' : env.data.code;
        throw new DataPortError(code, env.data.message);
      }
      throw new DataPortError('network', `HTTP ${res.status}`);
    }
    return schema.parse(json);
  }

  async listProducts(): Promise<readonly Product[]> {
    return this.call('GET', '/api/products', z.array(S.ProductSchema));
  }

  async getProduct(model: string): Promise<Product | null> {
    const f = this.opts.fetchImpl ?? fetch;
    const res = await f(`${this.opts.baseUrl}/api/products/${encodeURIComponent(model)}`);
    if (res.status === 404) {
      const json = await res.json().catch(() => null);
      const env = S.ErrorEnvelopeSchema.safeParse(json);
      if (env.success && env.data.code === 'not-found') return null;
    }
    const json = await res.json();
    return S.ProductSchema.parse(json);
  }

  async createProduct(product: Product): Promise<Product> {
    return this.call('POST', '/api/products', S.ProductSchema, product);
  }

  async updateProduct(model: string, patch: ProductPatch): Promise<Product> {
    return this.call('PATCH', `/api/products/${encodeURIComponent(model)}`, S.ProductSchema, patch);
  }

  async deleteProduct(model: string): Promise<CascadeSummary> {
    return this.call('DELETE', `/api/products/${encodeURIComponent(model)}`, S.CascadeSummarySchema);
  }

  async listTemplates(productModel: string): Promise<readonly TestTemplateItem[]> {
    return this.call(
      'GET',
      `/api/products/${encodeURIComponent(productModel)}/templates`,
      z.array(S.TestTemplateItemSchema),
    );
  }

  async replaceTemplates(
    productModel: string,
    items: readonly TemplateDraft[],
  ): Promise<readonly TestTemplateItem[]> {
    return this.call(
      'PUT',
      `/api/products/${encodeURIComponent(productModel)}/templates`,
      z.array(S.TestTemplateItemSchema),
      items,
    );
  }

  async copyTemplates(from: string, to: string): Promise<readonly TestTemplateItem[]> {
    return this.call(
      'POST',
      `/api/products/${encodeURIComponent(to)}/copy-templates`,
      z.array(S.TestTemplateItemSchema),
      { from },
    );
  }

  async listRecords(query: RecordQuery): Promise<readonly LedgerRecord[]> {
    const qs = new URLSearchParams();
    if (query.productModel !== undefined) qs.set('productModel', query.productModel);
    if (query.testItem !== undefined) qs.set('testItem', query.testItem);
    if (query.batchNo !== undefined) qs.set('batchNo', query.batchNo);
    const suffix = qs.toString();
    return this.call('GET', `/api/records${suffix ? `?${suffix}` : ''}`, z.array(S.LedgerRecordSchema));
  }

  async listBatchNos(productModel: string): Promise<readonly string[]> {
    const res = await this.call<string[]>(
      'GET',
      `/api/products/${encodeURIComponent(productModel)}/batch-nos`,
      z.array(z.string()),
    );
    return res;
  }

  async saveBatch(batch: BatchDraft): Promise<readonly LedgerRecord[]> {
    return this.call('POST', '/api/batches', z.array(S.LedgerRecordSchema), batch);
  }

  async deleteBatch(productModel: string, batchNo: string): Promise<number> {
    return this.call(
      'DELETE',
      `/api/batches/${encodeURIComponent(productModel)}/${encodeURIComponent(batchNo)}`,
      z.number(),
    );
  }

  async loadHeatmap(): Promise<HeatmapMatrix> {
    return this.call('GET', '/api/heatmap', S.HeatmapMatrixSchema);
  }
}

export { isDataPortError };
