// サーバーの検証(@Size(max = 20000))と同じ上限と文言。
export const ORIGINAL_TEXT_MAX_LENGTH = 20000;
export const ORIGINAL_TEXT_TOO_LONG_MESSAGE = '求人原文は20000文字以内で入力してください。';

/**
 * 送る値と同じく前後の空白を除いた原文の長さ。
 * 文字数はサーバーと同じUTF-16の単位で数える(絵文字などは2文字になるが、サーバーの数え方と一致させる)。
 */
export function originalTextLengthOf(text: string): number {
  return text.trim().length;
}

export function isOriginalTextTooLong(text: string): boolean {
  return originalTextLengthOf(text) > ORIGINAL_TEXT_MAX_LENGTH;
}
