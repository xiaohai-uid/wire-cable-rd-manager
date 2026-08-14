import { describe, expect, it } from 'vitest';
import { isDataPortError, type DataPort } from './data-port';

/**
 * DataPort 的契约测试。
 *
 * 针对**接口**写一次，对每个实现各跑一遍：
 * - `MemoryAdapter`（演示模式，见 memory-adapter.test.ts）
 * - `HttpAdapter`（本地模式，工单 06）
 *
 * 这是「演示模式和本地模式行为一致」的唯一保证。
 * 如果只测其中一个，另一个迟早会长出自己的行为，而用户会在两种模式间来回切。
 *
 * 契约要求 `createPort()` 返回一个**新的、装好标准种子数据的**端口实例：
 * 5 个产品、52 条模板项、62 条台账记录、总体不良率 4.84%。
 * 每个用例都拿新实例，用例之间不共享状态。
 */
export function describeDataPortContract(
  name: string,
  createPort: () => Promise<DataPort> | DataPort,
): void {
  const port = async (): Promise<DataPort> => await createPort();

  describe(`DataPort 契约 — ${name}`, () => {
    describe('模式标识', () => {
      it('mode 是 demo 或 local 之一', async () => {
        expect(['demo', 'local']).toContain((await port()).mode);
      });
    });

    describe('产品', () => {
      it('列出种子里的 5 个产品', async () => {
        const products = await (await port()).listProducts();
        expect(products.map((p) => p.model)).toEqual([
          'RV-0.5',
          'RVV-3x1.5',
          'SYV-75-5',
          'BV-2.5',
          'H05VV-F',
        ]);
      });

      it('按型号取单个产品，型号不存在时返回 null 而不是抛错', async () => {
        const p = await port();
        expect(await p.getProduct('RV-0.5')).toMatchObject({ model: 'RV-0.5' });
        expect(await p.getProduct('不存在的型号')).toBeNull();
      });

      it('创建产品后能在列表里查到', async () => {
        const p = await port();
        await p.createProduct({
          model: 'YJV-4x16',
          name: 'YJV 4x16mm2 交联电缆',
          drawingNo: 'DRG-YJV-4x16-V1.0',
          description: '',
        });
        expect((await p.listProducts()).map((x) => x.model)).toContain('YJV-4x16');
        expect(await p.getProduct('YJV-4x16')).toMatchObject({ name: 'YJV 4x16mm2 交联电缆' });
      });

      it('型号重复时报 conflict，且不改动已有产品', async () => {
        const p = await port();
        const before = await p.listProducts();

        await expect(
          p.createProduct({
            model: 'RV-0.5',
            name: '想覆盖已有型号',
            drawingNo: 'X',
            description: '',
          }),
        ).rejects.toSatisfy((e: unknown) => isDataPortError(e) && e.code === 'conflict');

        expect(await p.listProducts()).toEqual(before);
      });

      it('更新产品只改传入的字段', async () => {
        const p = await port();
        const updated = await p.updateProduct('RV-0.5', { description: '改过的说明' });
        expect(updated).toMatchObject({
          model: 'RV-0.5',
          name: 'RV 0.5mm2 多股软电线',
          drawingNo: 'DRG-RV-0.5-V2.1',
          description: '改过的说明',
        });
        expect(await p.getProduct('RV-0.5')).toMatchObject({ description: '改过的说明' });
      });

      it('更新不存在的产品报 not-found', async () => {
        await expect(
          (await port()).updateProduct('不存在的型号', { name: 'x' }),
        ).rejects.toSatisfy((e: unknown) => isDataPortError(e) && e.code === 'not-found');
      });

      /**
       * 1.0 版漏了 PRAGMA foreign_keys = ON，删掉产品后台账里留着孤儿记录，
       * 它们还继续参与不良率统计。这条契约就是盯着这个。
       */
      it('删除产品会级联清除它的模板与台账，并返回清除条数', async () => {
        const p = await port();
        const templatesBefore = (await p.listTemplates('SYV-75-5')).length;
        const recordsBefore = (await p.listRecords({ productModel: 'SYV-75-5' })).length;
        expect(templatesBefore).toBeGreaterThan(0);
        expect(recordsBefore).toBeGreaterThan(0);

        const summary = await p.deleteProduct('SYV-75-5');
        expect(summary).toEqual({
          removedTemplates: templatesBefore,
          removedRecords: recordsBefore,
        });

        expect(await p.getProduct('SYV-75-5')).toBeNull();
        expect(await p.listTemplates('SYV-75-5')).toEqual([]);
        expect(await p.listRecords({ productModel: 'SYV-75-5' })).toEqual([]);
      });

      it('删除产品后它不再出现在热力图的列里', async () => {
        const p = await port();
        await p.deleteProduct('SYV-75-5');
        const matrix = await p.loadHeatmap();
        expect(matrix.products).not.toContain('SYV-75-5');
      });

      it('删除不存在的产品报 not-found', async () => {
        await expect((await port()).deleteProduct('不存在的型号')).rejects.toSatisfy(
          (e: unknown) => isDataPortError(e) && e.code === 'not-found',
        );
      });
    });

    describe('测试模板', () => {
      it('按 sortOrder 升序返回', async () => {
        const items = await (await port()).listTemplates('RV-0.5');
        expect(items.length).toBeGreaterThan(0);
        const orders = items.map((i) => i.sortOrder);
        expect(orders).toEqual([...orders].sort((a, b) => a - b));
        expect(items.every((i) => i.productModel === 'RV-0.5')).toBe(true);
      });

      it('整表替换会删掉不在新列表里的项', async () => {
        const p = await port();
        const replaced = await p.replaceTemplates('RV-0.5', [
          { testItem: '导体电阻', spec: '≤0.5Ω', sortOrder: 1 },
          { testItem: '新增项', spec: '≥1.5mm2', sortOrder: 2 },
        ]);
        expect(replaced.map((i) => i.testItem)).toEqual(['导体电阻', '新增项']);
        expect(await p.listTemplates('RV-0.5')).toEqual(replaced);
      });

      it('替换时批内测试项重复报 invalid，且不改动原模板', async () => {
        const p = await port();
        const before = await p.listTemplates('RV-0.5');

        await expect(
          p.replaceTemplates('RV-0.5', [
            { testItem: '导体电阻', spec: '≤0.5Ω', sortOrder: 1 },
            { testItem: '导体电阻', spec: '≤0.6Ω', sortOrder: 2 },
          ]),
        ).rejects.toSatisfy((e: unknown) => isDataPortError(e) && e.code === 'invalid');

        expect(await p.listTemplates('RV-0.5')).toEqual(before);
      });

      it('替换不存在产品的模板报 not-found', async () => {
        await expect(
          (await port()).replaceTemplates('不存在的型号', []),
        ).rejects.toSatisfy((e: unknown) => isDataPortError(e) && e.code === 'not-found');
      });

      it('跨产品复制模板：目标产品的模板被整表替换为源产品的', async () => {
        const p = await port();
        const source = await p.listTemplates('SYV-75-5');
        const copied = await p.copyTemplates('SYV-75-5', 'BV-2.5');

        expect(copied.map((i) => [i.testItem, i.spec])).toEqual(
          source.map((i) => [i.testItem, i.spec]),
        );
        expect(copied.every((i) => i.productModel === 'BV-2.5')).toBe(true);
        // 源产品不受影响
        expect(await p.listTemplates('SYV-75-5')).toEqual(source);
      });
    });

    describe('测试台账', () => {
      it('按产品 + 测试项查询（下钻用）', async () => {
        const rows = await (await port()).listRecords({
          productModel: 'SYV-75-5',
          testItem: '回波损耗',
        });
        expect(rows.length).toBeGreaterThan(0);
        expect(
          rows.every((r) => r.productModel === 'SYV-75-5' && r.testItem === '回波损耗'),
        ).toBe(true);
      });

      it('按批号查询返回该批的全部测试项', async () => {
        const rows = await (await port()).listRecords({ batchNo: 'BV-20260601' });
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.every((r) => r.batchNo === 'BV-20260601')).toBe(true);
        expect(rows.map((r) => r.testItem)).toContain('老化测试');
      });

      it('无条件查询返回全部 62 条记录', async () => {
        expect(await (await port()).listRecords({})).toHaveLength(62);
      });

      it('列出某产品的批号，按测试日期倒序', async () => {
        const p = await port();
        const batchNos = await p.listBatchNos('RV-0.5');
        expect(batchNos.length).toBeGreaterThan(0);

        const dates = await Promise.all(
          batchNos.map(async (no) => {
            const rows = await p.listRecords({ productModel: 'RV-0.5', batchNo: no });
            return rows[0]?.testDate ?? '';
          }),
        );
        expect(dates).toEqual([...dates].sort().reverse());
      });

      it('整批写入后能按批号读回，字段完整', async () => {
        const p = await port();
        const written = await p.saveBatch({
          productModel: 'RV-0.5',
          batchNo: 'RV-20260701',
          testDate: '2026-07-01',
          tester: '张伟',
          entries: [
            {
              testItem: '导体电阻',
              spec: '≤0.5Ω',
              values: [0.42, 0.44, null],
              manualJudgment: null,
              remark: '第三次未测',
            },
            {
              testItem: '外观检查',
              spec: '合格',
              values: [null, null, null],
              manualJudgment: 'pass',
              remark: '',
            },
          ],
        });

        expect(written).toHaveLength(2);
        const readBack = await p.listRecords({ batchNo: 'RV-20260701' });
        expect(readBack).toHaveLength(2);

        const resistance = readBack.find((r) => r.testItem === '导体电阻');
        expect(resistance).toMatchObject({
          productModel: 'RV-0.5',
          batchNo: 'RV-20260701',
          testDate: '2026-07-01',
          tester: '张伟',
          spec: '≤0.5Ω',
          manualJudgment: null,
          remark: '第三次未测',
        });
        // 未填是 null，不能变成 0；0 也不能变成 null
        expect(resistance?.values).toEqual([0.42, 0.44, null]);
        expect(readBack.find((r) => r.testItem === '外观检查')?.manualJudgment).toBe('pass');
      });

      it('测量值 0 存得住，读回来还是 0 而不是 null', async () => {
        const p = await port();
        await p.saveBatch({
          productModel: 'RV-0.5',
          batchNo: 'RV-ZERO',
          testDate: '2026-07-02',
          tester: '张伟',
          entries: [
            {
              testItem: '导体电阻',
              spec: '≤0.5Ω',
              values: [0, 0.1, null],
              manualJudgment: null,
              remark: '',
            },
          ],
        });
        const rows = await p.listRecords({ batchNo: 'RV-ZERO' });
        expect(rows[0]?.values).toEqual([0, 0.1, null]);
      });

      it('同产品同批号重复保存是覆盖，不产生重复记录', async () => {
        const p = await port();
        const draft = {
          productModel: 'RV-0.5',
          batchNo: 'RV-20260701',
          testDate: '2026-07-01',
          tester: '张伟',
          entries: [
            {
              testItem: '导体电阻',
              spec: '≤0.5Ω',
              values: [0.42, 0.44, 0.43],
              manualJudgment: null,
              remark: '',
            },
          ],
        } as const;

        await p.saveBatch(draft);
        await p.saveBatch({ ...draft, entries: [{ ...draft.entries[0], values: [0.4, 0.4, 0.4] }] });

        const rows = await p.listRecords({ batchNo: 'RV-20260701' });
        expect(rows).toHaveLength(1);
        expect(rows[0]?.values).toEqual([0.4, 0.4, 0.4]);
      });

      /** 整批原子：半保存状态是这套系统最不该出现的东西 —— 报告会少几行而没人发现。 */
      it('批内测试项重复时整批都不写入', async () => {
        const p = await port();
        const before = await p.listRecords({});

        await expect(
          p.saveBatch({
            productModel: 'RV-0.5',
            batchNo: 'RV-BAD',
            testDate: '2026-07-03',
            tester: '张伟',
            entries: [
              {
                testItem: '导体电阻',
                spec: '≤0.5Ω',
                values: [0.42, null, null],
                manualJudgment: null,
                remark: '',
              },
              {
                testItem: '导体电阻',
                spec: '≤0.5Ω',
                values: [0.43, null, null],
                manualJudgment: null,
                remark: '',
              },
            ],
          }),
        ).rejects.toSatisfy((e: unknown) => isDataPortError(e) && e.code === 'invalid');

        expect(await p.listRecords({ batchNo: 'RV-BAD' })).toEqual([]);
        expect(await p.listRecords({})).toHaveLength(before.length);
      });

      it('批次为空报 invalid', async () => {
        await expect(
          (await port()).saveBatch({
            productModel: 'RV-0.5',
            batchNo: 'RV-EMPTY',
            testDate: '2026-07-03',
            tester: '张伟',
            entries: [],
          }),
        ).rejects.toSatisfy((e: unknown) => isDataPortError(e) && e.code === 'invalid');
      });

      it('给不存在的产品写批次报 not-found，且什么都不写', async () => {
        const p = await port();
        await expect(
          p.saveBatch({
            productModel: '不存在的型号',
            batchNo: 'X-001',
            testDate: '2026-07-03',
            tester: '张伟',
            entries: [
              {
                testItem: '导体电阻',
                spec: '≤0.5Ω',
                values: [0.42, null, null],
                manualJudgment: null,
                remark: '',
              },
            ],
          }),
        ).rejects.toSatisfy((e: unknown) => isDataPortError(e) && e.code === 'not-found');

        expect(await p.listRecords({ batchNo: 'X-001' })).toEqual([]);
      });

      it('删除整批返回删除条数，且该批记录全部消失', async () => {
        const p = await port();
        const size = (await p.listRecords({ batchNo: 'BV-20260601' })).length;
        expect(await p.deleteBatch('BV-2.5', 'BV-20260601')).toBe(size);
        expect(await p.listRecords({ batchNo: 'BV-20260601' })).toEqual([]);
      });

      it('删除不存在的批次报 not-found', async () => {
        await expect((await port()).deleteBatch('RV-0.5', '不存在的批号')).rejects.toSatisfy(
          (e: unknown) => isDataPortError(e) && e.code === 'not-found',
        );
      });
    });

    describe('热力图聚合', () => {
      it('返回与真实数据一致的总体口径：62 条已判定、3 条不合格、不良率 4.84%', async () => {
        const { overall } = await (await port()).loadHeatmap();
        expect(overall.totalCount).toBe(62);
        expect(overall.judgedCount).toBe(62);
        expect(overall.failCount).toBe(3);
        expect(overall.unparseableCount).toBe(0);
        expect(((overall.defectRate ?? 0) * 100).toFixed(2)).toBe('4.84');
      });

      it('列与产品列表同序，行覆盖模板里配置的全部测试项', async () => {
        const p = await port();
        const matrix = await p.loadHeatmap();
        const products = await p.listProducts();
        expect(matrix.products).toEqual(products.map((x) => x.model));
        expect(matrix.rows.length).toBeGreaterThan(0);
      });

      it('SYV-75-5 的回波损耗是 100% 不良（1 次测试、1 次不合格）', async () => {
        const matrix = await (await port()).loadHeatmap();
        const row = matrix.rows.find((r) => r.testItem === '回波损耗');
        const cellIndex = matrix.products.indexOf('SYV-75-5');
        const cell = row?.cells[cellIndex];
        expect(cell).toMatchObject({ configured: true, judgedCount: 1, failCount: 1 });
        expect(cell?.defectRate).toBe(1);
      });

      it('写入新批次后热力图立刻反映出来', async () => {
        const p = await port();
        const before = await p.loadHeatmap();
        await p.saveBatch({
          productModel: 'RV-0.5',
          batchNo: 'RV-20260799',
          testDate: '2026-07-09',
          tester: '张伟',
          entries: [
            {
              testItem: '导体电阻',
              spec: '≤0.5Ω',
              values: [0.9, 0.9, 0.9], // 明显超差
              manualJudgment: null,
              remark: '',
            },
          ],
        });
        const after = await p.loadHeatmap();
        expect(after.overall.totalCount).toBe(before.overall.totalCount + 1);
        expect(after.overall.failCount).toBe(before.overall.failCount + 1);
      });
    });
  });
}
