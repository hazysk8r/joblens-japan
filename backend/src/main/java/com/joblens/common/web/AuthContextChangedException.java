package com.joblens.common.web;

public class AuthContextChangedException extends RuntimeException {

    public AuthContextChangedException() {
        super("別のタブでログインアカウントが変更されたため、リクエストを処理しませんでした。ページを再読み込みしてください。");
    }
}
