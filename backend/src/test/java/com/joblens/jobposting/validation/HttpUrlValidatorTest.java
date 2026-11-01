package com.joblens.jobposting.validation;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class HttpUrlValidatorTest {

    private final HttpUrlValidator validator = new HttpUrlValidator();

    @Test
    void null은_선택_입력이므로_허용한다() {
        assertTrue(validator.isValid(null, null));
    }

    // java.net.URIが拒否する、またはhostをnullにする値も、ブラウザで開けるため受け付ける。
    @ParameterizedTest
    @ValueSource(strings = {
            "http://example.com",
            "https://example.com/jobs/1",
            "HTTPS://EXAMPLE.COM",
            "hTtP://example.com",
            "https://example.jp/求人/123",
            "https://日本語.jp/jobs",
            "https://example.com/search?q=a|b",
            "https://example.com/?a[]=1",
            "https://my_company.example.com/x",
            "https://example.com:8443/x#top",
    })
    void 브라우저에서_열리는_http와_https_URL은_허용한다(String url) {
        assertTrue(validator.isValid(url, null));
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "javascript:alert(1)",
            "JaVaScRiPt:alert(1)",
            "data:text/html,<script>alert(1)</script>",
            "file:///etc/passwd",
            "ftp://example.com/x",
            "mailto:user@example.com",
            "httpx://example.com",
            "https:example.com",
    })
    void http와_https가_아닌_스킴은_거절한다(String url) {
        assertFalse(validator.isValid(url, null));
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "",
            "   ",
            "www.example.com",
            "//example.com",
            "/jobs",
            "https://",
            "http://",
            "https:///x",
            "https://?q=1",
            "https://#top",
            "http:\\\\example.com",
            "https://\\example.com",
    })
    void 호스트를_확인할_수_없는_값은_거절한다(String url) {
        assertFalse(validator.isValid(url, null));
    }

    // ブラウザはタブ・改行を取り除いてからURLを解釈するため、「java\tscript:」も実行され得る。
    @ParameterizedTest
    @ValueSource(strings = {
            " https://example.com",
            " javascript:alert(1)",
            "java\tscript:alert(1)",
            "https://example.com\n",
            "https://exam\tple.com",
            "https://example.com/a b",
            "https://example.com/　",
            "https://example.com/ ",
            "https://example.com/\u0000",
            "https://example.com/\u007F",
    })
    void 공백과_제어_문자가_있으면_거절한다(String url) {
        assertFalse(validator.isValid(url, null));
    }

    @Test
    void 아주_긴_값도_마지막_문자까지_확인한다() {
        assertFalse(validator.isValid("https://example.com/" + "a".repeat(1024 * 1024) + "\n", null));
    }
}
