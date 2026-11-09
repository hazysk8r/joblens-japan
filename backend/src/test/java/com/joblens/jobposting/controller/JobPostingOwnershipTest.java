package com.joblens.jobposting.controller;

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

import java.util.function.Function;
import java.util.stream.Stream;

import org.hamcrest.Matchers;
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
 * 求人情報とメモが、ログイン中のユーザー本人のものだけに限定されることを検証する。
 *
 * ユーザーAとBは実際の会員登録APIで作成し、セッションCookieでリクエストする。
 * 他人のリソースへのアクセスは、存在しないリソースと区別できない404で拒否されることを確認する。
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class JobPostingOwnershipTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    private LoginUser userA;
    private LoginUser userB;

    private record LoginUser(long id, Cookie session) {
    }

    @BeforeEach
    void setUp() throws Exception {
        // ユーザーを削除すると、求人・メモ・状態履歴もON DELETE CASCADEで削除される。
        jdbcTemplate.update("DELETE FROM spring_session");
        jdbcTemplate.update("DELETE FROM users");

        userA = signup("user-a@example.com");
        userB = signup("user-b@example.com");
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

    private JsonNode createPosting(LoginUser owner, String title, String originalText) throws Exception {
        MvcResult result = mockMvc.perform(as(owner, post("/api/job-postings"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                              "title": "%s",
                              "originalText": "%s"
                            }
                            """.formatted(title, originalText)))
                .andExpect(status().isCreated())
                .andReturn();
        return json(result);
    }

    private long createPostingId(LoginUser owner) throws Exception {
        return createPosting(owner, "Bの求人", "Javaエンジニア募集").get("id").asLong();
    }

    private long createMemo(LoginUser owner, long postingId, String content) throws Exception {
        MvcResult result = mockMvc.perform(as(owner, post("/api/job-postings/{id}/notes", postingId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                              "content": "%s"
                            }
                            """.formatted(content)))
                .andExpect(status().isCreated())
                .andReturn();
        return json(result).get("id").asLong();
    }

    private static final String UPDATE_BODY = """
        {
          "title": "Aが書き換えたタイトル",
          "originalText": "Aが書き換えた本文"
        }
        """;

    private static final String STATUS_BODY = """
        {
          "status": "APPLIED"
        }
        """;

    private static final String MEMO_BODY = """
        {
          "content": "Aが書いたメモ"
        }
        """;

    private void assertPostingUnchanged(long postingId) throws Exception {
        mockMvc.perform(as(userB, get("/api/job-postings/{id}", postingId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Bの求人"))
                .andExpect(jsonPath("$.applicationStatus").value("SAVED"))
                .andExpect(jsonPath("$.version").value(0));
    }

    private int countRows(String sql, Object... args) {
        return jdbcTemplate.queryForObject(sql, Integer.class, args);
    }

    // ---- A. 他人の求人へのアクセス ----

    @Test
    void 別のユーザーの求人を取得すると_404を返す() throws Exception {
        long postingId = createPostingId(userB);

        mockMvc.perform(as(userA, get("/api/job-postings/{id}", postingId)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("JOB_POSTING_NOT_FOUND"));
    }

    @Test
    void 別のユーザーの求人を正しいIfMatchで編集すると_404を返し内容は変わらない() throws Exception {
        long postingId = createPostingId(userB);

        mockMvc.perform(as(userA, put("/api/job-postings/{id}", postingId))
                        .header(HttpHeaders.IF_MATCH, "\"0\"")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(UPDATE_BODY))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("JOB_POSTING_NOT_FOUND"));

        assertPostingUnchanged(postingId);
    }

    @Test
    void 別のユーザーの求人を誤ったIfMatchで編集しても_412ではなく_404を返す() throws Exception {
        long postingId = createPostingId(userB);

        mockMvc.perform(as(userA, put("/api/job-postings/{id}", postingId))
                        .header(HttpHeaders.IF_MATCH, "\"99\"")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(UPDATE_BODY))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("JOB_POSTING_NOT_FOUND"));
    }

    @Test
    void 別のユーザーの求人のステータスを正しいIfMatchで変更すると_404を返し履歴が増えない() throws Exception {
        long postingId = createPostingId(userB);

        mockMvc.perform(as(userA, patch("/api/job-postings/{id}/status", postingId))
                        .header(HttpHeaders.IF_MATCH, "\"0\"")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(STATUS_BODY))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("JOB_POSTING_NOT_FOUND"));

        assertPostingUnchanged(postingId);
        assertEquals(0, countRows(
                "SELECT COUNT(*) FROM job_posting_status_histories WHERE job_posting_id = ?", postingId));
    }

    @Test
    void 別のユーザーの求人のステータスを誤ったIfMatchで変更しても_412ではなく_404を返す() throws Exception {
        long postingId = createPostingId(userB);

        mockMvc.perform(as(userA, patch("/api/job-postings/{id}/status", postingId))
                        .header(HttpHeaders.IF_MATCH, "\"99\"")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(STATUS_BODY))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("JOB_POSTING_NOT_FOUND"));
    }

    @Test
    void 別のユーザーの求人を削除すると_404を返し求人は残る() throws Exception {
        long postingId = createPostingId(userB);

        mockMvc.perform(as(userA, delete("/api/job-postings/{id}", postingId)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("JOB_POSTING_NOT_FOUND"));

        assertPostingUnchanged(postingId);
    }

    @Test
    void 別のユーザーの求人を分析すると_404を返す() throws Exception {
        long postingId = createPostingId(userB);

        mockMvc.perform(as(userA, get("/api/job-postings/{id}/analysis", postingId)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("JOB_POSTING_NOT_FOUND"));
    }

    @Test
    void 別のユーザーの求人のステータス履歴を取得すると_404を返す() throws Exception {
        long postingId = createPostingId(userB);

        mockMvc.perform(as(userA, get("/api/job-postings/{id}/status-history", postingId)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("JOB_POSTING_NOT_FOUND"));
    }

    static Stream<Arguments> postingRequests() {
        return Stream.of(
                Arguments.of("GET", (Function<Long, MockHttpServletRequestBuilder>)
                        id -> get("/api/job-postings/{id}", id)),
                Arguments.of("PUT", (Function<Long, MockHttpServletRequestBuilder>)
                        id -> put("/api/job-postings/{id}", id)
                                .header(HttpHeaders.IF_MATCH, "\"0\"")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(UPDATE_BODY)),
                Arguments.of("DELETE", (Function<Long, MockHttpServletRequestBuilder>)
                        id -> delete("/api/job-postings/{id}", id)));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("postingRequests")
    void 存在しない求人と別のユーザーの求人は同じ応答を返す(
            String method,
            Function<Long, MockHttpServletRequestBuilder> request
    ) throws Exception {
        long othersPostingId = createPostingId(userB);
        long missingPostingId = othersPostingId + 100_000;

        MvcResult others = mockMvc.perform(as(userA, request.apply(othersPostingId))).andReturn();
        MvcResult missing = mockMvc.perform(as(userA, request.apply(missingPostingId))).andReturn();

        assertEquals(missing.getResponse().getStatus(), others.getResponse().getStatus());
        assertEquals(json(missing).get("code").asString(), json(others).get("code").asString());
    }

    // ---- B. 他人のメモへのアクセス ----

    @Test
    void 別のユーザーの求人にメモを書くと_404を返しメモは作成されない() throws Exception {
        long postingId = createPostingId(userB);

        mockMvc.perform(as(userA, post("/api/job-postings/{id}/notes", postingId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(MEMO_BODY))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("JOB_POSTING_NOT_FOUND"));

        assertEquals(0, countRows(
                "SELECT COUNT(*) FROM job_posting_memos WHERE job_posting_id = ?", postingId));
    }

    @Test
    void 別のユーザーの求人のメモ一覧を取得すると_404を返す() throws Exception {
        long postingId = createPostingId(userB);
        createMemo(userB, postingId, "Bのメモ");

        mockMvc.perform(as(userA, get("/api/job-postings/{id}/notes", postingId)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("JOB_POSTING_NOT_FOUND"));
    }

    @Test
    void 別のユーザーの求人とメモで編集と削除をすると_404を返しメモは変わらない() throws Exception {
        long postingId = createPostingId(userB);
        long memoId = createMemo(userB, postingId, "Bのメモ");

        mockMvc.perform(as(userA, put("/api/job-postings/{id}/notes/{memoId}", postingId, memoId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(MEMO_BODY))
                .andExpect(status().isNotFound());
        mockMvc.perform(as(userA, delete("/api/job-postings/{id}/notes/{memoId}", postingId, memoId)))
                .andExpect(status().isNotFound());

        assertEquals(1, countRows(
                "SELECT COUNT(*) FROM job_posting_memos WHERE id = ? AND content = ?", memoId, "Bのメモ"));
    }

    @Test
    void 自分の求人IDと別のユーザーのメモIDで編集と削除をすると_404を返しメモは変わらない() throws Exception {
        long myPostingId = createPostingId(userA);
        long othersPostingId = createPostingId(userB);
        long othersMemoId = createMemo(userB, othersPostingId, "Bのメモ");

        mockMvc.perform(as(userA, put("/api/job-postings/{id}/notes/{memoId}", myPostingId, othersMemoId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(MEMO_BODY))
                .andExpect(status().isNotFound());
        mockMvc.perform(as(userA, delete("/api/job-postings/{id}/notes/{memoId}", myPostingId, othersMemoId)))
                .andExpect(status().isNotFound());

        assertEquals(1, countRows(
                "SELECT COUNT(*) FROM job_posting_memos WHERE id = ? AND content = ?", othersMemoId, "Bのメモ"));
    }

    // ---- C. 一覧・集計 ----

    @Test
    void 求人一覧には自分の求人だけが出る() throws Exception {
        long myFirst = createPosting(userA, "Aの求人1", "本文").get("id").asLong();
        long mySecond = createPosting(userA, "Aの求人2", "本文").get("id").asLong();
        createPosting(userB, "Bの求人1", "本文");
        createPosting(userB, "Bの求人2", "本文");
        createPosting(userB, "Bの求人3", "本文");

        mockMvc.perform(as(userA, get("/api/job-postings")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.content[*].id").value(Matchers.containsInAnyOrder(
                        (int) myFirst, (int) mySecond)));
    }

    @Test
    void 別のユーザーの求人にだけあるキーワードで検索すると結果がない() throws Exception {
        createPosting(userA, "Aの求人", "Java開発");
        createPosting(userB, "Bの求人", "Kubernetes運用");

        mockMvc.perform(as(userA, get("/api/job-postings").param("keyword", "Kubernetes")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void ステータス集計は自分の求人だけを集計する() throws Exception {
        createPosting(userA, "Aの求人", "本文");

        createPosting(userB, "Bの求人1", "本文");
        createPosting(userB, "Bの求人2", "本文");
        long othersApplied = createPosting(userB, "Bの求人3", "本文").get("id").asLong();
        mockMvc.perform(as(userB, patch("/api/job-postings/{id}/status", othersApplied))
                        .header(HttpHeaders.IF_MATCH, "\"0\"")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(STATUS_BODY))
                .andExpect(status().isOk());

        mockMvc.perform(as(userA, get("/api/job-postings/status-summary")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.saved").value(1))
                .andExpect(jsonPath("$.applied").value(0));
    }

    // ---- D. 登録と所有者 ----

    @Test
    void 求人を登録するとログイン中のユーザーが所有者になる() throws Exception {
        long postingId = createPosting(userA, "Aの求人", "本文").get("id").asLong();

        assertEquals(userA.id(), jdbcTemplate.queryForObject(
                "SELECT user_id FROM job_postings WHERE id = ?", Long.class, postingId));
    }

    @Test
    void リクエスト本文に別のユーザーのIDを入れてもログイン中のユーザーが所有者になる() throws Exception {
        MvcResult result = mockMvc.perform(as(userA, post("/api/job-postings"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                              "title": "Aの求人",
                              "originalText": "本文",
                              "userId": %d
                            }
                            """.formatted(userB.id())))
                .andExpect(status().isCreated())
                .andReturn();

        long postingId = json(result).get("id").asLong();
        assertEquals(userA.id(), jdbcTemplate.queryForObject(
                "SELECT user_id FROM job_postings WHERE id = ?", Long.class, postingId));
    }

    // ---- E. データの整合性 ----

    @Test
    void ユーザーを削除すると求人とメモとステータス履歴も一緒に削除される() throws Exception {
        long postingId = createPostingId(userB);
        createMemo(userB, postingId, "Bのメモ");
        mockMvc.perform(as(userB, patch("/api/job-postings/{id}/status", postingId))
                        .header(HttpHeaders.IF_MATCH, "\"0\"")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(STATUS_BODY))
                .andExpect(status().isOk());

        jdbcTemplate.update("DELETE FROM users WHERE id = ?", userB.id());

        assertEquals(0, countRows("SELECT COUNT(*) FROM job_postings WHERE id = ?", postingId));
        assertEquals(0, countRows(
                "SELECT COUNT(*) FROM job_posting_memos WHERE job_posting_id = ?", postingId));
        assertEquals(0, countRows(
                "SELECT COUNT(*) FROM job_posting_status_histories WHERE job_posting_id = ?", postingId));
    }
}
