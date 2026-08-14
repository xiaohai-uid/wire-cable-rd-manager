import { Hono } from 'hono';
import { z, ZodError } from 'zod';
import { DataPortError, type ProductPatch, type RecordQuery } from '../ports/data-port';
import type { Db } from './db';
import { SqliteRepo } from './repo';
import * as S from '../shared/api';

/**
 * Hono 应用：把 DataPort 的每个方法映射成一个 HTTP 端点。
 *
 * 设计纪律（1.0 版踩过的坑）：
 * - **每个端点在路由表里只出现一次**，没有 1.0 那种「同一个接口被定义 4 遍」的复制粘贴；
 * - 入站请求体先用共享 Zod schema 校验，校验不过直接 400；
 * - 所有业务错误统一由 `onError` 翻译成 `{ code, message }` 信封，HttpAdapter 据此还原成 DataPortError，
 *   于是「演示模式能用、本地模式报错」这类差异在边界上就被挡住。
 *
 * 注意：本文件只负责「接线」，不写业务规则；规则都在 SqliteRepo 里，且和 MemoryAdapter 对齐。
 */
export function createApp(db: Db): Hono {
  const repo = new SqliteRepo(db);
  const app = new Hono();

  // 统一错误翻译：业务错误 → 对应 HTTP 状态码 + 信封；Zod 校验失败 → 400 invalid。
  app.onError((err, c) => {
    if (err instanceof DataPortError) {
      const status =
        err.code === 'not-found'
          ? 404
          : err.code === 'conflict'
            ? 409
            : err.code === 'invalid'
              ? 400
              : err.code === 'network'
                ? 502
                : 500;
      return c.json({ code: err.code, message: err.message }, status);
    }
    if (err instanceof ZodError) {
      return c.json({ code: 'invalid', message: err.issues.map((i) => i.message).join('; ') }, 400);
    }
    return c.json({ code: 'internal', message: String(err instanceof Error ? err.message : err) }, 500);
  });

  // ---- 产品 ----
  app.get('/api/products', (c) => c.json(repo.listProducts()));
  app.get('/api/products/:model', (c) => {
    const product = repo.getProduct(c.req.param('model'));
    if (!product) return c.json({ code: 'not-found', message: '产品不存在' }, 404);
    return c.json(product);
  });
  app.post('/api/products', async (c) => {
    const body = S.ProductSchema.parse(await c.req.json());
    return c.json(repo.createProduct(body), 201);
  });
  app.patch('/api/products/:model', async (c) => {
    const patch = S.ProductSchema.partial().parse(await c.req.json());
    return c.json(repo.updateProduct(c.req.param('model'), patch as ProductPatch));
  });
  app.delete('/api/products/:model', (c) => c.json(repo.deleteProduct(c.req.param('model'))));

  // ---- 测试模板 ----
  app.get('/api/products/:model/templates', (c) =>
    c.json(repo.listTemplates(c.req.param('model'))),
  );
  app.put('/api/products/:model/templates', async (c) => {
    const body = z.array(S.TemplateDraftSchema).parse(await c.req.json());
    return c.json(repo.replaceTemplates(c.req.param('model'), body));
  });
  app.post('/api/products/:model/copy-templates', async (c) => {
    const { from } = S.CopyTemplatesBodySchema.parse(await c.req.json());
    return c.json(repo.copyTemplates(from, c.req.param('model')));
  });

  // ---- 测试台账 / 批次 ----
  app.get('/api/records', (c) => {
    const params = new URL(c.req.url).searchParams;
    const query = S.RecordQuerySchema.parse({
      productModel: params.get('productModel') ?? undefined,
      testItem: params.get('testItem') ?? undefined,
      batchNo: params.get('batchNo') ?? undefined,
    });
    return c.json(repo.listRecords(query as RecordQuery));
  });
  app.get('/api/products/:model/batch-nos', (c) =>
    c.json(repo.listBatchNos(c.req.param('model'))),
  );
  app.post('/api/batches', async (c) => {
    const body = S.BatchDraftSchema.parse(await c.req.json());
    return c.json(repo.saveBatch(body), 201);
  });
  app.delete('/api/batches/:productModel/:batchNo', (c) => {
    const { productModel, batchNo } = c.req.param();
    return c.json(repo.deleteBatch(productModel, batchNo));
  });

  // ---- 聚合 ----
  app.get('/api/heatmap', (c) => c.json(repo.loadHeatmap()));

  return app;
}
