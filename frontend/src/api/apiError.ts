export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly fieldErrors: Record<string, string>;

  constructor(
    message: string,
    status: number,
    code?: string,
    fieldErrors: Record<string, string> = {},
  ) {
    super(message);

    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

// 未知の値が配列やnullではないオブジェクトかを判定する。
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// HTTPエラーの本文だけを解析し、成功応答や通信エラーには介入しない。
export async function parseApiError(
  response: Response,
  fallbackMessage: string,
): Promise<ApiError> {
  let body: unknown;

  try {
    body = await response.json();
  } catch (error) {
    // キャンセルは既存の呼び出し元が判定できるよう、そのまま伝える。
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    body = null;
  }

  if (!isRecord(body)) {
    return new ApiError(fallbackMessage, response.status);
  }

  // 不正な値を除外し、有効な文字列のエラーメッセージだけを保持する。
  const fieldErrors: Record<string, string> = isRecord(body.fieldErrors)
    ? Object.fromEntries(
        Object.entries(body.fieldErrors).filter(
          (entry): entry is [string, string] => isNonBlankString(entry[1]),
        ),
      )
    : {};

  return new ApiError(
    isNonBlankString(body.message) ? body.message : fallbackMessage,
    response.status,
    isNonBlankString(body.code) ? body.code : undefined,
    fieldErrors,
  );
}

/**
 * 画面に表示するエラーメッセージを選ぶ。
 *
 * 入力欄が1つのフォームでは、全体の「입력값이 올바르지 않습니다.」より
 * その項目の検証メッセージの方が具体的なため、項目のメッセージを優先する。
 */
export function errorMessageOf(
  error: unknown,
  field: string,
  fallbackMessage: string,
): string {
  if (error instanceof ApiError && error.fieldErrors[field]) {
    return error.fieldErrors[field];
  }
  return error instanceof Error ? error.message : fallbackMessage;
}

export const isJobPostingVersionConflict = (
  error: unknown,
): boolean => {
  return (
    error instanceof ApiError &&
    error.status === 412 &&
    error.code ===
      'JOB_POSTING_VERSION_CONFLICT'
  );
};
