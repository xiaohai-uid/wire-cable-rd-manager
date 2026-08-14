// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import type { DataPort } from '../ports/data-port';
import { MemoryAdapter } from '../adapters/memory-adapter';
import { DataPortProvider } from './data-port-context';
import { BatchEntryPage } from './BatchEntryPage';

Element.prototype.scrollIntoView = () => {};

afterEach(cleanup);

function setUrl(search: string) {
  window.history.pushState({}, '', search);
}

function renderPage(adapter: DataPort) {
  return render(
    <DataPortProvider port={adapter}>
      <BatchEntryPage />
    </DataPortProvider>,
  );
}

/** 某测试项那一行的三个测量值输入框（备注框排在后面，只取前三个） */
function valueInputs(rowLabel: string): HTMLInputElement[] {
  const row = screen.getByText(rowLabel).closest('tr')!;
  return within(row).getAllByRole('textbox').slice(0, 3) as HTMLInputElement[];
}

describe('BatchEntryPage', () => {
  it('没有产品时先让选产品，选完才铺出录入行', async () => {
    setUrl('?page=batch');
    renderPage(new MemoryAdapter());

    expect(await screen.findByText(/先选一个产品/)).toBeTruthy();
    fireEvent.click(screen.getByText(/RV 0\.5mm2 多股软电线/));

    expect(await screen.findByText('导体电阻')).toBeTruthy();
  });

  it('录入已有批次时，网格带出原有数据（编辑模式）', async () => {
    setUrl('?page=batch&product=RV-0.5&batch=RV-20260601');
    renderPage(new MemoryAdapter());

    // 该批次导体电阻第一次测量是 0.42
    expect(await screen.findByDisplayValue('0.42')).toBeTruthy();
    // 全部合格 → 摘要里「合格 10」
    expect(await screen.findByText(/合格 10/)).toBeTruthy();
  });

  it('定性项只出合格/不合格按钮，不出三次测量输入框', async () => {
    setUrl('?page=batch&product=RV-0.5&batch=RV-20260601');
    renderPage(new MemoryAdapter());

    const rowEl = await screen.findByText('外观检查').then((el) => el.closest('tr')!);
    // 只有备注框 1 个 textbox，没有测量值输入框（三次测量被定性按钮取代）
    expect(within(rowEl).getAllByRole('textbox').length).toBe(1);
    expect(within(rowEl).getByRole('button', { name: '合格' })).toBeTruthy();
    expect(within(rowEl).getByRole('button', { name: '不合格' })).toBeTruthy();
  });

  it('改一个测量值当场刷新判定，且 0 被当合法值保存（不是当成空）', async () => {
    setUrl('?page=batch&product=RV-0.5&batch=RV-20260601');
    renderPage(new MemoryAdapter());
    const inputs = await waitFor(() => valueInputs('导体电阻'));
    const v1 = inputs[0]!;

    // 把第一次测量改成 0.6（>0.5 上限）→ 该行判定变不合格
    fireEvent.change(v1, { target: { value: '0.6' } });
    const rowEl = screen.getByText('导体电阻').closest('tr')!;
    expect(within(rowEl).getByText('不合格')).toBeTruthy();

    // 再改成 0 —— 必须是合法值，不能变成「未判定」
    fireEvent.change(v1, { target: { value: '0' } });
    expect(screen.getByDisplayValue('0')).toBeTruthy();
    expect(within(rowEl).queryByText('未判定')).toBeNull();
  });

  it('整批保存走 DataPort.saveBatch，落库后可查到', async () => {
    setUrl('?page=batch&product=RV-0.5&batch=SAVE-ME');
    const adapter = new MemoryAdapter();
    const spy = vi.spyOn(adapter, 'saveBatch');
    renderPage(adapter);

    const inputs = await waitFor(() => valueInputs('导体电阻'));
    const v1 = inputs[0]!;
    const v2 = inputs[1]!;
    const v3 = inputs[2]!;
    fireEvent.change(v1, { target: { value: '0.42' } });
    fireEvent.change(v2, { target: { value: '0.44' } });
    fireEvent.change(v3, { target: { value: '0.43' } });

    fireEvent.click(screen.getByText('整批保存'));

    expect(await screen.findByText('已保存')).toBeTruthy();
    expect(spy).toHaveBeenCalledTimes(1);
    const draft = spy.mock.calls[0]![0]!;
    expect(draft.productModel).toBe('RV-0.5');
    expect(draft.batchNo).toBe('SAVE-ME');
    expect(draft.entries.length).toBe(10); // RV-0.5 有 10 个测试项
    const conductor = draft.entries.find((e) => e.testItem === '导体电阻')!;
    expect(conductor.values).toEqual([0.42, 0.44, 0.43]);

    const stored = await adapter.listRecords({ batchNo: 'SAVE-ME' });
    expect(stored.length).toBe(10);
  });
});
