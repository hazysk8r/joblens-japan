package com.joblens.auth.exception;

public class EmailAlreadyExistsException extends RuntimeException {

    public EmailAlreadyExistsException() {
        super("このメールアドレスはすでに登録されています。");
    }
}
