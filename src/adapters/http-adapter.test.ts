import { describe, expect, it } from 'vitest';
import { describeDataPortContract } from '../ports/data-port.contract';
import { HttpAdapter } from './http-adapter';
import { isDataPortError, type DataPort } from '../ports/data-port';
import { openDb, seedIfEmpty } from '../server/db';
import { createApp } from '../server/app';
import { SqliteRepo } from '../server/repo';

/**
 * 工单 06 的验收核心：同一套 DataPort 契约，对 MemoryAdapter 和 HttpAdapter 各跑一遍，全绿。
 *
 * 这里把 HttpAdapter 的 `fetchImpl` 直接接到内存中的 Hono 实例（`app.request`），
 * 不占用端口、不走网络栈，但跑的是真实的「HTTP 请求 → 路由 → SqliteRepo → SQLite → 响应 → Zod 校验」全链路。
 * 这样契约测试证明的是「演示模式（Memory）和本地模式（Http+SQLite）行为完全一致」，
 * 也把 1.0 版「API 返回结构和前端预期不符却无人察觉」挡在边界上。
 */
function createHttpPort(): DataPort {
  const db = openDb(':memory:');
  seedIfEmpty(db);
  const app = createApp(db);
  const fetchImpl = (url: string | URL | Request, init?: RequestInit) =>
    app.request(url as string, init as never) as unknown as Promise<Response>;
  return new HttpAdapter({ baseUrl: 'http://local.test', fetchImpl });
}

describe('HttpAdapter 走同一套 DataPort 契约', () => {
  describeDataPortContract('HttpAdapter', createHttpPort);
});

describe('HttpAdapter 后端硬约束（外键 + 事务，不靠人记得）', () => {
  it('建立连接即开启 foreign_keys：直接插入指向不存在产品的台账记录被拒绝', () => {
    const db = openDb(':memory:');
    seedIfEmpty(db);
    const stmt = db.prepare(
      `INSERT INTO records
         (id, testDate, productModel, drawingNo, batchNo, testItem, spec, v0, v1, v2, manualJudgment, tester, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    expect(() =>
      stmt.run('x', '2026-01-01', '不存在的型号', 'd', 'b', 't', 's', 1, 1, 1, null, 'a', ''),
    ).toThrow(/FOREIGN KEY/);
  });

  it('删除产品由外键级联清掉模板与台账，不留孤儿（清前先数出条数）', () => {
    const db = openDb(':memory:');
    seedIfEmpty(db);
    const repo = new SqliteRepo(db);
    const { removedTemplates, removedRecords } = repo.deleteProduct('SYV-75-5');
    expect(removedTemplates).toBeGreaterThan(0);
    expect(removedRecords).toBeGreaterThan(0);
    expect(repo.getProduct('SYV-75-5')).toBeNull();
    expect(repo.listTemplates('SYV-75-5')).toEqual([]);
    expect(repo.listRecords({ productModel: 'SYV-75-5' })).toEqual([]);
  });

  it('整批写入原子：批内测试项重复时整批不写入，不留半保存残影', () => {
    const db = openDb(':memory:');
    seedIfEmpty(db);
    const repo = new SqliteRepo(db);
    const before = repo.listRecords({}).length;

    let thrown: unknown;
    try {
      repo.saveBatch({
        productModel: 'RV-0.5',
        batchNo: 'RV-DUP',
        testDate: '2026-01-01',
        tester: '张伟',
        entries: [
          { testItem: '导体电阻', spec: '≤0.5Ω', values: [1, 1, 1], manualJudgment: null, remark: '' },
          { testItem: '导体电阻', spec: '≤0.5Ω', values: [2, 2, 2], manualJudgment: null, remark: '' },
        ],
      });
    } catch (e) {
      thrown = e;
    }

    expect(isDataPortError(thrown) && thrown.code === 'invalid').toBe(true);
    expect(repo.listRecords({})).toHaveLength(before);
    expect(repo.listRecords({ batchNo: 'RV-DUP' })).toEqual([]);
  });

  it('每个 API 端点只定义一次：GET /api/products 返回 5 个产品，GET /api/heatmap 聚合 62 条', async () => {
    const db = openDb(':memory:');
    seedIfEmpty(db);
    const app = createApp(db);

    const productsRes = await app.request('http://local.test/api/products');
    const products = (await productsRes.json()) as { model: string }[];
    expect(products).toHaveLength(5);

    const heatRes = await app.request('http://local.test/api/heatmap');
    const heat = (await heatRes.json()) as { overall: { totalCount: number } };
    expect(heat.overall.totalCount).toBe(62);
  });
});
