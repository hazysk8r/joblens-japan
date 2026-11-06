package com.joblens.common.security;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static com.joblens.CsrfTestSupport.CSRF_COOKIE;
import static com.joblens.CsrfTestSupport.CSRF_HEADER;
import static com.joblens.CsrfTestSupport.doubleSubmitCsrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.joblens.TestcontainersConfiguration;

import jakarta.servlet.http.Cookie;

/**
 * 未ログイン時のアクセス制御、公開エンドポイント、CSRF対策を検証する。
 * CSRFの検証では、テスト用のトークン補助を使わずに実際のCookieとヘッダーで送信する。
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class SecurityAccessTest {

    private static final String JOB_POSTING_BODY = """
        {
          "title": "AWSクラウドエンジニア",
          "originalText": "AWS環境の設計と構築を担当します。"
        }
        """;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void setUp() {
        jdbcTemplate.update("DELETE FROM spring_session");
        jdbcTemplate.update("DELETE FROM users");
    }

    private Cookie loginAsNewUser() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/signup")
                        .with(doubleSubmitCsrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                              "email": "user@example.com",
                              "password": "password123"
                            }
                            """))
                .andExpect(status().isCreated())
                .andReturn();

        Cookie session = result.getResponse().getCookie("SESSION");
        assertNotNull(session, "セッションCookieが発行されていない");
        return session;
    }

    private Cookie fetchCsrfCookie() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/auth/me")).andReturn();
        Cookie csrfCookie = result.getResponse().getCookie(CSRF_COOKIE);
        assertNotNull(csrfCookie, "CSRFトークンのCookieが発行されていない");
        return csrfCookie;
    }

    // ---- アクセス制御 ----

    @Test
    void 未ログインで求人APIを呼ぶと_401のJSONを返す() throws Exception {
        mockMvc.perform(get("/api/job-postings"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"))
                .andExpect(jsonPath("$.path").value("/api/job-postings"));
    }

    @Test
    void ログイン済みで求人APIを呼ぶと正しく処理される() throws Exception {
        Cookie session = loginAsNewUser();

        mockMvc.perform(get("/api/job-postings").cookie(session))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/job-postings")
                        .with(doubleSubmitCsrf())
                        .cookie(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(JOB_POSTING_BODY))
                .andExpect(status().isCreated());
    }

    @Test
    void 未ログインでもヘルスチェックは_200を返す() throws Exception {
        mockMvc.perform(get("/actuator/health"))
                .andExpect(status().isOk());
    }

    // ---- CSRF ----

    @Test
    void ログイン前の最初のリクエストでCSRFトークンのCookieが発行される() throws Exception {
        fetchCsrfCookie();
    }

    static Stream<MockHttpServletRequestBuilder> stateChangingRequests() {
        return Stream.of(
                post("/api/job-postings"),
                post("/api/auth/account/delete"),
                put("/api/job-postings/1"),
                patch("/api/job-postings/1/status"),
                delete("/api/job-postings/1"));
    }

    @ParameterizedTest
    @MethodSource("stateChangingRequests")
    void CSRFトークンなしで状態を変えるリクエストを送ると_403を返す(
            MockHttpServletRequestBuilder request
    ) throws Exception {
        Cookie session = loginAsNewUser();

        mockMvc.perform(request
                        .cookie(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(JOB_POSTING_BODY))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"));
    }

    @Test
    void CSRFトークンなしでログインすると_403を返す() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                              "email": "user@example.com",
                              "password": "password123"
                            }
                            """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"));
    }

    @Test
    void 発行されたCSRFトークンをヘッダーに入れると登録から求人登録まで処理される() throws Exception {
        Cookie csrfCookie = fetchCsrfCookie();

        // ブラウザと同じく、Cookieで受け取ったトークンをヘッダーにも設定して送信する。
        MvcResult signup = mockMvc.perform(post("/api/auth/signup")
                        .cookie(csrfCookie)
                        .header(CSRF_HEADER, csrfCookie.getValue())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                              "email": "user@example.com",
                              "password": "password123"
                            }
                            """))
                .andExpect(status().isCreated())
                .andReturn();

        Cookie session = signup.getResponse().getCookie("SESSION");
        assertNotNull(session, "セッションCookieが発行されていない");

        // ログイン時にトークンが再発行された場合は、新しいトークンを使う。
        Cookie renewedCsrfCookie = signup.getResponse().getCookie(CSRF_COOKIE);
        Cookie currentCsrfCookie = renewedCsrfCookie != null && !renewedCsrfCookie.getValue().isEmpty()
                ? renewedCsrfCookie
                : csrfCookie;

        mockMvc.perform(post("/api/job-postings")
                        .cookie(session, currentCsrfCookie)
                        .header(CSRF_HEADER, currentCsrfCookie.getValue())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(JOB_POSTING_BODY))
                .andExpect(status().isCreated());
    }
}
