import { describe, expect, it } from 'vitest';
import { parseTableClipboard } from './paste';

describe('parseTableClipboard', () => {
  it('空字符串返回空矩阵', () => {
    expect(parseTableClipboard('')).toEqual([]);
  });

  it('单个值解析成一行一列', () => {
    expect(parseTableClipboard('1.5')).toEqual([['1.5']]);
  });

  it('多行多列按制表符与换行拆开', () => {
    expect(parseTableClipboard('1\t2\t3\n4\t5\t6')).toEqual([
      ['1', '2', '3'],
      ['4', '5', '6'],
    ]);
  });

  it('兼容 Windows CRLF', () => {
    expect(parseTableClipboard('1\t2\r\n3\t4')).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('丢弃末尾的空行（Excel 复制常带的 trailing newline）', () => {
    expect(parseTableClipboard('1\t2\n\n')).toEqual([['1', '2']]);
  });

  it('单列多行也能解析', () => {
    expect(parseTableClipboard('a\nb\nc')).toEqual([['a'], ['b'], ['c']]);
  });

  it('单元格两端空白被 trim', () => {
    expect(parseTableClipboard(' 1.2 \t 3.4 ')).toEqual([['1.2', '3.4']]);
  });

  it('只含空白的单元格变成空串，但不影响同行其他列', () => {
    expect(parseTableClipboard('1\t\t3')).toEqual([['1', '', '3']]);
  });

  it('整行都为空的行被丢弃（即便夹在中间）', () => {
    expect(parseTableClipboard('1\t2\n\n\t\n3\t4')).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });
});
