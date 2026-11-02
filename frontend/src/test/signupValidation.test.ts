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
  test.each(['', '   '])('空なら(%j)エラー', (email) => {
    expect(errorsOf({ email })).toHaveProperty('email');
  });

  test('前後の空白を除いた長さが254文字なら通り、255文字ならエラー', () => {
    const local = 'a'.repeat(64);
    const domainOf = (length: number) => `${'b'.repeat(length - 4)}.com`;
    const email254 = `${local}@${domainOf(254 - 65)}`;
    const email255 = `${local}@${domainOf(255 - 65)}`;

    expect(email254).toHaveLength(254);
    expect(errorsOf({ email: `  ${email254}  ` })).not.toHaveProperty('email');
    expect(errorsOf({ email: email255 })).toHaveProperty('email');
  });

  test('形式は検査しない(サーバーが判定)', () => {
    expect(errorsOf({ email: 'not-an-email' })).not.toHaveProperty('email');
  });
});

describe('パスワード', () => {
  test.each([7, 65])('%i文字ならエラー', (length) => {
    expect(errorsOf({ password: 'a'.repeat(length) })).toHaveProperty('password');
  });

  test.each([8, 64])('%i文字なら通る', (length) => {
    expect(errorsOf({ password: 'a'.repeat(length) })).toEqual({});
  });

  test('空白だけのパスワードは8文字以上でもエラー(サーバーの@NotBlank)', () => {
    expect(errorsOf({ password: ' '.repeat(10) })).toHaveProperty('password');
  });

  test('空白を含むパスワードはそのまま許可する', () => {
    expect(errorsOf({ password: ' pass word ' })).toEqual({});
  });

  test('日本語24文字(72バイト)は通り、25文字(75バイト)は64文字以下でもエラー', () => {
    expect(errorsOf({ password: 'あ'.repeat(24) })).toEqual({});
    expect(errorsOf({ password: 'あ'.repeat(25) })).toHaveProperty('password');
  });

  test('文字数はサーバー(Java)と同じくUTF-16単位で数える', () => {
    // 絵文字は1文字でもUTF-16では2単位、UTF-8では4バイト。
    // 4文字は8単位なので最小の長さを満たし、16バイトでバイト数の上限内。
    expect(errorsOf({ password: '😀'.repeat(4) })).toEqual({});
    expect(errorsOf({ password: '😀'.repeat(3) })).toHaveProperty('password');
  });
});

describe('パスワード(確認)', () => {
  test('パスワードと違えばエラー', () => {
    expect(errorsOf({ passwordConfirmation: 'password124' })).toHaveProperty('passwordConfirmation');
  });

  test('すべて正しければエラーはない', () => {
    expect(validateSignup(valid)).toEqual({});
  });
});
