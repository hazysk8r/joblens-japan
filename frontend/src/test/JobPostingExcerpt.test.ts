import { describe, expect, test } from 'vitest';

import { excerptOf } from '../utils/jobPostingFormat';

describe('excerptOf', () => {
  test('上限以下の文はそのまま返し、省略記号を付けない', () => {
    expect(excerptOf('短い求人票', 100)).toBe('短い求人票');
  });

  test('ちょうど上限の長さなら省略しない', () => {
    const text = 'あ'.repeat(100);

    expect(excerptOf(text, 100)).toBe(text);
  });

  test('上限を超えたら上限までにして省略記号を付ける', () => {
    expect(excerptOf('あ'.repeat(101), 100)).toBe(`${'あ'.repeat(100)}…`);
  });

  test('改行や続く空白は1つの空白にまとめ、前後の空白は除く', () => {
    expect(excerptOf('  【給与】\n\n月給30万円\t\t（固定残業代なし）\r\n ', 100))
      .toBe('【給与】 月給30万円 （固定残業代なし）');
  });

  test('空白をまとめた後の長さで上限を判定する', () => {
    expect(excerptOf(`${'あ'.repeat(50)}\n\n\n${'い'.repeat(49)}`, 100))
      .toBe(`${'あ'.repeat(50)} ${'い'.repeat(49)}`);
  });

  // UTF-16の単位で切ると、サロゲートペアの片方だけが残って文字化けする。
  test('サロゲートペアの文字を途中で切らない', () => {
    const text = '𠮷'.repeat(101);

    const excerpt = excerptOf(text, 100);

    expect(excerpt).toBe(`${'𠮷'.repeat(100)}…`);
    expect(excerpt).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  test('絵文字を含む文も文字単位で数える', () => {
    expect(excerptOf('😀'.repeat(3), 2)).toBe('😀😀…');
  });
});
