import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from './memory-adapter';
import { describeDataPortContract } from '../ports/data-port.contract';

// 同一套契约，工单 06 的 HttpAdapter 会原样再跑一遍。
describeDataPortContract('MemoryAdapter', () => new MemoryAdapter());

describe('MemoryAdapter 特有行为', () => {
  it('mode 是 demo —— UI 靠它决定要不要挂「数据不持久」的标注', () => {
    expect(new MemoryAdapter().mode).toBe('demo');
  });

  it('两个实例互不影响 —— 一个实例的写入不会污染另一个', async () => {
    const a = new MemoryAdapter();
    const b = new MemoryAdapter();

    await a.deleteProduct('RV-0.5');

    expect(await a.getProduct('RV-0.5')).toBeNull();
    expect(await b.getProduct('RV-0.5')).not.toBeNull();
  });

  it('写入不会改到导出的种子常量本身（种子同时是测试夹具，被改了会污染其它测试）', async () => {
    const { SEED_PRODUCTS, SEED_RECORDS } = await import('../data/seed');
    const port = new MemoryAdapter();

    await port.createProduct({ model: 'TMP', name: 'x', drawingNo: 'x', description: '' });
    await port.deleteBatch('BV-2.5', 'BV-20260601');

    expect(SEED_PRODUCTS).toHaveLength(5);
    expect(SEED_RECORDS).toHaveLength(62);
  });

  it('可以注入空数据集，用于验证空状态界面', async () => {
    const empty = new MemoryAdapter({ products: [], templates: [], records: [] });
    expect(await empty.listProducts()).toEqual([]);
    const matrix = await empty.loadHeatmap();
    expect(matrix.rows).toEqual([]);
    expect(matrix.overall.defectRate).toBeNull();
  });
});
