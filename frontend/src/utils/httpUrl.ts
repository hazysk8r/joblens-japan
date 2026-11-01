/**
 * リンクとして開いてよいURL(http・https)かを判定する。
 *
 * サーバーの入力検証を導入する前に保存された値がDBに残っている可能性があるため、表示の前にも確かめる。
 * ブラウザと同じ方法で解釈し、「 javascript:」や「java\tscript:」のような表記の違いも判定できるようにする。
 */
export function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}
