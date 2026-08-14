import { describe, expect, it } from 'vitest';
import {
  averageOf,
  isJudged,
  isValueOutOfSpec,
  judge,
  resolveJudgment,
} from './judgment';
import { parseSpec } from './spec';
import { SEED_RECORDS } from '../data/seed';

describe('averageOf — 0 是合法测量值，null 才是未填', () => {
  it('三次都是 0 时平均值是 0，不是 null', () => {
    expect(averageOf([0, 0, 0])).toBe(0);
  });

  it('全未填返回 null', () => {
    expect(averageOf([null, null, null])).toBeNull();
  });

  it('只填一次时按一次算', () => {
    expect(averageOf([0.42, null, null])).toBe(0.42);
  });

  it('平均值保留四位小数', () => {
    expect(averageOf([1, 2, 2])).toBe(1.6667);
  });
});

describe('judge — 数值项', () => {
  it('三次全部落在规格内才算合格', () => {
    const rule = parseSpec('≤0.5Ω');
    expect(judge(rule, [0.42, 0.44, 0.43])).toBe('pass');
  });

  it('一次越界即不合格', () => {
    const rule = parseSpec('≤0.5Ω');
    expect(judge(rule, [0.48, 0.52, 0.49])).toBe('fail');
  });

  it('只填了一两次时按已填的判', () => {
    const rule = parseSpec('≤0.5Ω');
    expect(judge(rule, [0.42, null, null])).toBe('pass');
    expect(judge(rule, [0.62, null, null])).toBe('fail');
  });

  it('三次全未填是未判定，不是不合格', () => {
    const rule = parseSpec('≤0.5Ω');
    expect(judge(rule, [null, null, null])).toBe('unjudged');
  });

  it('测量值 0 参与判定而不是被当成未填', () => {
    expect(judge(parseSpec('≤0.5Ω'), [0, 0, 0])).toBe('pass');
    expect(judge(parseSpec('≥20dB'), [0, 0, 0])).toBe('fail');
  });
});

describe('judge — 公差与区间的浮点边界', () => {
  /**
   * JS 里 2.8 + 0.2 === 3.0000000000000004。
   * 不做容差处理的话，恰好落在公差上界的 3.0 会被误判成超差。
   */
  it('恰好落在公差上界的值算合格', () => {
    const rule = parseSpec('2.8±0.2mm');
    expect(judge(rule, [3.0, 3.0, 3.0])).toBe('pass');
  });

  it('恰好落在公差下界的值算合格', () => {
    const rule = parseSpec('2.8±0.2mm');
    expect(judge(rule, [2.6, 2.6, 2.6])).toBe('pass');
  });

  it('略微超出公差就不合格', () => {
    const rule = parseSpec('2.8±0.2mm');
    expect(judge(rule, [3.001, 2.8, 2.8])).toBe('fail');
  });

  it('恰好等于上限的值算合格（≤ 含等号）', () => {
    expect(judge(parseSpec('≤0.5Ω'), [0.5, 0.5, 0.5])).toBe('pass');
  });

  it('恰好等于下限的值算合格（≥ 含等号）', () => {
    expect(judge(parseSpec('≥20dB'), [20, 20, 20])).toBe('pass');
  });

  it('区间两端都是闭区间', () => {
    const rule = parseSpec('5.0~5.5mm');
    expect(judge(rule, [5.0, 5.25, 5.5])).toBe('pass');
    expect(judge(rule, [4.999, 5.25, 5.5])).toBe('fail');
  });
});

describe('judge — 定性项与无法识别的规格', () => {
  it('定性项系统不猜，返回未判定', () => {
    expect(judge(parseSpec('合格'), [null, null, null])).toBe('unjudged');
  });

  it('定性项带人工判定时取人工结果', () => {
    expect(
      resolveJudgment({ spec: '合格', values: [null, null, null], manualJudgment: 'pass' })
        .judgment,
    ).toBe('pass');
    expect(
      resolveJudgment({ spec: '合格', values: [null, null, null], manualJudgment: 'fail' })
        .judgment,
    ).toBe('fail');
  });

  it('规格无法识别时拒绝判定，绝不给出合格或不合格', () => {
    const resolved = resolveJudgment({ spec: '≥10^8Ω', values: [5, 5, 5] });
    expect(resolved.judgment).toBe('unparseable');
    expect(resolved.judgment).not.toBe('pass');
    expect(resolved.judgment).not.toBe('fail');
  });

  it('未判定与无法识别都不进入不良率分母', () => {
    expect(isJudged('pass')).toBe(true);
    expect(isJudged('fail')).toBe(true);
    expect(isJudged('unjudged')).toBe(false);
    expect(isJudged('unparseable')).toBe(false);
  });
});

describe('isValueOutOfSpec — 只标红越界的那一次', () => {
  it('三次里只有一次坏时，只有那一次被标出来', () => {
    const resolved = resolveJudgment({ spec: '≤0.5Ω', values: [0.48, 0.52, 0.49] });
    expect(resolved.outOfSpecIndexes).toEqual([1]);
  });

  it('三次全坏时三次都被标出来', () => {
    const resolved = resolveJudgment({ spec: '≥20dB', values: [18.5, 19.2, 17.8] });
    expect(resolved.outOfSpecIndexes).toEqual([0, 1, 2]);
  });

  it('无法识别的规格不做任何数值推断', () => {
    expect(isValueOutOfSpec(parseSpec('≥10^8Ω'), 1)).toBe(false);
  });
});

describe('真实数据的判定结果', () => {
  it('种子记录确实是 62 条', () => {
    expect(SEED_RECORDS).toHaveLength(62);
  });

  const resolvedByKey = new Map(
    SEED_RECORDS.map((r) => [`${r.batchNo}::${r.testItem}`, resolveJudgment(r)]),
  );

  it('RV-20260602 导体电阻不合格（0.52 超上限 0.5Ω），且只有第二次越界', () => {
    const resolved = resolvedByKey.get('RV-20260602::导体电阻');
    expect(resolved?.judgment).toBe('fail');
    expect(resolved?.outOfSpecIndexes).toEqual([1]);
  });

  it('SYV-20260601 回波损耗不合格，三次全部低于 20dB', () => {
    const resolved = resolvedByKey.get('SYV-20260601::回波损耗');
    expect(resolved?.judgment).toBe('fail');
    expect(resolved?.outOfSpecIndexes).toEqual([0, 1, 2]);
  });

  it('BV-20260601 老化测试不合格，三次全部低于 80%', () => {
    const resolved = resolvedByKey.get('BV-20260601::老化测试');
    expect(resolved?.judgment).toBe('fail');
    expect(resolved?.outOfSpecIndexes).toEqual([0, 1, 2]);
  });

  it('全部 62 条记录里恰好 3 条不合格', () => {
    const failed = SEED_RECORDS.filter((r) => resolveJudgment(r).judgment === 'fail');
    expect(failed).toHaveLength(3);
  });

  it('没有任何一条记录因为规格无法识别而卡住', () => {
    const stuck = SEED_RECORDS.filter(
      (r) => resolveJudgment(r).judgment === 'unparseable',
    );
    expect(stuck).toEqual([]);
  });

  it('10 条定性记录由人工判定，全部为合格', () => {
    const qualitative = SEED_RECORDS.filter((r) => r.manualJudgment !== null);
    expect(qualitative).toHaveLength(10);
    expect(qualitative.every((r) => resolveJudgment(r).judgment === 'pass')).toBe(true);
  });
});
