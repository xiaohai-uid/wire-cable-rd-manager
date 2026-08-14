import type { LedgerRecord, Product, TestTemplateItem } from '../domain/types';

/**
 * 真实种子数据 —— 逐条搬自 1.0 版的 seed-real-data.js（现保留在 legacy 分支）。
 *
 * 它有两个用途，且必须是同一份：
 * 1. MemoryAdapter 的演示数据（在线 demo 打开就有东西看）
 * 2. 判定引擎的测试夹具（断言的是真实规格与真实测量值，不是编出来的例子）
 *
 * 规模：5 个产品、52 条测试模板项、6 个批次、62 条测试台账记录、3 条不合格、不良率 4.84%。
 */

export const SEED_PRODUCTS: readonly Product[] = [
  {
    model: 'RV-0.5',
    name: 'RV 0.5mm2 多股软电线',
    drawingNo: 'DRG-RV-0.5-V2.1',
    description: 'GB/T 5023.3-2008 内部布线用',
  },
  {
    model: 'RVV-3x1.5',
    name: 'RVV 3x1.5mm2 护套线',
    drawingNo: 'DRG-RVV-3x1.5-V1.0',
    description: 'GB/T 5023.5-2008 轻型护套软电缆',
  },
  {
    model: 'SYV-75-5',
    name: 'SYV 75-5 同轴电缆',
    drawingNo: 'DRG-SYV-75-5-V3.0',
    description: 'SJ/T 11138-1997 视频同轴电缆',
  },
  {
    model: 'BV-2.5',
    name: 'BV 2.5mm2 单芯硬导体',
    drawingNo: 'DRG-BV-2.5-V1.2',
    description: 'GB/T 5023.3-2008 固定布线用',
  },
  {
    model: 'H05VV-F',
    name: 'H05VV-F 3G1.0mm2 欧标电源线',
    drawingNo: 'DRG-H05VV-F-V2.0',
    description: 'EN 50525-2-11 欧标电源线',
  },
];

/** [测试项, 规格] */
type RawTemplateItem = readonly [testItem: string, spec: string];

const RAW_TEMPLATES: readonly (readonly [string, readonly RawTemplateItem[]])[] = [
  [
    'RV-0.5',
    [
      ['导体电阻', '≤0.5Ω'],
      ['绝缘耐压', '≥1500V'],
      ['绝缘电阻', '≥100MΩ'],
      ['外径尺寸', '2.8±0.2mm'],
      ['绝缘厚度', '≥0.6mm'],
      ['伸长率', '≥120%'],
      ['老化测试', '≥80%'],
      ['外观检查', '合格'],
      ['导通测试', '合格'],
      ['火花测试', '≥3000V'],
    ],
  ],
  [
    'RVV-3x1.5',
    [
      ['导体电阻', '≤0.524Ω'],
      ['绝缘耐压', '≥2000V'],
      ['绝缘电阻', '≥100MΩ'],
      ['护套厚度', '≥0.8mm'],
      ['外径尺寸', '8.4±0.4mm'],
      ['绝缘厚度', '≥0.8mm'],
      ['伸长率(绝缘)', '≥100%'],
      ['伸长率(护套)', '≥100%'],
      ['老化测试', '≥80%'],
      ['外观检查', '合格'],
      ['导通测试', '合格'],
      ['曲挠试验', '≥20000次'],
    ],
  ],
  [
    'SYV-75-5',
    [
      ['导体电阻', '≤0.5Ω'],
      ['绝缘电阻', '≥5000MΩ·km'],
      ['特性阻抗', '75±3Ω'],
      ['衰减常数(30MHz)', '≤0.22dB/m'],
      ['衰减常数(200MHz)', '≤0.55dB/m'],
      ['电容', '≤67pF/m'],
      ['回波损耗', '≥20dB'],
      ['护套厚度', '≥0.7mm'],
      ['外径尺寸', '7.2±0.3mm'],
      ['外观检查', '合格'],
    ],
  ],
  [
    'BV-2.5',
    [
      ['导体电阻', '≤0.727Ω'],
      ['绝缘耐压', '≥2500V'],
      ['绝缘电阻', '≥100MΩ'],
      ['绝缘厚度', '≥0.8mm'],
      ['外径尺寸', '3.7±0.2mm'],
      ['伸长率', '≥120%'],
      ['老化测试', '≥80%'],
      ['外观检查', '合格'],
      ['不延燃试验', '合格'],
    ],
  ],
  [
    'H05VV-F',
    [
      ['导体电阻', '≤0.524Ω'],
      ['绝缘耐压', '≥2000V'],
      ['绝缘电阻', '≥100MΩ'],
      ['护套厚度', '≥0.6mm'],
      ['外径尺寸', '6.8±0.4mm'],
      ['绝缘厚度', '≥0.6mm'],
      ['伸长率', '≥100%'],
      ['老化测试', '≥80%'],
      ['外观检查', '合格'],
      ['耐压测试', '≥2000V'],
      ['曲挠试验', '≥30000次'],
    ],
  ],
];

