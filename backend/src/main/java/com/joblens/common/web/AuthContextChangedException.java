package com.joblens.common.web;

public class AuthContextChangedException extends RuntimeException {

    public AuthContextChangedException() {
        super("다른 탭에서 로그인 계정이 바뀌어 요청을 처리하지 않았습니다. 페이지를 새로고침해주세요.");
    }
}
