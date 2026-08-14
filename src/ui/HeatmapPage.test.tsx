// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryAdapter } from '../adapters/memory-adapter';
import { DataPortProvider } from './data-port-context';
import { HeatmapPage } from './HeatmapPage';

// jsdom 没有布局，scrollIntoView 是空实现
Element.prototype.scrollIntoView = () => {};

afterEach(cleanup);

function renderPage() {
  return render(
    <DataPortProvider port={new MemoryAdapter()}>
      <HeatmapPage />
    </DataPortProvider>,
  );
}

describe('HeatmapPage 点格下钻', () => {
  it('点开 RV-0.5 × 导体电阻：只标红越界那一次测量，并显示系统读到的规则', async () => {
    renderPage();
    expect(await screen.findByText('质量矩阵')).toBeTruthy();

    // 同页展开，不跳页
    fireEvent.click(screen.getByTitle(/导体电阻 .*RV-0\.5/));

    // 明细展开，出现对应批次
    expect(await screen.findByText('RV-20260602')).toBeTruthy();
    // 规则显式（系统把「≤0.5Ω」读成了什么，必须能看见）
    expect(screen.getByText(/上限 0\.5Ω（值需 ≤ 0\.5）/)).toBeTruthy();

    // 三次测量里只有 0.52 越界（>0.5Ω）→ 仅它标红；0.48 / 0.49 不标红
    const bad = screen.getByText('0.52');
    expect(bad.className).toContain('text-fail');
    expect(bad.className).toContain('font-semibold');

    const ok1 = screen.getByText('0.48');
    expect(ok1.className).not.toContain('text-fail');

    const ok2 = screen.getByText('0.49');
    expect(ok2.className).not.toContain('text-fail');
  });

  it('点开 BV-2.5 × 老化测试：三次全坏时三次测量全部标红', async () => {
    renderPage();
    expect(await screen.findByText('质量矩阵')).toBeTruthy();

    fireEvent.click(screen.getByTitle(/老化测试 .*BV-2\.5/));

    expect(await screen.findByText('BV-20260601')).toBeTruthy();
    for (const v of ['72', '68', '75']) {
      const cell = screen.getByText(v);
      expect(cell.className).toContain('text-fail');
    }
  });
});
