package com.joblens.common.error;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.joblens.TestcontainersConfiguration;
import com.joblens.auth.domain.User;
import com.joblens.auth.repository.UserRepository;
import com.joblens.jobposting.domain.JobPosting;
import com.joblens.jobposting.repository.JobPostingRepository;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * エラー応答を実サーバーで確かめる。
 *
 * MockMvcはTomcatの/errorへの転送を行わず、例外をそのままテストへ投げるため、
 * 未処理の例外や405・404の応答形式を確かめることができない。
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "SESSION_COOKIE_SECURE=false")
@Import({TestcontainersConfiguration.class, ErrorResponseIntegrationTest.FailingController.class})
@ExtendWith(OutputCaptureExtension.class)
class ErrorResponseIntegrationTest {

    private static final String SECRET = "secret-internal-detail";
    private static final String SERVER_ERROR_MESSAGE = "サーバーで問題が発生しました。しばらくしてから再度お試しください。";
    private static final String CLIENT_ERROR_MESSAGE = "リクエストを処理できませんでした。";
    private static final Set<String> ERROR_FIELDS =
            Set.of("timestamp", "status", "code", "message", "path", "fieldErrors");

    /** 実際のDBエラーを起こすための、テスト専用のController。 */
    @RestController
    static class FailingController {

        private final JobPostingRepository jobPostingRepository;
        private final UserRepository userRepository;

        FailingController(JobPostingRepository jobPostingRepository, UserRepository userRepository) {
            this.jobPostingRepository = jobPostingRepository;
            this.userRepository = userRepository;
        }

        @GetMapping("/api/test-errors/runtime")
        void runtime() {
            throw new IllegalStateException(SECRET);
        }

        @GetMapping("/api/test-errors/foreign-key")
        void foreignKey() {
            jobPostingRepository.saveAndFlush(
                    new JobPosting(Long.MAX_VALUE, null, "t", null, "o", null, null, null));
        }

        @GetMapping("/api/test-errors/unique")
        void unique(@RequestParam String email) {
            userRepository.saveAndFlush(new User(email, "hash"));
        }

        @GetMapping("/api/test-errors/check")
        void check(@RequestParam Long userId) {
            jobPostingRepository.saveAndFlush(
                    new JobPosting(userId, null, "t", null, "o", -1, null, null));
        }
    }

    @Value("${local.server.port}")
    private int port;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JobPostingRepository jobPostingRepository;

    private final CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
    private final HttpClient client = HttpClient.newBuilder().cookieHandler(cookies).build();

    private long userId;

    @BeforeEach
    void setUp() throws Exception {
        jdbcTemplate.update("DELETE FROM spring_session");
        jdbcTemplate.update("DELETE FROM users");

        send("GET", "/api/auth/me", null, null);
        HttpResponse<String> signup = sendJson("POST", "/api/auth/signup",
                "{\"email\":\"user@example.com\",\"password\":\"password123\"}");
        assertEquals(201, signup.statusCode());
        userId = objectMapper.readTree(signup.body()).get("id").asLong();
    }

