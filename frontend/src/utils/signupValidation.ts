/**
 * 会員登録の入力チェック。
 *
 * サーバー(SignupRequest)と同じ結果になる規則だけを確認し、送信前に分かる誤りを知らせる。
 * 判定がずれると「画面では通るのにサーバーで拒否される」ため、
 * 正確に再現できないメールアドレスの形式はサーバーに任せる。
 */

export interface SignupInput {
  email: string;
  password: string;
  passwordConfirmation: string;
}

export type SignupFieldErrors = Partial<Record<keyof SignupInput, string>>;

const MAX_EMAIL_LENGTH = 254;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 64;
// BCryptが扱えるバイト数。
const MAX_PASSWORD_BYTES = 72;

const encoder = new TextEncoder();

export function validateSignup(input: SignupInput): SignupFieldErrors {
  const errors: SignupFieldErrors = {};

  // サーバーは前後の空白を除いてから検証する。
  const email = input.email.trim();
  if (email === '') {
    errors.email = 'メールアドレスを入力してください。';
  } else if (email.length > MAX_EMAIL_LENGTH) {
    errors.email = `メールアドレスは${MAX_EMAIL_LENGTH}文字以内で入力してください。`;
  }

  // 空白だけのパスワードはサーバー(@NotBlank)が拒否する。送る値自体は空白を除かない。
  // 文字数はJavaと同じUTF-16の単位(string.length)で数える。
  const { password } = input;
  if (password.trim() === '') {
    errors.password = 'パスワードを入力してください。';
  } else if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    errors.password = `パスワードは${MIN_PASSWORD_LENGTH}文字以上${MAX_PASSWORD_LENGTH}文字以内で入力してください。`;
  } else if (encoder.encode(password).length > MAX_PASSWORD_BYTES) {
    errors.password = 'パスワードが長すぎます。日本語などは1文字を3バイトとして数え、72バイトまで入力できます。';
  }

  if (input.passwordConfirmation !== password) {
    errors.passwordConfirmation = '確認用のパスワードが一致しません。';
  }

  return errors;
}
