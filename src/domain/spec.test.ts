import { describe, expect, it } from 'vitest';
import { parseSpec } from './spec';
import { SEED_TEMPLATES } from '../data/seed';

describe('parseSpec — 现有 52 条真实规格', () => {
  it('种子模板确实是 52 条', () => {
    expect(SEED_TEMPLATES).toHaveLength(52);
  });

  it('52 条真实规格无一解析失败', () => {
    const failures = SEED_TEMPLATES.filter(
      (t) => parseSpec(t.spec).kind === 'unparseable',
    ).map((t) => `${t.productModel} / ${t.testItem} / ${t.spec}`);

    expect(failures).toEqual([]);
  });

  // 27 种去重后的真实规格形态，逐条断言种类、数值、单位。
  const cases: readonly [spec: string, expected: unknown][] = [
    ['≤0.5Ω', { kind: 'max', limit: 0.5, unit: 'Ω' }],
    ['≤0.524Ω', { kind: 'max', limit: 0.524, unit: 'Ω' }],
    ['≤0.727Ω', { kind: 'max', limit: 0.727, unit: 'Ω' }],
    ['≤0.22dB/m', { kind: 'max', limit: 0.22, unit: 'dB/m' }],
    ['≤0.55dB/m', { kind: 'max', limit: 0.55, unit: 'dB/m' }],
    ['≤67pF/m', { kind: 'max', limit: 67, unit: 'pF/m' }],
    ['≥1500V', { kind: 'min', limit: 1500, unit: 'V' }],
    ['≥2000V', { kind: 'min', limit: 2000, unit: 'V' }],
    ['≥2500V', { kind: 'min', limit: 2500, unit: 'V' }],
    ['≥3000V', { kind: 'min', limit: 3000, unit: 'V' }],
    ['≥100MΩ', { kind: 'min', limit: 100, unit: 'MΩ' }],
    ['≥5000MΩ·km', { kind: 'min', limit: 5000, unit: 'MΩ·km' }],
    ['≥0.6mm', { kind: 'min', limit: 0.6, unit: 'mm' }],
    ['≥0.7mm', { kind: 'min', limit: 0.7, unit: 'mm' }],
    ['≥0.8mm', { kind: 'min', limit: 0.8, unit: 'mm' }],
    ['≥20dB', { kind: 'min', limit: 20, unit: 'dB' }],
    ['≥80%', { kind: 'min', limit: 80, unit: '%' }],
    ['≥100%', { kind: 'min', limit: 100, unit: '%' }],
    ['≥120%', { kind: 'min', limit: 120, unit: '%' }],
    ['≥20000次', { kind: 'min', limit: 20000, unit: '次' }],
    ['≥30000次', { kind: 'min', limit: 30000, unit: '次' }],
    ['2.8±0.2mm', { kind: 'tolerance', center: 2.8, tolerance: 0.2, unit: 'mm' }],
    ['3.7±0.2mm', { kind: 'tolerance', center: 3.7, tolerance: 0.2, unit: 'mm' }],
    ['7.2±0.3mm', { kind: 'tolerance', center: 7.2, tolerance: 0.3, unit: 'mm' }],
    ['8.4±0.4mm', { kind: 'tolerance', center: 8.4, tolerance: 0.4, unit: 'mm' }],
    ['75±3Ω', { kind: 'tolerance', center: 75, tolerance: 3, unit: 'Ω' }],
    ['合格', { kind: 'qualitative', expected: '合格' }],
  ];

  it.each(cases)('%s 解析正确', (spec, expected) => {
    expect(parseSpec(spec)).toEqual(expected);
  });
});

describe('parseSpec — 单位里带数字（1.0 版静默错判的根因）', () => {
  it('≥1.5mm2 的阈值是 1.5，不是 1.52', () => {
    expect(parseSpec('≥1.5mm2')).toEqual({ kind: 'min', limit: 1.5, unit: 'mm2' });
  });

  it('≥1.5 mm2（带空格）同样得到 1.5', () => {
    expect(parseSpec('≥1.5 mm2')).toEqual({ kind: 'min', limit: 1.5, unit: 'mm2' });
  });

  it('≤2.5mm2 的阈值是 2.5，不是 2.52', () => {
    expect(parseSpec('≤2.5mm2')).toEqual({ kind: 'max', limit: 2.5, unit: 'mm2' });
  });

  /**
   * 这条测试记录的是 1.0 版的具体缺陷，防止有人「优化」时退回剥字符的老路。
   * 旧算法：parseFloat(s.replace(/[^0-9.]/g, ''))
   */
  it('旧算法在同样输入上会给出错的阈值（对照记录）', () => {
    const legacyLimit = (spec: string): number =>
      Number.parseFloat(spec.replace(/[^0-9.]/g, ''));

    expect(legacyLimit('≥1.5mm2')).toBe(1.52); // 错：单位里的 2 被吸进了阈值
    expect(legacyLimit('≥10^8Ω')).toBe(108); // 错：差了七个数量级

    const rule = parseSpec('≥1.5mm2');
    expect(rule.kind).toBe('min');
    expect(rule.kind === 'min' && rule.limit).toBe(1.5);
  });
});

describe('parseSpec — 拒绝解析而不是猜', () => {
  const rejected: readonly [input: string, why: string][] = [
    ['≥10^8Ω', '指数记号，数值段取不完整'],
    ['≥1×10^8Ω', '带乘号的指数记号'],
    ['≥1E8Ω', '科学计数法'],
    ['2.5mm2±0.1', '数值与单位顺序颠倒'],
    ['≤2.8±0.2', '复合规格，语义不明确'],
    ['', '空规格'],
    ['随便写点什么', '不符合任何已知形态'],
    ['75', '裸数字，不知道是上限下限还是中心值'],
    ['5.5~5.0mm', '区间下界大于上界'],
  ];

  it.each(rejected)('%s 判为 unparseable（%s）', (input) => {
    const rule = parseSpec(input);
    expect(rule.kind).toBe('unparseable');
  });

  it('unparseable 会带上原因，便于 UI 告诉人到底哪里不对', () => {
    const rule = parseSpec('≥10^8Ω');
    expect(rule.kind).toBe('unparseable');
    expect(rule.kind === 'unparseable' && rule.reason).toMatch(/指数记号/);
  });
});

describe('parseSpec — 区间与其它形态', () => {
  it('5.0~5.5mm 解析为区间', () => {
    expect(parseSpec('5.0~5.5mm')).toEqual({
      kind: 'range',
      lower: 5,
      upper: 5.5,
      unit: 'mm',
    });
  });

  it('全角波浪号也支持', () => {
    expect(parseSpec('5.0～5.5mm')).toEqual({
      kind: 'range',
      lower: 5,
      upper: 5.5,
      unit: 'mm',
    });
  });

  it('<= 与 >= 两个字符的写法也支持', () => {
    expect(parseSpec('<=0.5Ω')).toEqual({ kind: 'max', limit: 0.5, unit: 'Ω' });
    expect(parseSpec('>=1500V')).toEqual({ kind: 'min', limit: 1500, unit: 'V' });
  });

  it('定性规格的多种写法都识别', () => {
    for (const s of ['合格', '通过', 'OK', 'PASS']) {
      expect(parseSpec(s).kind).toBe('qualitative');
    }
  });

  it('无单位的数值规格是合法的', () => {
    expect(parseSpec('≥20')).toEqual({ kind: 'min', limit: 20, unit: '' });
  });
});
