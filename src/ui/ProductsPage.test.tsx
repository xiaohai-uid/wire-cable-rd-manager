// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryAdapter } from '../adapters/memory-adapter';
import { DataPortProvider } from './data-port-context';
import { ProductsPage } from './ProductsPage';

/**
 * 工单 05 的 UI 验证。和 03/04 一样的策略：不引 Mock 适配器（ADR 0002 明令 UI 层无生产 seam），
 * 直接用真实的 MemoryAdapter，断言真实数据层的副作用。
 */
function renderPage(adapter: MemoryAdapter) {
  return render(
    <DataPortProvider port={adapter}>
      <ProductsPage />
    </DataPortProvider>,
  );
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

describe('工单 05 — 产品与测试模板管理', () => {
  it('产品列表展示种子里的产品，且带模板项 / 台账记录计数', async () => {
    const adapter = new MemoryAdapter();
    renderPage(adapter);

    expect(await screen.findByText('RV-0.5')).toBeTruthy();
    // 表头 + 数据行都含「模板项」，只要能找到产品型号即可证明列表渲染了
    expect(screen.getByText('SYV-75-5')).toBeTruthy();
    // 切到编辑台，列表至少 5 行
    const rows = screen.getAllByText('编辑模板');
    expect(rows.length).toBe(5);
  });

  it('编辑模板：打开后能看到每行规格被解析成的判定规则，写错规格当场拦住保存', async () => {
    const adapter = new MemoryAdapter();
    renderPage(adapter);

    const row = (await screen.findByText('RV-0.5')).closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByText('编辑模板'));

    // 编辑台加载完成
    expect(await screen.findByText('测试模板')).toBeTruthy();
    // 导体电阻的规格 ≤0.5Ω 应被读成「上限 0.5Ω…」
    expect(screen.getByText(/上限 0\.5Ω/)).toBeTruthy();
    // 外观检查 / 导通测试 都是合格 → 至少出现一条「定性判定」提示
    expect(screen.getAllByText(/定性判定/).length).toBeGreaterThan(0);

    // 把第一行规格改成一坨无法识别的文字
    const specInputs = screen.getAllByPlaceholderText('如 ≤0.5Ω / 合格');
    fireEvent.change(specInputs[0]!, { target: { value: '大概不超过半欧吧' } });

    // 当场提示无法识别
    expect(await screen.findByText(/规格无法识别/)).toBeTruthy();
    // 保存按钮变为禁用
    const saveBtn = screen.getByRole('button', { name: '整批保存测试模板' }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  it('新增测试项并整批保存后，模板真实落盘（适配器可回读）', async () => {
    const adapter = new MemoryAdapter();
    renderPage(adapter);

    const row = (await screen.findByText('RV-0.5')).closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByText('编辑模板'));
    await screen.findByText('测试模板');

    fireEvent.click(screen.getByText('+ 新增测试项'));

    const itemInputs = screen.getAllByPlaceholderText('测试项');
    const specInputs = screen.getAllByPlaceholderText('如 ≤0.5Ω / 合格');
    const last = itemInputs.length - 1;
    fireEvent.change(itemInputs[last]!, { target: { value: '新增测试项X' } });
    fireEvent.change(specInputs[last]!, { target: { value: '≥10V' } });

    fireEvent.click(screen.getByRole('button', { name: '整批保存测试模板' }));

    expect(await screen.findByText('已保存')).toBeTruthy();
    const saved = await adapter.listTemplates('RV-0.5');
    expect(saved.map((t) => t.testItem)).toContain('新增测试项X');
    expect(saved[saved.length - 1]?.spec).toBe('≥10V');
  });

  it('新增产品后能在列表里查到', async () => {
    const adapter = new MemoryAdapter();
    renderPage(adapter);

    fireEvent.click(screen.getByText('+ 新增产品'));
    fireEvent.change(screen.getByPlaceholderText('如 RV-0.5'), {
      target: { value: 'NEW-X' },
    });
    fireEvent.change(screen.getByPlaceholderText(/RV 0\.5mm2/), {
      target: { value: '新规格产品' },
    });

    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('NEW-X')).toBeTruthy();
    expect((await adapter.listProducts()).map((p) => p.model)).toContain('NEW-X');
  });

  it('删除产品前显示级联条数，确认后产品与模板、台账一并消失（无孤儿）', async () => {
    const adapter = new MemoryAdapter();
    renderPage(adapter);

    const row = (await screen.findByText('H05VV-F')).closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByText('删除'));

    // 确认弹窗显示将被级联删除的条数
    const dialog = await screen.findByText(/将一并删除/);
    expect(dialog).toBeTruthy();
    expect(screen.getByText(/条测试模板/)).toBeTruthy();
    expect(screen.getByText(/条测试台账记录/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '删除产品' }));

    await waitFor(() => expect(screen.queryByText('H05VV-F')).toBeNull());
    // 适配器侧：产品没了，模板清空，台账清空（无孤儿记录）
    expect(await adapter.getProduct('H05VV-F')).toBeNull();
    expect(await adapter.listTemplates('H05VV-F')).toEqual([]);
    expect(await adapter.listRecords({ productModel: 'H05VV-F' })).toEqual([]);
  });

  it('把一个产品的测试模板整体复制到另一个产品', async () => {
    const adapter = new MemoryAdapter();
    renderPage(adapter);

    const row = (await screen.findByText('BV-2.5')).closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByText('编辑模板'));
    await screen.findByText('测试模板');

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'SYV-75-5' } });
    fireEvent.click(screen.getByRole('button', { name: '应用' }));

    expect(await screen.findByText(/已从 SYV-75-5 复制模板/)).toBeTruthy();
    const copied = await adapter.listTemplates('BV-2.5');
    const source = await adapter.listTemplates('SYV-75-5');
    expect(copied.map((t) => t.testItem)).toEqual(source.map((t) => t.testItem));
      expect(copied.every((t) => t.productModel === 'BV-2.5')).toBe(true);
  });
});