export const SEED_TEMPLATES: readonly TestTemplateItem[] = RAW_TEMPLATES.flatMap(
  ([productModel, items]) =>
    items.map(([testItem, spec], sortOrder) => ({
      productModel,
      testItem,
      spec,
      sortOrder,
    })),
);

/**
 * 测量值。数值项给三次测量；
 * 定性项（外观检查、导通测试等）没有数值，用 'manual-pass' 表示人工判定为合格 ——
 * 这类记录**是已判定记录**，进入不良率分母，只是判定不由数值算出。
 */
type RawMeasurement = readonly [number, number, number] | 'manual-pass';

type RawLedgerItem = readonly [testItem: string, spec: string, values: RawMeasurement];

interface RawBatch {
  readonly testDate: string;
  readonly productModel: string;
  readonly drawingNo: string;
  readonly batchNo: string;
  readonly tester: string;
  readonly items: readonly RawLedgerItem[];
}

const RAW_BATCHES: readonly RawBatch[] = [
  {
    testDate: '2026-06-20',
    productModel: 'RV-0.5',
    drawingNo: 'DRG-RV-0.5-V2.1',
    batchNo: 'RV-20260601',
    tester: '李明',
    items: [
      ['导体电阻', '≤0.5Ω', [0.42, 0.44, 0.43]],
      ['绝缘耐压', '≥1500V', [1800, 1750, 1820]],
      ['绝缘电阻', '≥100MΩ', [250, 220, 260]],
      ['外径尺寸', '2.8±0.2mm', [2.85, 2.82, 2.88]],
      ['绝缘厚度', '≥0.6mm', [0.68, 0.65, 0.7]],
      ['伸长率', '≥120%', [145, 138, 152]],
      ['老化测试', '≥80%', [92, 89, 95]],
      ['外观检查', '合格', 'manual-pass'],
      ['导通测试', '合格', 'manual-pass'],
      ['火花测试', '≥3000V', [3500, 3400, 3550]],
    ],
  },
  {
    testDate: '2026-06-22',
    productModel: 'RV-0.5',
    drawingNo: 'DRG-RV-0.5-V2.1',
    batchNo: 'RV-20260602',
    tester: '王芳',
    items: [
      // 0.52 超过上限 0.5 —— 这是三条真实不合格之一
      ['导体电阻', '≤0.5Ω', [0.48, 0.52, 0.49]],
      ['绝缘耐压', '≥1500V', [1650, 1700, 1680]],
      ['绝缘电阻', '≥100MΩ', [200, 180, 210]],
      ['外径尺寸', '2.8±0.2mm', [2.75, 2.8, 2.72]],
      ['绝缘厚度', '≥0.6mm', [0.62, 0.6, 0.64]],
      ['伸长率', '≥120%', [130, 125, 135]],
      ['老化测试', '≥80%', [88, 85, 90]],
      ['外观检查', '合格', 'manual-pass'],
      ['导通测试', '合格', 'manual-pass'],
      ['火花测试', '≥3000V', [3200, 3100, 3300]],
    ],
  },
  {
    testDate: '2026-06-23',
    productModel: 'RVV-3x1.5',
    drawingNo: 'DRG-RVV-3x1.5-V1.0',
    batchNo: 'RVV-20260601',
    tester: '李明',
    items: [
      ['导体电阻', '≤0.524Ω', [0.45, 0.47, 0.44]],
      ['绝缘耐压', '≥2000V', [2400, 2350, 2450]],
      ['绝缘电阻', '≥100MΩ', [180, 190, 175]],
      ['护套厚度', '≥0.8mm', [0.95, 0.92, 0.98]],
      ['外径尺寸', '8.4±0.4mm', [8.3, 8.35, 8.25]],
      ['绝缘厚度', '≥0.8mm', [0.88, 0.85, 0.9]],
      ['伸长率(绝缘)', '≥100%', [115, 110, 120]],
      ['伸长率(护套)', '≥100%', [125, 118, 130]],
      ['老化测试', '≥80%', [90, 87, 93]],
      ['外观检查', '合格', 'manual-pass'],
      ['导通测试', '合格', 'manual-pass'],
      ['曲挠试验', '≥20000次', [28500, 27500, 29500]],
    ],
  },
  {
    testDate: '2026-06-24',
    productModel: 'SYV-75-5',
    drawingNo: 'DRG-SYV-75-5-V3.0',
    batchNo: 'SYV-20260601',
    tester: '张伟',
    items: [
      ['导体电阻', '≤0.5Ω', [0.35, 0.37, 0.34]],
      ['绝缘电阻', '≥5000MΩ·km', [8500, 8200, 8800]],
      ['特性阻抗', '75±3Ω', [74.5, 74.8, 74.2]],
      ['衰减常数(30MHz)', '≤0.22dB/m', [0.18, 0.19, 0.17]],
      ['衰减常数(200MHz)', '≤0.55dB/m', [0.45, 0.47, 0.44]],
      ['电容', '≤67pF/m', [58, 60, 56]],
      // 三次全部低于下限 20dB —— 三条真实不合格之二，且是「三次全坏」的典型
      ['回波损耗', '≥20dB', [18.5, 19.2, 17.8]],
      ['护套厚度', '≥0.7mm', [0.78, 0.75, 0.8]],
      ['外径尺寸', '7.2±0.3mm', [7.15, 7.2, 7.1]],
      ['外观检查', '合格', 'manual-pass'],
    ],
  },
  {
    testDate: '2026-06-25',
    productModel: 'BV-2.5',
    drawingNo: 'DRG-BV-2.5-V1.2',
    batchNo: 'BV-20260601',
    tester: '王芳',
    items: [
      ['导体电阻', '≤0.727Ω', [0.62, 0.65, 0.6]],
      ['绝缘耐压', '≥2500V', [3000, 2950, 3050]],
      ['绝缘电阻', '≥100MΩ', [300, 280, 320]],
      ['绝缘厚度', '≥0.8mm', [0.92, 0.9, 0.95]],
      ['外径尺寸', '3.7±0.2mm', [3.75, 3.72, 3.8]],
      ['伸长率', '≥120%', [135, 128, 140]],
      // 三次全部低于下限 80% —— 三条真实不合格之三
      ['老化测试', '≥80%', [72, 68, 75]],
      ['外观检查', '合格', 'manual-pass'],
      ['不延燃试验', '合格', 'manual-pass'],
    ],
  },
  {
    testDate: '2026-06-26',
    productModel: 'H05VV-F',
    drawingNo: 'DRG-H05VV-F-V2.0',
    batchNo: 'H05VV-20260601',
    tester: '李明',
    items: [
      ['导体电阻', '≤0.524Ω', [0.42, 0.44, 0.41]],
      ['绝缘耐压', '≥2000V', [2500, 2450, 2550]],
      ['绝缘电阻', '≥100MΩ', [220, 200, 240]],
      ['护套厚度', '≥0.6mm', [0.72, 0.7, 0.75]],
      ['外径尺寸', '6.8±0.4mm', [6.65, 6.7, 6.6]],
      ['绝缘厚度', '≥0.6mm', [0.68, 0.65, 0.7]],
      ['伸长率', '≥100%', [118, 112, 122]],
      ['老化测试', '≥80%', [92, 89, 94]],
      ['外观检查', '合格', 'manual-pass'],
      ['耐压测试', '≥2000V', [2600, 2550, 2650]],
      ['曲挠试验', '≥30000次', [38500, 37500, 39500]],
    ],
  },
];

export const SEED_RECORDS: readonly LedgerRecord[] = RAW_BATCHES.flatMap((batch) =>
  batch.items.map(([testItem, spec, measurement]) => ({
    id: `${batch.batchNo}::${testItem}`,
    testDate: batch.testDate,
    productModel: batch.productModel,
    drawingNo: batch.drawingNo,
    batchNo: batch.batchNo,
    testItem,
    spec,
    values: measurement === 'manual-pass' ? [null, null, null] : measurement,
    manualJudgment: measurement === 'manual-pass' ? ('pass' as const) : null,
    tester: batch.tester,
    remark: '',
  })),
);

export const SEED_BATCH_NOS: readonly string[] = RAW_BATCHES.map((b) => b.batchNo);
