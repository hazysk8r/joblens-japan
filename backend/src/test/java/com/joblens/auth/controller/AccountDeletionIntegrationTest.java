package com.joblens.auth.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

import com.joblens.TestcontainersConfiguration;

/**
 * セッションとCookieの削除を、実サーバーとHTTPクライアントで確かめる。
 *
 * MockMvcはCookieをブラウザのように保持・送信しないため、応答のSet-Cookieで
 * 実際にCookieが消えるか、別の端末のセッションも使えなくなるかをここで確認する。
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "SESSION_COOKIE_SECURE=false")
@Import(TestcontainersConfiguration.class)
class AccountDeletionIntegrationTest {

    private static final String EMAIL = "integration-delete@example.com";
    private static final String CREDENTIALS = "{\"email\":\"" + EMAIL + "\",\"password\":\"password123\"}";

    @Value("${local.server.port}")
    private int port;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    // 1つのCookieの保存先を、1つのブラウザ(端末)として扱う。
    private final class Browser {
        private final CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
        private final HttpClient client = HttpClient.newBuilder().cookieHandler(cookies).build();

        HttpResponse<String> send(String method, String path, String json) throws Exception {
            HttpRequest.Builder request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
            cookies.getCookieStore().getCookies().stream()
                    .filter(cookie -> cookie.getName().equals("XSRF-TOKEN"))
                    .findFirst()
                    .ifPresent(cookie -> request.header("X-XSRF-TOKEN", cookie.getValue()));
            if (json != null) {
                request.header("Content-Type", "application/json");
            }
            request.method(method, json == null
                    ? HttpRequest.BodyPublishers.noBody()
                    : HttpRequest.BodyPublishers.ofString(json, StandardCharsets.UTF_8));
            return client.send(request.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        }

        // CSRFトークンを受け取ってから、変更リクエストを送る。
        HttpResponse<String> post(String path, String json) throws Exception {
            if (cookies.getCookieStore().getCookies().stream().noneMatch(c -> c.getName().equals("XSRF-TOKEN"))) {
                send("GET", "/api/auth/me", null);
            }
            return send("POST", path, json);
        }

        int me() throws Exception {
            return send("GET", "/api/auth/me", null).statusCode();
        }
    }

    @BeforeEach
    void setUp() {
        jdbcTemplate.update("DELETE FROM spring_session");
        jdbcTemplate.update("DELETE FROM users");
    }

    private static void assertCookieCleared(HttpResponse<String> response, String name) {
        List<String> cookies = response.headers().allValues("Set-Cookie").stream()
                .filter(header -> header.startsWith(name + "="))
                .toList();
        assertTrue(!cookies.isEmpty(), name + "を削除するSet-Cookieがない: " + response.headers().allValues("Set-Cookie"));
        // SESSIONはMax-Age=0、XSRF-TOKENは過去のExpiresで削除される(どちらもブラウザはCookieを消す)。
        assertTrue(cookies.stream().allMatch(header -> header.startsWith(name + "=;")
                        && (header.contains("Max-Age=0") || header.contains("Expires=Thu, 01 Jan 1970"))),
                name + "が削除されていない: " + cookies);
    }

    @Test
    void 削除するとCookieを消し_別の端末のセッションも使えなくなる() throws Exception {
        Browser deleting = new Browser();
        Browser otherDevice = new Browser();
        assertEquals(201, deleting.post("/api/auth/signup", CREDENTIALS).statusCode());
        assertEquals(200, otherDevice.post("/api/auth/login", CREDENTIALS).statusCode());

        HttpResponse<String> response = deleting.post("/api/auth/account/delete", "{\"password\":\"password123\"}");

        assertEquals(204, response.statusCode(), response.body());
        assertCookieCleared(response, "SESSION");
        assertCookieCleared(response, "XSRF-TOKEN");
        assertEquals(401, deleting.me());
        assertEquals(401, otherDevice.me());
    }

    @Test
    void 削除済みのユーザーのセッションで登録すると_Cookieを消して401を返し_以後もログインしていない() throws Exception {
        Browser browser = new Browser();
        assertEquals(201, browser.post("/api/auth/signup", CREDENTIALS).statusCode());
        // 削除と同時に進んでいたログインなどで、セッションだけが残った状態を作る。
        jdbcTemplate.update("DELETE FROM users WHERE email = ?", EMAIL);

        HttpResponse<String> response = browser.post("/api/job-postings", "{\"title\":\"t\",\"originalText\":\"o\"}");

        assertEquals(401, response.statusCode(), response.body());
        assertCookieCleared(response, "SESSION");
        assertEquals(401, browser.me());
    }
}
