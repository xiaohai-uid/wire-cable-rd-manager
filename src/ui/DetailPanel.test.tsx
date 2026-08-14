// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { DataPort } from '../ports/data-port';
import type { LedgerRecord } from '../domain/types';
import { DataPortProvider } from './data-port-context';
import { DetailPanel } from './DetailPanel';

Element.prototype.scrollIntoView = () => {};

afterEach(cleanup);

function renderWith(records: readonly LedgerRecord[], configured: boolean) {
  // 测试替身：只实现 DetailPanel 用到的 listRecords。
  // 这是测试装置，不是生产里的 DataPort 缝（ADR 0002 说的是生产里不为 UI 留 Mock 适配器）。
  const stub = {
    mode: 'demo',
    listRecords: async () => records,
  } as unknown as DataPort;

  return render(
    <DataPortProvider port={stub}>
      <DetailPanel
        productModel="P1"
        testItem="X"
        configured={configured}
        onClose={() => {}}
        onOpenBatch={() => {}}
      />
    </DataPortProvider>,
  );
}

function record(spec: string, values: readonly (number | null)[]): LedgerRecord {
  return {
    id: 'B1::X',
    testDate: '2026-06-01',
    productModel: 'P1',
    drawingNo: 'D1',
    batchNo: 'B1',
    testItem: 'X',
    spec,
    values,
    manualJudgment: null,
    tester: 'T',
    remark: '',
  };
}

describe('DetailPanel', () => {
  it('把系统读到的判定规则显式摆出来（规则显式自检）', async () => {
    renderWith([record('≥80%', [72, 68, 75])], true);
    expect(await screen.findByText(/下限 80%（值需 ≥ 80）/)).toBeTruthy();
  });

  it('规格无法识别时拒绝自动判定，并把这件事说出口', async () => {
    renderWith([record('见附件', [1, 2, 3])], true);
    expect(await screen.findByText(/规格无法识别 · 拒绝自动判定/)).toBeTruthy();
  });

  it('未配置此测试项时明确提示，而非假装没问题', async () => {
    renderWith([], false);
    expect(await screen.findByText('未配置此测试项')).toBeTruthy();
  });

  it('已配置但无记录时说明是漏测，而非合格', async () => {
    renderWith([], true);
    expect(await screen.findByText('已配置这一项，但还没有测试记录')).toBeTruthy();
  });
});
