package com.joblens.auth.exception;

/**
 * セッションは有効だが、そのユーザーがすでに削除されている場合に発生させる例外。
 */
public class UserNoLongerExistsException extends RuntimeException {

    public UserNoLongerExistsException() {
        super("ログインが必要です。");
    }
}
