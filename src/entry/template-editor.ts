import { parseSpec } from '../domain/spec';
import type { TemplateDraft } from '../ports/data-port';

/**
 * 测试模板编辑态的纯逻辑。
 *
 * 编辑态刻意不依赖 `sortOrder` 这个后端序号 —— 顺序由数组本身的位置表达，
 * 保存时按数组下标重排 `sortOrder`。否则上移/下移/插入都要手动算一串序号，很容易错，
 * 而错一个排序整个网格的铺行顺序就乱了。
 *
 * 这里不放任何 React / I/O 代码，方便直接单测，也方便 HttpAdapter 与 MemoryAdapter
 * 之外的任何场景复用同一套「能不能保存」的判断。
 */

/** 编辑行。`id` 仅作 React key 与稳定身份用，不参与任何持久化。 */
export interface TemplateRow {
  readonly id: string;
  readonly testItem: string;
  readonly spec: string;
}

function uid(): string {
  const c = globalThis as { crypto?: { randomUUID?: () => string } };
  if (c.crypto?.randomUUID) return c.crypto.randomUUID();
  return `r${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/** 一张全新的空行。测试项与规格都为空，等用户填。 */
export function newRow(): TemplateRow {
  return { id: uid(), testItem: '', spec: '' };
}

/** 把端口返回的模板项折成编辑行，丢掉后端序号（顺序由数组位置表达）。 */
export function toRows(
  items: readonly { readonly testItem: string; readonly spec: string }[],
): TemplateRow[] {
  return items.map((it) => ({ id: uid(), testItem: it.testItem, spec: it.spec }));
}

/** 上移 / 下移第 index 行；已在顶 / 底时原样返回。 */
export function moveRow(
  rows: readonly TemplateRow[],
  index: number,
  direction: 'up' | 'down',
): TemplateRow[] {
  if (direction === 'up' && index <= 0) return [...rows];
  if (direction === 'down' && index >= rows.length - 1) return [...rows];
  const target = direction === 'up' ? index - 1 : index + 1;
  const next = [...rows];
  const current = next[index];
  const swap = next[target];
  if (!current || !swap) return [...rows];
  next[index] = swap;
  next[target] = current;
  return next;
}

/**
 * 模板能不能保存的唯一裁判。
 *
 * 返回的错误信息逐条对应 1.0 版的坑：
 * - 测试项空名 → 网格会铺出一行没名字的测试项；
 * - 测试项重复 → `replaceTemplates` 会抛 invalid，但那是在点了保存之后才知道；
 *   这里在点保存之前就拦下，体验是「保存按钮直接灰掉」而不是「点完报错」；
 * - 规格空 / 规格无法识别 → 这是最关键的一条。空规格或解析不出的规格，
 *   保存进去会变成「系统静默用错阈值判合格/不合格」，比不配置更危险。
 *
 * 返回空数组表示可以保存。
 */
export function validateTemplates(rows: readonly TemplateRow[]): readonly string[] {
  const errors: string[] = [];
  const seen = new Set<string>();

  rows.forEach((row, i) => {
    const item = row.testItem.trim();
    const line = `第 ${i + 1} 行`;

    if (item.length === 0) {
      errors.push(`${line}：测试项名称不能为空`);
    } else if (seen.has(item)) {
      errors.push(`测试项「${item}」重复`);
    } else {
      seen.add(item);
    }

    const spec = row.spec.trim();
    if (spec.length === 0) {
      errors.push(`${line}${item ? `「${item}」` : ''}：规格不能为空`);
    } else {
      const rule = parseSpec(spec);
      if (rule.kind === 'unparseable') {
        errors.push(`${line}${item ? `「${item}」` : ''}：规格无法识别 —— ${rule.reason}`);
      }
    }
  });

  return errors;
}

/** 编辑行 → 端口草稿，按下标重排 sortOrder。 */
export function toDrafts(rows: readonly TemplateRow[]): readonly TemplateDraft[] {
  return rows.map((row, i) => ({
    testItem: row.testItem.trim(),
    spec: row.spec.trim(),
    sortOrder: i,
  }));
}
