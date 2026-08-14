/**
 * 把 Excel / 电子表格复制出来的剪贴板文本解析成二维字符串矩阵。
 *
 * 这是批次录入网格「从 Excel 粘贴一整块」的那一步。它只负责**拆字符串** ——
 * 不把文本转成数字、不决定填到哪一行，那些是网格的责任。纯函数、零 I/O、可单测。
 *
 * 约定：
 * - 列用 `\t` 分隔（Excel 复制就是制表符）
 * - 行用 `\r\n` / `\r` / `\n` 分隔
 * - 每个单元格两端空白会被 trim（避免 ` 1.2 ` 被当字符串而非数字）
 * - **整行都为空**的行直接丢弃 —— Excel 复制末尾常带一个空行，
 *   留着它只会把数据往下顶一行，纯属噪音
 */
export function parseTableClipboard(text: string): readonly (readonly string[])[] {
  if (text.length === 0) return [];

  return text
    .split(/\r\n|\r|\n/)
    .map((line) => line.split('\t').map((cell) => cell.trim()))
    .filter((row) => row.some((cell) => cell.length > 0));
}
