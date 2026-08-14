import { describe, expect, it } from 'vitest';
import { buildHeatmap } from './heatmap';
import { SEED_PRODUCTS, SEED_RECORDS, SEED_TEMPLATES } from '../data/seed';

const matrix = buildHeatmap({
  products: SEED_PRODUCTS,
  templates: SEED_TEMPLATES,
  records: SEED_RECORDS,
});

const rowOf = (testItem: string) => matrix.rows.find((r) => r.testItem === testItem);
const cellOf = (testItem: string, productModel: string) =>
  rowOf(testItem)?.cells.find((c) => c.productModel === productModel);

describe('buildHeatmap — 整体口径', () => {
  it('5 个产品作为列', () => {
    expect(matrix.products).toEqual([
      'RV-0.5',
      'RVV-3x1.5',
      'SYV-75-5',
      'BV-2.5',
      'H05VV-F',
    ]);
  });

  it('21 个去重测试项作为行', () => {
    expect(matrix.rows).toHaveLength(21);
  });

  it('总体：62 条记录、62 条已判定、3 条不合格', () => {
    expect(matrix.overall.totalCount).toBe(62);
    expect(matrix.overall.judgedCount).toBe(62);
    expect(matrix.overall.failCount).toBe(3);
    expect(matrix.overall.unjudgedCount).toBe(0);
    expect(matrix.overall.unparseableCount).toBe(0);
  });

  it('总体不良率为 4.84%（与 1.0 版口径一致）', () => {
    expect(matrix.overall.defectRate).not.toBeNull();
    expect((matrix.overall.defectRate! * 100).toFixed(2)).toBe('4.84');
  });
});

describe('buildHeatmap — 排序把最该处理的浮到最上面', () => {
  it('不良率最高的回波损耗排第一', () => {
    expect(matrix.rows[0]?.testItem).toBe('回波损耗');
    expect(matrix.rows[0]?.defectRate).toBe(1);
  });

  it('其后依次是老化测试（1/5）与导体电阻（1/6）', () => {
    expect(matrix.rows[1]?.testItem).toBe('老化测试');
    expect(matrix.rows[1]?.failCount).toBe(1);
    expect(matrix.rows[1]?.judgedCount).toBe(5);

    expect(matrix.rows[2]?.testItem).toBe('导体电阻');
    expect(matrix.rows[2]?.failCount).toBe(1);
    expect(matrix.rows[2]?.judgedCount).toBe(6);
  });

  it('零不合格的行排在有不合格的行之后', () => {
    const firstClean = matrix.rows.findIndex((r) => r.failCount === 0);
    const lastDirty = matrix.rows.reduce(
      (acc, r, i) => (r.failCount > 0 ? i : acc),
      -1,
    );
    expect(firstClean).toBeGreaterThan(lastDirty);
  });
});

describe('buildHeatmap — 「没测」与「测了没问题」必须能区分', () => {
  it('SYV 的回波损耗格子：已配置、1 次已判定、1 次不合格', () => {
    const cell = cellOf('回波损耗', 'SYV-75-5');
    expect(cell).toMatchObject({
      configured: true,
      judgedCount: 1,
      failCount: 1,
      defectRate: 1,
    });
  });

  it('RV-0.5 没有回波损耗这一项：configured 为 false、不良率为 null 而不是 0', () => {
    const cell = cellOf('回波损耗', 'RV-0.5');
    expect(cell?.configured).toBe(false);
    expect(cell?.judgedCount).toBe(0);
    expect(cell?.defectRate).toBeNull();
  });

  it('测了且零不合格的格子：configured 为 true、不良率为 0（不是 null）', () => {
    const cell = cellOf('绝缘耐压', 'RV-0.5');
    expect(cell?.configured).toBe(true);
    expect(cell?.judgedCount).toBe(2);
    expect(cell?.defectRate).toBe(0);
  });
});

describe('buildHeatmap — 分母必须可见', () => {
  it('100% 不良率的格子带出分母，能区分 1/1 与 12/12', () => {
    const cell = cellOf('回波损耗', 'SYV-75-5');
    expect(cell?.failCount).toBe(1);
    expect(cell?.judgedCount).toBe(1);
  });

  it('导体电阻这一行覆盖全部 5 个产品共 6 次测量', () => {
    const row = rowOf('导体电阻');
    expect(row?.judgedCount).toBe(6);
    expect(row?.cells.filter((c) => c.configured)).toHaveLength(5);
  });
});

describe('buildHeatmap — 定性项可识别', () => {
  it('外观检查被标为定性项', () => {
    expect(rowOf('外观检查')?.isQualitative).toBe(true);
  });

  it('导体电阻不是定性项', () => {
    expect(rowOf('导体电阻')?.isQualitative).toBe(false);
  });

  it('定性项的人工判定计入分母', () => {
    const row = rowOf('外观检查');
    expect(row?.judgedCount).toBe(6);
    expect(row?.failCount).toBe(0);
  });
});

describe('buildHeatmap — 配了但还没测的项不会整行消失', () => {
  it('模板里配了却没有记录的测试项仍然占一行，分母为 0', () => {
    const withoutRecords = buildHeatmap({
      products: SEED_PRODUCTS,
      templates: SEED_TEMPLATES,
      records: [],
    });
    expect(withoutRecords.rows).toHaveLength(21);
    expect(withoutRecords.overall.judgedCount).toBe(0);
    expect(withoutRecords.overall.defectRate).toBeNull();
  });
});
