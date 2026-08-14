import { describe, expect, it } from 'vitest';
import {
  moveRow,
  newRow,
  toDrafts,
  toRows,
  validateTemplates,
  type TemplateRow,
} from './template-editor';

function row(testItem: string, spec: string): TemplateRow {
  return { id: `id-${testItem}`, testItem, spec };
}

describe('template-editor 纯逻辑', () => {
  describe('moveRow', () => {
    it('上移中间行，与上一行交换位置', () => {
      const rows = [row('A', 'x'), row('B', 'y'), row('C', 'z')];
      const moved = moveRow(rows, 1, 'up');
      expect(moved.map((r) => r.testItem)).toEqual(['B', 'A', 'C']);
    });

    it('下移中间行，与下一行交换位置', () => {
      const rows = [row('A', 'x'), row('B', 'y'), row('C', 'z')];
      const moved = moveRow(rows, 1, 'down');
      expect(moved.map((r) => r.testItem)).toEqual(['A', 'C', 'B']);
    });

    it('已在顶行时上移原样返回', () => {
      const rows = [row('A', 'x'), row('B', 'y')];
      expect(moveRow(rows, 0, 'up')).toEqual(rows);
    });

    it('已在底行时下移原样返回', () => {
      const rows = [row('A', 'x'), row('B', 'y')];
      expect(moveRow(rows, 1, 'down')).toEqual(rows);
    });

    it('不修改原数组（不可变）', () => {
      const rows = [row('A', 'x'), row('B', 'y')];
      moveRow(rows, 0, 'down');
      expect(rows.map((r) => r.testItem)).toEqual(['A', 'B']);
    });
  });

  describe('toRows / newRow', () => {
    it('toRows 丢弃后端序号，顺序由数组位置表达', () => {
      const rows = toRows([
        { testItem: '导体电阻', spec: '≤0.5Ω' },
        { testItem: '外观检查', spec: '合格' },
      ]);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ testItem: '导体电阻', spec: '≤0.5Ω' });
      expect(rows[0]!.id).not.toEqual(rows[1]!.id);
    });

    it('newRow 产生空行且 id 唯一', () => {
      const a = newRow();
      const b = newRow();
      expect(a.testItem).toBe('');
      expect(a.spec).toBe('');
      expect(a.id).not.toEqual(b.id);
    });
  });

  describe('validateTemplates —— 点保存之前就拦下会错判的规格', () => {
    it('全空两行：报测试项与规格均不能为空', () => {
      const errors = validateTemplates([row('', ''), row('', '')]);
      expect(errors.some((e) => e.includes('测试项名称不能为空'))).toBe(true);
      expect(errors.some((e) => e.includes('规格不能为空'))).toBe(true);
    });

    it('测试项重复：报重复，且不影响其它行的通过', () => {
      const errors = validateTemplates([row('导体电阻', '≤0.5Ω'), row('导体电阻', '≤0.6Ω')]);
      expect(errors).toEqual(['测试项「导体电阻」重复']);
    });

    it('规格无法识别：明确给出原因并阻止保存', () => {
      const errors = validateTemplates([row('回波损耗', '大约 20 分贝')]);
      expect(errors).toEqual([
        '第 1 行「回波损耗」：规格无法识别 —— 不符合任何已知规格形态（≤x / ≥x / x±y / x~y / 合格）',
      ]);
    });

    it('合格这种定性规格是合法的，不报 unparseable', () => {
      const errors = validateTemplates([row('外观检查', '合格')]);
      expect(errors).toEqual([]);
    });

    it('可解析的数值规格通过校验', () => {
      const errors = validateTemplates([
        row('导体电阻', '≤0.5Ω'),
        row('绝缘耐压', '≥1500V'),
        row('外径尺寸', '2.8±0.2mm'),
        row('特性阻抗', '75±3Ω'),
      ]);
      expect(errors).toEqual([]);
    });

    it('空数组不报错误（允许一个测试项都没有的产品）', () => {
      expect(validateTemplates([])).toEqual([]);
    });
  });

  describe('toDrafts', () => {
    it('按下标重排 sortOrder', () => {
      const drafts = toDrafts([row('导体电阻', '≤0.5Ω'), row('外观检查', '合格')]);
      expect(drafts).toEqual([
        { testItem: '导体电阻', spec: '≤0.5Ω', sortOrder: 0 },
        { testItem: '外观检查', spec: '合格', sortOrder: 1 },
      ]);
    });

    it('首尾去空格后再落盘', () => {
      const drafts = toDrafts([row('  导体电阻  ', '  ≤0.5Ω  ')]);
      expect(drafts[0]).toEqual({ testItem: '导体电阻', spec: '≤0.5Ω', sortOrder: 0 });
    });
  });
});
