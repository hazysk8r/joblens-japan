package com.joblens;

import java.util.Arrays;
import java.util.UUID;

import org.springframework.test.web.servlet.request.RequestPostProcessor;

import jakarta.servlet.http.Cookie;

/**
 * ブラウザと同じ方法でCSRFトークンを送るテスト補助。
 *
 * spring-security-testのcsrf()は、CSRFフィルターのトークン保存先をテスト用(セッション方式)に
 * 差し替え、その変更が同じSpringコンテキストの後続テストにも残る。
 * 実際のCookie方式の設定を検証するテストでは、csrf()ではなくこちらを使うこと。
 */
public final class CsrfTestSupport {

    public static final String CSRF_COOKIE = "XSRF-TOKEN";
    public static final String CSRF_HEADER = "X-XSRF-TOKEN";

    private CsrfTestSupport() {
    }

    // 同じトークンをCookieとヘッダーの両方に設定する(Double Submit Cookie)。
    public static RequestPostProcessor doubleSubmitCsrf() {
        return request -> {
            String token = UUID.randomUUID().toString();
            Cookie[] existing = request.getCookies() == null ? new Cookie[0] : request.getCookies();
            Cookie[] cookies = Arrays.copyOf(existing, existing.length + 1);
            cookies[existing.length] = new Cookie(CSRF_COOKIE, token);
            request.setCookies(cookies);
            request.addHeader(CSRF_HEADER, token);
            return request;
        };
    }
}