    private HttpResponse<String> send(String method, String path, String contentType, String body) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
        cookies.getCookieStore().getCookies().stream()
                .filter(cookie -> cookie.getName().equals("XSRF-TOKEN"))
                .findFirst()
                .ifPresent(cookie -> request.header("X-XSRF-TOKEN", cookie.getValue()));
        if (contentType != null) {
            request.header("Content-Type", contentType);
        }
        request.method(method, body == null
                ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8));
        return client.send(request.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
    }

    private HttpResponse<String> sendJson(String method, String path, String body) throws Exception {
        return send(method, path, "application/json", body);
    }

    private JsonNode assertErrorFormat(HttpResponse<String> response, int status, String code, String path) {
        assertEquals(status, response.statusCode(), response.body());
        assertTrue(response.headers().firstValue("Content-Type").orElse("").startsWith("application/json"));
        assertFalse(response.body().contains(SECRET), response.body());

        JsonNode body = objectMapper.readTree(response.body());
        assertEquals(ERROR_FIELDS, Set.copyOf(body.propertyNames()), response.body());
        assertEquals(status, body.get("status").asInt());
        assertEquals(code, body.get("code").asString());
        assertEquals(path, body.get("path").asString());
        assertTrue(body.get("fieldErrors").isEmpty());
        return body;
    }

    private long postingCount() {
        return jobPostingRepository.count();
    }

    // ---- Springが処理する例外 ----

    @Test
    void 存在しないパスは_404を共通形式で返す() throws Exception {
        JsonNode body = assertErrorFormat(send("GET", "/api/unknown", null, null), 404, "NOT_FOUND", "/api/unknown");
        assertEquals(CLIENT_ERROR_MESSAGE, body.get("message").asString());
    }

    @Test
    void 対応していないメソッドは_405とAllowヘッダーを返す() throws Exception {
        HttpResponse<String> response = send("DELETE", "/api/auth/me", null, null);

        assertErrorFormat(response, 405, "METHOD_NOT_ALLOWED", "/api/auth/me");
        assertEquals("GET", response.headers().firstValue("Allow").orElse(""));
    }

    @Test
    void 対応していないContent_Typeは_415を共通形式で返す() throws Exception {
        assertErrorFormat(send("POST", "/api/job-postings", "text/plain", "hello"),
                415, "UNSUPPORTED_MEDIA_TYPE", "/api/job-postings");
    }

    // ---- 未処理の例外 ----

    @Test
    void 処理されない例外は内部情報なしで_500を返す() throws Exception {
        JsonNode body = assertErrorFormat(send("GET", "/api/test-errors/runtime", null, null),
                500, "INTERNAL_SERVER_ERROR", "/api/test-errors/runtime");
        assertEquals(SERVER_ERROR_MESSAGE, body.get("message").asString());
    }

    // ---- 値自体が不正なDBエラー(SQLState 22xxx) ----

    @ParameterizedTest
    @ValueSource(strings = {
            "{\"title\":\"a\\u0000b\",\"originalText\":\"o\"}",
            "{\"title\":\"t\",\"companyName\":\"a\\u0000b\",\"originalText\":\"o\"}",
            "{\"title\":\"t\",\"originalText\":\"a\\u0000b\"}",
            "{\"title\":\"t\",\"originalText\":\"o\",\"applicationDeadline\":\"+99999999-01-01\"}",
    })
    void DBが受け取れない値で求人を登録すると_400を返し保存しない(String body) throws Exception {
        assertErrorFormat(sendJson("POST", "/api/job-postings", body),
                400, "INVALID_REQUEST_VALUE", "/api/job-postings");
        assertEquals(0, postingCount());
    }

    @Test
    void メモにNUL文字があると_400を返す() throws Exception {
        HttpResponse<String> created = sendJson("POST", "/api/job-postings", "{\"title\":\"t\",\"originalText\":\"o\"}");
        long id = objectMapper.readTree(created.body()).get("id").asLong();
        String path = "/api/job-postings/" + id + "/notes";

        assertErrorFormat(sendJson("POST", path, "{\"content\":\"a\\u0000b\"}"), 400, "INVALID_REQUEST_VALUE", path);
    }

    @Test
    void 検索キーワードにNUL文字があると_400を返す() throws Exception {
        assertErrorFormat(send("GET", "/api/job-postings?keyword=a%00b", null, null),
                400, "INVALID_REQUEST_VALUE", "/api/job-postings");
    }

    // ---- 他のデータとの衝突(SQLState 23505・23503) ----

    @Test
    void 一意制約の競合は_409を返す() throws Exception {
        assertErrorFormat(send("GET", "/api/test-errors/unique?email=user@example.com", null, null),
                409, "DATA_CONFLICT", "/api/test-errors/unique");
    }

    @Test
    void 外部キーの競合は_409を返す() throws Exception {
        assertErrorFormat(send("GET", "/api/test-errors/foreign-key", null, null),
                409, "DATA_CONFLICT", "/api/test-errors/foreign-key");
    }

    // ---- 入力の検証を通過したはずの値のDBエラーは、サーバーの不具合として扱う ----

    @Test
    void CHECK制約の違反は制約名なしで_500を返しログに残す(CapturedOutput output) throws Exception {
        HttpResponse<String> response = send("GET", "/api/test-errors/check?userId=" + userId, null, null);

        JsonNode body = assertErrorFormat(response, 500, "INTERNAL_SERVER_ERROR", "/api/test-errors/check");
        assertEquals(SERVER_ERROR_MESSAGE, body.get("message").asString());
        assertFalse(response.body().contains("salary"), response.body());
        assertTrue(output.getOut().contains("データの処理に失敗しました: GET /api/test-errors/check"), "原因をログで追えない");
    }

    // ---- 400・409はサーバーの障害と区別し、どのAPIで起きたかだけを警告として残す ----

    @Test
    void DBが受け取れない値はSQLStateを警告で残しエラーログは残さない(CapturedOutput output) throws Exception {
        sendJson("POST", "/api/job-postings", "{\"title\":\"a\\u0000b\",\"originalText\":\"o\"}");

        assertTrue(output.getOut().contains("POST /api/job-postings sqlState=22021"), output.getOut());
        assertFalse(output.getOut().contains("データの処理に失敗しました"), output.getOut());
    }

    @Test
    void データの競合はSQLStateを警告で残しエラーログは残さない(CapturedOutput output) throws Exception {
        send("GET", "/api/test-errors/foreign-key", null, null);

        assertTrue(output.getOut().contains("GET /api/test-errors/foreign-key sqlState=23503"), output.getOut());
        assertFalse(output.getOut().contains("データの処理に失敗しました"), output.getOut());
    }

    // ---- /errorへの転送ではセッションを読まない ----

    @Test
    void エラー応答の後もセッションが維持され別のセッションを作らない() throws Exception {
        assertEquals(500, send("GET", "/api/test-errors/runtime", null, null).statusCode());

        assertTrue(cookies.getCookieStore().getCookies().stream()
                .noneMatch(cookie -> cookie.getName().equals("JSESSIONID")));
        assertEquals(200, send("GET", "/api/auth/me", null, null).statusCode());
    }

    @Test
    void errorを直接開いても同じ形式の_500を返す() throws Exception {
        assertErrorFormat(send("GET", "/error", null, null), 500, "INTERNAL_SERVER_ERROR", "");
    }

    // ---- ログイン ----

    @Test
    void ログインのメールアドレスにNUL文字があると認証失敗ではなく_400を返す() throws Exception {
        assertErrorFormat(sendJson("POST", "/api/auth/login",
                        "{\"email\":\"a\\u0000b@example.com\",\"password\":\"password123\"}"),
                400, "INVALID_REQUEST_VALUE", "/api/auth/login");
    }

    @Test
    void 誤ったパスワードは引き続き_401を返す() throws Exception {
        assertErrorFormat(sendJson("POST", "/api/auth/login",
                        "{\"email\":\"user@example.com\",\"password\":\"wrong-password\"}"),
                401, "INVALID_CREDENTIALS", "/api/auth/login");
    }

    // ---- ページの上限 ----

    // 2147483647(page=2147483647&size=1)は、ちょうどInteger.MAX_VALUE。
    // sizeは上限の20に切り詰められるため、page=107374182&size=20のオフセット(2147483640)が範囲内の最後のページ。
    @ParameterizedTest
    @ValueSource(strings = {"page=107374182&size=20", "page=107374182&size=100", "page=2147483647&size=1"})
    void オフセットがDBで扱える範囲なら空のページを返す(String query) throws Exception {
        assertEquals(200, send("GET", "/api/job-postings?" + query, null, null).statusCode());
    }

    @ParameterizedTest
    @ValueSource(strings = {"page=107374183&size=20", "page=107374183&size=100", "page=2147483647&size=20"})
    void オフセットが範囲を超えると_400を返す(String query) throws Exception {
        assertErrorFormat(send("GET", "/api/job-postings?" + query, null, null),
                400, "INVALID_PAGE", "/api/job-postings");
    }

    // ---- 認証前 ----

    @Test
    void 未ログインなら存在しないパスも引き続き_401を返す() throws Exception {
        cookies.getCookieStore().removeAll();

        assertErrorFormat(send("GET", "/api/unknown", null, null), 401, "UNAUTHORIZED", "/api/unknown");
    }
}
