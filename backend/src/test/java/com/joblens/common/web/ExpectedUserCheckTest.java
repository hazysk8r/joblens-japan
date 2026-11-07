package com.joblens.common.web;

import static com.joblens.CsrfTestSupport.doubleSubmitCsrf;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.joblens.TestcontainersConfiguration;

import jakarta.servlet.http.Cookie;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * 別のタブでアカウントが切り替わった後に、前のユーザーの画面から送られた変更リクエストを
 * サーバーが拒否することを検証する。
 *
 * 状況: ブラウザのセッションCookieはすでにユーザーBのものだが、
 * 画面はまだユーザーAのままで、X-Expected-User-IdにAのIDを付けて送信する。
 * このときAの入力内容がBのデータとして保存・変更・削除されてはならない。
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class ExpectedUserCheckTest {

    private static final String EXPECTED_USER_HEADER = "X-Expected-User-Id";

    private static final String POSTING_BODY = """
        {
          "title": "Aの画面で入力した求人",
          "originalText": "Aの画面で入力した本文"
        }
        """;

    private static final String STATUS_BODY = """
        {
          "status": "APPLIED"
        }
        """;

    private static final String MEMO_BODY = """
        {
          "content": "Aの画面で入力したメモ"
        }
        """;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    private LoginUser userA;
    private LoginUser userB;
    // ユーザーBが所有する求人とメモ。
    private long postingId;
    private long memoId;

    private record LoginUser(long id, Cookie session) {
    }

    @BeforeEach
    void setUp() throws Exception {
        // ユーザーを削除すると、求人・メモ・状態履歴もON DELETE CASCADEで削除される。
        jdbcTemplate.update("DELETE FROM spring_session");
        jdbcTemplate.update("DELETE FROM users");

        userA = signup("user-a@example.com");
        userB = signup("user-b@example.com");

        postingId = json(mockMvc.perform(as(userB, post("/api/job-postings"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                              "title": "Bの求人",
                              "originalText": "Bの本文"
                            }
                            """))
                .andExpect(status().isCreated())
                .andReturn()).get("id").asLong();

        memoId = json(mockMvc.perform(as(userB, post("/api/job-postings/{id}/notes", postingId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                              "content": "Bのメモ"
                            }
                            """))
                .andExpect(status().isCreated())
                .andReturn()).get("id").asLong();
    }

    // ---- テスト用の補助メソッド ----

    private LoginUser signup(String email) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/signup")
                        .with(doubleSubmitCsrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                              "email": "%s",
                              "password": "password123"
                            }
                            """.formatted(email)))
                .andExpect(status().isCreated())
                .andReturn();

        Cookie session = result.getResponse().getCookie("SESSION");
        assertNotNull(session, "セッションCookieが発行されていない");
        return new LoginUser(json(result).get("id").asLong(), session);
    }

    private MockHttpServletRequestBuilder as(LoginUser user, MockHttpServletRequestBuilder request) {
        return request.cookie(user.session()).with(doubleSubmitCsrf());
    }

    private JsonNode json(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    // 求人とメモの状態を丸ごと取得し、リクエストの前後で比較する。
    private List<Map<String, Object>> snapshot() {
        return Stream.concat(
                jdbcTemplate.queryForList(
                        "SELECT id, user_id, title, original_text, application_status, version"
                                + " FROM job_postings ORDER BY id").stream(),
                jdbcTemplate.queryForList(
                        "SELECT id, job_posting_id, content FROM job_posting_memos ORDER BY id").stream())
                .toList();
    }

    // ユーザーBのデータを変更するすべてのリクエスト。
    private MockHttpServletRequestBuilder stateChangingRequest(String name) {
        return switch (name) {
            case "求人の登録" -> post("/api/job-postings")
                    .contentType(MediaType.APPLICATION_JSON).content(POSTING_BODY);
            case "求人の編集" -> put("/api/job-postings/{id}", postingId)
                    .header(HttpHeaders.IF_MATCH, "\"0\"")
                    .contentType(MediaType.APPLICATION_JSON).content(POSTING_BODY);
            case "応募ステータスの変更" -> patch("/api/job-postings/{id}/status", postingId)
                    .header(HttpHeaders.IF_MATCH, "\"0\"")
                    .contentType(MediaType.APPLICATION_JSON).content(STATUS_BODY);
            case "求人の削除" -> delete("/api/job-postings/{id}", postingId);
            case "メモの登録" -> post("/api/job-postings/{id}/notes", postingId)
                    .contentType(MediaType.APPLICATION_JSON).content(MEMO_BODY);
            case "メモの編集" -> put("/api/job-postings/{id}/notes/{memoId}", postingId, memoId)
                    .contentType(MediaType.APPLICATION_JSON).content(MEMO_BODY);
            case "メモの削除" -> delete("/api/job-postings/{id}/notes/{memoId}", postingId, memoId);
            default -> throw new IllegalArgumentException(name);
        };
    }

    static Stream<Arguments> stateChangingRequests() {
        return Stream.of("求人の登録", "求人の編集", "応募ステータスの変更", "求人の削除", "メモの登録", "メモの編集", "メモの削除")
                .map(Arguments::of);
    }

    // ---- 予想ユーザーとセッションのユーザーが異なる場合 ----

    @ParameterizedTest(name = "{0}")
    @MethodSource("stateChangingRequests")
    void 想定ユーザーがセッションのユーザーと違うと_409を返しデータを変えない(String name) throws Exception {
        List<Map<String, Object>> before = snapshot();

        mockMvc.perform(as(userB, stateChangingRequest(name))
                        .header(EXPECTED_USER_HEADER, String.valueOf(userA.id())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("AUTH_CONTEXT_CHANGED"));

        assertEquals(before, snapshot());
    }

    @Test
    void 想定ユーザーのヘッダーが数値でないと_409を返しデータを変えない() throws Exception {
        List<Map<String, Object>> before = snapshot();

        mockMvc.perform(as(userB, stateChangingRequest("求人の登録"))
                        .header(EXPECTED_USER_HEADER, "not-a-number"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("AUTH_CONTEXT_CHANGED"));

        assertEquals(before, snapshot());
    }

    // ---- 正常に処理される場合 ----

    @ParameterizedTest(name = "{0}")
    @MethodSource("stateChangingRequests")
    void 想定ユーザーがセッションのユーザーと同じなら正しく処理する(String name) throws Exception {
        mockMvc.perform(as(userB, stateChangingRequest(name))
                        .header(EXPECTED_USER_HEADER, String.valueOf(userB.id())))
                .andExpect(status().is2xxSuccessful());
    }

    @Test
    void 想定ユーザーのヘッダーがなければ従来どおり処理する() throws Exception {
        mockMvc.perform(as(userB, stateChangingRequest("求人の登録")))
                .andExpect(status().isCreated());
    }

    @Test
    void 取得リクエストは想定ユーザーが違っても検査しない() throws Exception {
        // 照会はデータを変更せず、結果は新しい画面に渡る前にフロントエンドで破棄される。
        mockMvc.perform(as(userB, get("/api/job-postings/{id}", postingId))
                        .header(EXPECTED_USER_HEADER, String.valueOf(userA.id())))
                .andExpect(status().isOk());
    }

    @Test
    void ログインのリクエストは想定ユーザーが違っても検査しない() throws Exception {
        // アカウントを切り替えるリクエスト自体は、セッションのユーザーと異なるのが正常。
        mockMvc.perform(as(userB, post("/api/auth/login"))
                        .header(EXPECTED_USER_HEADER, String.valueOf(userA.id()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                              "email": "user-a@example.com",
                              "password": "password123"
                            }
                            """))
                .andExpect(status().isOk());
    }

    @Test
    void 会員登録のリクエストは想定ユーザーが違っても検査しない() throws Exception {
        mockMvc.perform(as(userB, post("/api/auth/signup"))
                        .header(EXPECTED_USER_HEADER, String.valueOf(userA.id()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                              "email": "user-c@example.com",
                              "password": "password123"
                            }
                            """))
                .andExpect(status().isCreated());
    }
}
