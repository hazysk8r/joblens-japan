package com.joblens.jobposting.exception;

/**
 * リクエストされたIDの求人が存在しないときに発生させる例外。
 *
 * IllegalArgumentExceptionのような汎用の例外ではなく専用の例外を使うと、
 * グローバル例外ハンドラーでこのエラーを正確に404応答へ変換できる。
 */
public class JobPostingNotFoundException extends RuntimeException {

    public JobPostingNotFoundException(Long id) {
        super("求人が見つかりません。id=" + id);
    }
}