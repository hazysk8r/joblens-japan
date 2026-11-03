package com.joblens.auth.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static com.joblens.CsrfTestSupport.doubleSubmitCsrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockCookie;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import com.joblens.CsrfTestSupport;
import com.joblens.TestcontainersConfiguration;

import jakarta.servlet.http.Cookie;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * 会員登録・ログイン・ログアウト・ログイン状態確認のAPIを、
 * 実際のセキュリティ設定とセッション保存先(PostgreSQL)を通して検証する。
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class AuthControllerTest {

    private static final String SESSION_COOKIE = "SESSION";
    private static final String PASSWORD = "password123";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        jdbcTemplate.update("DELETE FROM spring_session");
        jdbcTemplate.update("DELETE FROM users");
    }

    private String credentials(String email, String password) {
        return """
            {
              "email": "%s",
              "password": "%s"
            }
            """.formatted(email, password);
    }

    private MvcResult signup(String email, String password) throws Exception {
        return mockMvc.perform(post("/api/auth/signup")
                        .with(doubleSubmitCsrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials(email, password)))
                .andReturn();
    }

    private MvcResult login(String email, String password, Cookie... cookies) throws Exception {
        var request = post("/api/auth/login")
                .with(doubleSubmitCsrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(credentials(email, password));

        if (cookies.length > 0) {
            request.cookie(cookies);
        }

        return mockMvc.perform(request).andReturn();
    }

    private Cookie sessionCookie(MvcResult result) {
        Cookie cookie = result.getResponse().getCookie(SESSION_COOKIE);
        assertNotNull(cookie, "セッションCookieが発行されていない");
        return cookie;
    }

    // ---- 会員登録 ----

    @Test
    void 正しいメールアドレスとパスワードで登録すると_201とユーザー情報を返す() throws Exception {
        mockMvc.perform(post("/api/auth/signup")
                        .with(doubleSubmitCsrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials("user@example.com", PASSWORD)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.email").value("user@example.com"))
                .andExpect(jsonPath("$.password").doesNotExist())
                .andExpect(jsonPath("$.passwordHash").doesNotExist());
    }

    @Test
    void 登録すると自動でログインされ_meを取得できる() throws Exception {
        MvcResult result = signup("user@example.com", PASSWORD);
        assertEquals(201, result.getResponse().getStatus());

        mockMvc.perform(get("/api/auth/me").cookie(sessionCookie(result)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("user@example.com"));
    }

    @Test
    void パスワードは平文ではなくハッシュで保存される() throws Exception {
        signup("user@example.com", PASSWORD);

        String storedHash = jdbcTemplate.queryForObject(
                "SELECT password_hash FROM users WHERE email = ?",
                String.class,
                "user@example.com");

        assertNotEquals(PASSWORD, storedHash);
        assertTrue(storedHash.startsWith("{bcrypt}"), "BCryptでハッシュ化されていない");
    }

    @Test
    void メールアドレスは前後の空白を除き小文字で保存する() throws Exception {
        MvcResult result = signup("  User@Example.COM  ", PASSWORD);

        assertEquals(201, result.getResponse().getStatus());
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM users WHERE email = ?",
                Integer.class,
                "user@example.com");
        assertEquals(1, count);
    }

    @ParameterizedTest
    @ValueSource(strings = {"user@example.com", "USER@example.com"})
    void 登録済みのメールアドレスなら大文字小文字が違っても_409を返す(String duplicatedEmail) throws Exception {
        signup("user@example.com", PASSWORD);

        mockMvc.perform(post("/api/auth/signup")
                        .with(doubleSubmitCsrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials(duplicatedEmail, PASSWORD)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("EMAIL_ALREADY_EXISTS"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "   ", "not-an-email"})
    void メールアドレスの形式が正しくなければ_400を返す(String invalidEmail) throws Exception {
        mockMvc.perform(post("/api/auth/signup")
                        .with(doubleSubmitCsrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials(invalidEmail, PASSWORD)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fieldErrors.email").exists());
    }

    @ParameterizedTest
    @ValueSource(ints = {7, 65})
    void パスワードが8文字未満または64文字超なら_400を返す(int length) throws Exception {
        mockMvc.perform(post("/api/auth/signup")
                        .with(doubleSubmitCsrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials("user@example.com", "a".repeat(length))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fieldErrors.password").value("パスワードは8文字以上64文字以内で入力してください。"));
    }

    @Test
    void 日本語のパスワードが72バイト以下なら登録してログインできる() throws Exception {
        // ひらがな1文字はUTF-8で3バイトのため、24文字でちょうど72バイトになる。
        String password = "あ".repeat(24);

        assertEquals(201, signup("user@example.com", password).getResponse().getStatus());
        assertEquals(200, login("user@example.com", password).getResponse().getStatus());
    }

    @Test
    void パスワードが64文字以下でも72バイト超なら_400を返し登録しない() throws Exception {
        // 25文字(75バイト)は文字数の上限内だが、BCryptが扱えるバイト数を超える。
        mockMvc.perform(post("/api/auth/signup")
                        .with(doubleSubmitCsrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials("user@example.com", "あ".repeat(25))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fieldErrors.password").exists());

        Integer count = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM users", Integer.class);
        assertEquals(0, count);
    }

    @Test
    void セッション列の以前の長さ100文字を超えるメールアドレスで登録してログインできる() throws Exception {
        // ローカル部64文字・ドメイン131文字の、形式として正しい196文字のメールアドレス。
        String longEmail = "a".repeat(64) + "@" + "b".repeat(63) + "." + "c".repeat(63) + ".com";
        assertTrue(longEmail.length() > 100);

        MvcResult signupResult = signup(longEmail, PASSWORD);
        assertEquals(201, signupResult.getResponse().getStatus());
        mockMvc.perform(get("/api/auth/me").cookie(sessionCookie(signupResult)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(longEmail));

        MvcResult loginResult = login(longEmail, PASSWORD);
        assertEquals(200, loginResult.getResponse().getStatus());
        mockMvc.perform(get("/api/auth/me").cookie(sessionCookie(loginResult)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(longEmail));
    }

    // ---- ログインの入力の上限 ----

    // 会員登録で受け付ける最長の値(SignupRequestの上限)と同じ長さ。
    private static final String LONGEST_SIGNUP_EMAIL =
            "a".repeat(64) + "@" + "b".repeat(63) + "." + "c".repeat(63) + "." + "d".repeat(57) + ".com";
    private static final String LONGEST_SIGNUP_PASSWORD = "a".repeat(64);
    private static final String EMAIL_TOO_LONG_MESSAGE = "メールアドレスは254文字以内で入力してください。";
    private static final String LOGIN_PASSWORD_TOO_LONG_MESSAGE = "パスワードは64文字以内で入力してください。";

    @Test
    void 登録できる最長のメールアドレスとパスワードでログインできる() throws Exception {
        // ログインの上限が会員登録より小さいと、登録できたのにログインできないユーザーが生まれる。
        assertEquals(254, LONGEST_SIGNUP_EMAIL.length());

        assertEquals(201, signup(LONGEST_SIGNUP_EMAIL, LONGEST_SIGNUP_PASSWORD).getResponse().getStatus());
        assertEquals(200, login(LONGEST_SIGNUP_EMAIL, LONGEST_SIGNUP_PASSWORD).getResponse().getStatus());
    }

    @Test
    void ログインのパスワードが64文字超なら_400を返す() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .with(doubleSubmitCsrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials("user@example.com", "a".repeat(65))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fieldErrors.password").value(LOGIN_PASSWORD_TOO_LONG_MESSAGE));
    }

    @Test
    void ログインのメールアドレスが254文字超なら_400を返す() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .with(doubleSubmitCsrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials("a" + LONGEST_SIGNUP_EMAIL, PASSWORD)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fieldErrors.email").value(EMAIL_TOO_LONG_MESSAGE));
    }

    @Test
    void 登録のメールアドレスが254文字超なら_400を返す() throws Exception {
        // 形式として正しい255文字のメールアドレス。@Emailではなく長さの上限だけに当たる。
        String tooLongEmail = "a".repeat(64) + "@" + "b".repeat(63) + "." + "c".repeat(63) + "." + "d".repeat(58) + ".com";
        assertEquals(255, tooLongEmail.length());

        mockMvc.perform(post("/api/auth/signup")
                        .with(doubleSubmitCsrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials(tooLongEmail, PASSWORD)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fieldErrors.email").value(EMAIL_TOO_LONG_MESSAGE));
    }

    // ---- ログイン ----

    @Test
    void 正しいメールアドレスとパスワードでログインすると_200とセッションCookieを返す() throws Exception {
        signup("user@example.com", PASSWORD);

        MvcResult result = login("user@example.com", PASSWORD);

        assertEquals(200, result.getResponse().getStatus());
        assertTrue(result.getResponse().getContentAsString().contains("user@example.com"));
        Cookie session = sessionCookie(result);
        assertTrue(session.isHttpOnly(), "セッションCookieにHttpOnlyが設定されていない");
        assertEquals("Lax", ((MockCookie) session).getSameSite(), "セッションCookieにSameSite=Laxが設定されていない");
        // SESSION_COOKIE_SECUREを指定しない場合は、HTTPのリクエストでもSecureが付く。
        assertTrue(session.getSecure(), "セッションCookieにSecureが設定されていない");
    }

    @Test
    void ログインするとセッションIDが変わり以前のセッションは使えない() throws Exception {
        MvcResult signupResult = signup("user@example.com", PASSWORD);
        Cookie previousSession = sessionCookie(signupResult);

        // 既存のセッションCookieを付けたままログインし、セッション固定攻撃の状況を再現する。
        MvcResult loginResult = login("user@example.com", PASSWORD, previousSession);
        Cookie newSession = sessionCookie(loginResult);

        assertNotEquals(previousSession.getValue(), newSession.getValue());
        mockMvc.perform(get("/api/auth/me").cookie(previousSession))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/auth/me").cookie(newSession))
                .andExpect(status().isOk());
    }

    @Test
    void パスワードの誤りと存在しないメールアドレスで同じ_401応答を返す() throws Exception {
        signup("user@example.com", PASSWORD);

        MvcResult wrongPassword = login("user@example.com", "wrong-password");
        MvcResult unknownEmail = login("nobody@example.com", PASSWORD);

        assertEquals(401, wrongPassword.getResponse().getStatus());
        assertEquals(401, unknownEmail.getResponse().getStatus());

        mockMvc.perform(post("/api/auth/login")
                        .with(doubleSubmitCsrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials("user@example.com", "wrong-password")))
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));

        // メッセージから登録済みのメールアドレスかどうかを推測できないことを確認する。
        String wrongPasswordMessage = messageOf(wrongPassword);
        String unknownEmailMessage = messageOf(unknownEmail);
        assertEquals(wrongPasswordMessage, unknownEmailMessage);
    }

    private String messageOf(MvcResult result) throws Exception {
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertTrue(body.hasNonNull("message"), "messageが含まれていない: " + body);
        return body.get("message").asString();
    }

    // ---- ログイン状態の確認・ログアウト ----

    @Test
    void 未ログインでmeを取得すると_401を返す() throws Exception {
        mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    void ログアウトすると同じセッションでmeを取得できない() throws Exception {
        signup("user@example.com", PASSWORD);
        Cookie session = sessionCookie(login("user@example.com", PASSWORD));

        mockMvc.perform(post("/api/auth/logout").with(doubleSubmitCsrf()).cookie(session))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/auth/me").cookie(session))
                .andExpect(status().isUnauthorized());
    }

    /*
     * フロントエンドは、ログアウト後にCSRFトークンのCookieが消えることを前提に、
     * 次のログインの前にトークンを取り直す。その前提となるサーバーの動作を固定する。
     */
    @Test
    void ログアウトするとCSRFトークンのCookieを消し以降のリクエストで新しいトークンを発行する() throws Exception {
        signup("user@example.com", PASSWORD);
        Cookie session = sessionCookie(login("user@example.com", PASSWORD));

        MvcResult logout = mockMvc.perform(post("/api/auth/logout").with(doubleSubmitCsrf()).cookie(session))
                .andExpect(status().isNoContent())
                .andReturn();

        Cookie clearedCsrf = logout.getResponse().getCookie(CsrfTestSupport.CSRF_COOKIE);
        assertNotNull(clearedCsrf, "ログアウトの応答でCSRFトークンのCookieが削除されていない");
        assertEquals(0, clearedCsrf.getMaxAge());

        // ログインしていない状態の照会でも、新しいトークンが発行される。
        MvcResult me = mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized())
                .andReturn();
        Cookie newCsrf = me.getResponse().getCookie(CsrfTestSupport.CSRF_COOKIE);
        assertNotNull(newCsrf, "新しいCSRFトークンのCookieが発行されていない");
        assertTrue(!newCsrf.getValue().isEmpty() && newCsrf.getMaxAge() != 0);
    }
}
