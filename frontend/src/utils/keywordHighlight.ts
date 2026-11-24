/**
 * 一覧のカードの要約の中で、検索語を強調するための分割。
 *
 * サーバーと同じく、大文字と小文字を区別せずに探す。文字ごとに小文字にして比べるため、
 * 小文字にすると文字数が変わる文字があっても、位置がずれない。絵文字などは途中で切らないよう文字単位で数える。
 * 強調は見つけやすくするためだけのもので、見つからなければ強調せずに要約をそのまま出す。
 */

export type KeywordSegment = { text: string; match: boolean };

export function keywordSegments(text: string, keyword: string | undefined): KeywordSegment[] {
  const characters = Array.from(text);
  // サーバーと同じく、続く空白(全角空白を含む)を1つの空白にまとめてから探す。要約の空白もサーバーでまとめてある。
  const word = Array.from((keyword ?? '').replace(/\s+/g, ' ').trim()).map((character) => character.toLowerCase());
  if (word.length === 0) {
    return [{ text, match: false }];
  }
  const lowerCharacters = characters.map((character) => character.toLowerCase());

  const segments: KeywordSegment[] = [];
  let plainStart = 0;
  let index = 0;
  while (index + word.length <= characters.length) {
    const matches = word.every((character, offset) => lowerCharacters[index + offset] === character);
    if (!matches) {
      index += 1;
      continue;
    }
    if (plainStart < index) {
      segments.push({ text: characters.slice(plainStart, index).join(''), match: false });
    }
    segments.push({ text: characters.slice(index, index + word.length).join(''), match: true });
    // 重なる一致は強調しない。
    index += word.length;
    plainStart = index;
  }
  if (plainStart < characters.length) {
    segments.push({ text: characters.slice(plainStart).join(''), match: false });
  }
  return segments;
}
