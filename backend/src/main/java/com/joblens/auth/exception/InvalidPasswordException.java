package com.joblens.auth.exception;

/**
 * ログイン中のユーザーが、本人確認のために入力したパスワードが違う場合に発生させる例外。
 */
public class InvalidPasswordException extends RuntimeException {

    public InvalidPasswordException() {
        super("パスワードが正しくありません。");
    }
}
