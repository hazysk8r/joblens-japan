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
    void 올바른_이메일과_비밀번호로_가입하면_201과_사용자_정보를_반환한다() throws Exception {
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
    void 가입하면_자동으로_로그인되어_me를_조회할_수_있다() throws Exception {
        MvcResult result = signup("user@example.com", PASSWORD);
        assertEquals(201, result.getResponse().getStatus());

        mockMvc.perform(get("/api/auth/me").cookie(sessionCookie(result)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("user@example.com"));
    }

    @Test
    void 비밀번호는_원문이_아닌_해시로_저장된다() throws Exception {
        signup("user@example.com", PASSWORD);

        String storedHash = jdbcTemplate.queryForObject(
                "SELECT password_hash FROM users WHERE email = ?",
                String.class,
                "user@example.com");

        assertNotEquals(PASSWORD, storedHash);
        assertTrue(storedHash.startsWith("{bcrypt}"), "BCryptでハッシュ化されていない");
    }

    @Test
    void 이메일은_앞뒤_공백을_제거하고_소문자로_저장한다() throws Exception {
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
    void 이미_가입된_이메일이면_대소문자가_달라도_409를_반환한다(String duplicatedEmail) throws Exception {
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
    void 이메일_형식이_올바르지_않으면_400을_반환한다(String invalidEmail) throws Exception {
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
    void 비밀번호가_8자_미만이거나_64자를_넘으면_400을_반환한다(int length) throws Exception {
        mockMvc.perform(post("/api/auth/signup")
                        .with(doubleSubmitCsrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials("user@example.com", "a".repeat(length))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fieldErrors.password").exists());
    }

    @Test
    void 한글_비밀번호가_72바이트_이하면_가입하고_로그인할_수_있다() throws Exception {
        // ハングル1文字はUTF-8で3バイトのため、24文字でちょうど72バイトになる。
        String password = "가".repeat(24);

        assertEquals(201, signup("user@example.com", password).getResponse().getStatus());
        assertEquals(200, login("user@example.com", password).getResponse().getStatus());
    }

    @Test
    void 비밀번호가_64자_이하라도_72바이트를_넘으면_400을_반환하고_가입하지_않는다() throws Exception {
        // 25文字(75バイト)は文字数の上限内だが、BCryptが扱えるバイト数を超える。
        mockMvc.perform(post("/api/auth/signup")
                        .with(doubleSubmitCsrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials("user@example.com", "가".repeat(25))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fieldErrors.password").exists());

        Integer count = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM users", Integer.class);
        assertEquals(0, count);
    }

    @Test
    void 세션_컬럼의_이전_길이_100자를_넘는_이메일로_가입하고_로그인할_수_있다() throws Exception {
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

    // ---- ログイン ----

    @Test
    void 올바른_이메일과_비밀번호로_로그인하면_200과_세션_쿠키를_반환한다() throws Exception {
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
    void 로그인하면_세션_ID가_바뀌고_이전_세션은_사용할_수_없다() throws Exception {
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
    void 비밀번호가_틀린_경우와_없는_이메일인_경우_같은_401_응답을_반환한다() throws Exception {
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
    void 로그인하지_않고_me를_조회하면_401을_반환한다() throws Exception {
        mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    void 로그아웃하면_같은_세션으로_me를_조회할_수_없다() throws Exception {
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
    void 로그아웃하면_CSRF_토큰_쿠키를_지우고_이후_요청에서_새_토큰을_발급한다() throws Exception {
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
