package com.joblens.jobposting.validation;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class HttpUrlValidatorTest {

    private final HttpUrlValidator validator = new HttpUrlValidator();

    @Test
    void nullは任意入力のため許可する() {
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
    void ブラウザーで開けるhttpとhttpsのURLは許可する(String url) {
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
    void httpとhttps以外のスキームは拒否する(String url) {
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
    void ホストを確認できない値は拒否する(String url) {
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
    void 空白と制御文字があれば拒否する(String url) {
        assertFalse(validator.isValid(url, null));
    }

    // 正規表現に書き換えると、値の長さの2乗の時間がかかるおそれがある。止まったままにせず、失敗させる。
    @Test
    void とても長い値も最後の文字まですぐ確認する() {
        String longValue = "https://example.com/" + "a".repeat(1024 * 1024) + "\n";

        assertFalse(assertTimeoutPreemptively(
                Duration.ofSeconds(5),
                () -> validator.isValid(longValue, null)));
    }
}
