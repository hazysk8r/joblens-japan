import { describe, expect, test } from 'vitest';

import { validateSignup } from '../utils/signupValidation';

/**
 * 会員登録の入力チェック。サーバー(SignupRequest)と同じ結果になる規則だけを確認する。
 * メールアドレスの形式はサーバーの判定に任せるため、ここでは検査しない。
 */

const valid = {
  email: 'user@example.com',
  password: 'password123',
  passwordConfirmation: 'password123',
};

function errorsOf(input: Partial<typeof valid>) {
  const merged = { ...valid, ...input };
  // 確認欄は、指定がなければパスワードと同じ値にする。
  if (input.password !== undefined && input.passwordConfirmation === undefined) {
    merged.passwordConfirmation = merged.password;
  }
  return validateSignup(merged);
}

describe('メールアドレス', () => {
  test.each(['', '   '])('비어 있으면(%j) 오류', (email) => {
    expect(errorsOf({ email })).toHaveProperty('email');
  });

  test('앞뒤 공백을 제거한 길이가 254자면 통과하고 255자면 오류', () => {
    const local = 'a'.repeat(64);
    const domainOf = (length: number) => `${'b'.repeat(length - 4)}.com`;
    const email254 = `${local}@${domainOf(254 - 65)}`;
    const email255 = `${local}@${domainOf(255 - 65)}`;

    expect(email254).toHaveLength(254);
    expect(errorsOf({ email: `  ${email254}  ` })).not.toHaveProperty('email');
    expect(errorsOf({ email: email255 })).toHaveProperty('email');
  });

  test('형식은 검사하지 않는다(서버가 판정)', () => {
    expect(errorsOf({ email: 'not-an-email' })).not.toHaveProperty('email');
  });
});

describe('パスワード', () => {
  test.each([7, 65])('%i자면 오류', (length) => {
    expect(errorsOf({ password: 'a'.repeat(length) })).toHaveProperty('password');
  });

  test.each([8, 64])('%i자면 통과', (length) => {
    expect(errorsOf({ password: 'a'.repeat(length) })).toEqual({});
  });

  test('공백만으로 된 비밀번호는 8자 이상이어도 오류(서버의 @NotBlank)', () => {
    expect(errorsOf({ password: ' '.repeat(10) })).toHaveProperty('password');
  });

  test('공백이 포함된 비밀번호는 그대로 허용한다', () => {
    expect(errorsOf({ password: ' pass word ' })).toEqual({});
  });

  test('한글 24자(72바이트)는 통과하고 25자(75바이트)는 64자 이하여도 오류', () => {
    expect(errorsOf({ password: '가'.repeat(24) })).toEqual({});
    expect(errorsOf({ password: '가'.repeat(25) })).toHaveProperty('password');
  });

  test('글자 수는 서버(Java)와 같이 UTF-16 단위로 센다', () => {
    // 絵文字は1文字でもUTF-16では2単位、UTF-8では4バイト。
    // 4文字は8単位なので最小の長さを満たし、16バイトでバイト数の上限内。
    expect(errorsOf({ password: '😀'.repeat(4) })).toEqual({});
    expect(errorsOf({ password: '😀'.repeat(3) })).toHaveProperty('password');
  });
});

describe('パスワード(確認)', () => {
  test('비밀번호와 다르면 오류', () => {
    expect(errorsOf({ passwordConfirmation: 'password124' })).toHaveProperty('passwordConfirmation');
  });

  test('모두 올바르면 오류가 없다', () => {
    expect(validateSignup(valid)).toEqual({});
  });
});
