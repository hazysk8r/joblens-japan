package com.joblens.auth.exception;

public class SignupClosedException extends RuntimeException {

    public SignupClosedException() {
        super("現在、新規登録を受け付けていません。");
    }
}
