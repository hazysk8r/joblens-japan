package com.joblens.common.limit;

import static com.joblens.CsrfTestSupport.doubleSubmitCsrf;
import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.joblens.TestcontainersConfiguration;
import com.joblens.jobposting.dto.CreateJobPostingRequest;
import com.joblens.jobposting.service.JobPostingService;
import com.joblens.note.dto.CreateJobPostingMemoRequest;
import com.joblens.note.service.JobPostingMemoService;

import jakarta.servlet.http.Cookie;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * 求人とメモの保存件数の上限を、実際のDBとセッションを通して検証する。
 *
 * 同時実行の検証では、コミットが実際に行われるようテスト自体にトランザクションを付けず、
 * 別スレッドからサービスを呼び出す。
 */
@SpringBootTest(properties = {
        "joblens.limits.max-postings-per-user=2",
        "joblens.limits.max-memos-per-posting=2"
})
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class UsageLimitTest {

    private static final int CONCURRENT_REQUESTS = 16;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JobPostingService jobPostingService;

    @Autowired
    private JobPostingMemoService jobPostingMemoService;

    private LoginUser userA;
    private LoginUser userB;

    private record LoginUser(long id, String email, Cookie session) {
    }

    @BeforeEach
    void setUp() throws Exception {
        jdbcTemplate.update("DELETE FROM spring_session");
        jdbcTemplate.update("DELETE FROM users");

        userA = signup("limit-a@example.com");
        userB = signup("limit-b@example.com");
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
        return new LoginUser(json(result).get("id").asLong(), email, session);
    }

    private MockHttpServletRequestBuilder as(LoginUser user, MockHttpServletRequestBuilder request) {
        return request.cookie(user.session()).with(doubleSubmitCsrf());
    }

    private JsonNode json(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    private ResultActions requestCreatePosting(LoginUser owner) throws Exception {
        return mockMvc.perform(as(owner, post("/api/job-postings"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "title": "求人",
                      "originalText": "求人の原文"
                    }
                    """));
    }

    private JsonNode createPosting(LoginUser owner) throws Exception {
        return json(requestCreatePosting(owner).andExpect(status().isCreated()).andReturn());
    }

    private ResultActions requestCreateMemo(LoginUser user, long jobPostingId) throws Exception {
        return mockMvc.perform(as(user, post("/api/job-postings/{id}/notes", jobPostingId))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "content": "メモ"
                    }
                    """));
    }

    private JsonNode createMemo(LoginUser user, long jobPostingId) throws Exception {
        return json(requestCreateMemo(user, jobPostingId).andExpect(status().isCreated()).andReturn());
    }

    private long postingCount(LoginUser owner) {
        return jdbcTemplate.queryForObject(
                "SELECT count(*) FROM job_postings WHERE user_id = ?", Long.class, owner.id());
    }

    private long memoCount(long jobPostingId) {
        return jdbcTemplate.queryForObject(
                "SELECT count(*) FROM job_posting_memos WHERE job_posting_id = ?", Long.class, jobPostingId);
    }

    // 同時に開始し、成功した件数と拒否の例外名を返す。
    private ConcurrentResult runConcurrently(Callable<?> task) throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(CONCURRENT_REQUESTS);
        CountDownLatch ready = new CountDownLatch(CONCURRENT_REQUESTS);
        CountDownLatch start = new CountDownLatch(1);

        try {
            List<Future<Object>> futures = new ArrayList<>();
            for (int index = 0; index < CONCURRENT_REQUESTS; index++) {
                futures.add(executor.submit(() -> {
                    ready.countDown();
                    start.await();
                    return task.call();
                }));
            }

            ready.await();
            start.countDown();

            int succeeded = 0;
            List<String> rejected = new ArrayList<>();
            for (Future<Object> future : futures) {
                try {
                    future.get();
                    succeeded++;
                } catch (ExecutionException exception) {
                    rejected.add(exception.getCause().getClass().getSimpleName());
                }
            }
            return new ConcurrentResult(succeeded, rejected);
        } finally {
            executor.shutdownNow();
        }
    }

    private record ConcurrentResult(int succeeded, List<String> rejected) {
    }

    // ---- 求人の上限 ----

    @Test
    void 求人は上限まで登録でき_超えると409を返して保存しない() throws Exception {
        createPosting(userA);
        createPosting(userA);

        requestCreatePosting(userA)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("JOB_POSTING_LIMIT_REACHED"))
                .andExpect(jsonPath("$.message").value(containsString("2件")));

        assertEquals(2, postingCount(userA));
    }

    @Test
    void 求人の上限は他のユーザーに影響しない() throws Exception {
        createPosting(userA);
        createPosting(userA);

        createPosting(userB);

        assertEquals(1, postingCount(userB));
    }

    @Test
    void 求人が上限でも編集_状態変更_削除はでき_削除すると再び登録できる() throws Exception {
        JsonNode first = createPosting(userA);
        createPosting(userA);
        long id = first.get("id").asLong();

        MvcResult updated = mockMvc.perform(as(userA, put("/api/job-postings/{id}", id))
                        .header("If-Match", "\"" + first.get("version").asLong() + "\"")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                              "title": "編集後",
                              "originalText": "編集後の原文"
                            }
                            """))
                .andExpect(status().isOk())
                .andReturn();

        mockMvc.perform(as(userA, patch("/api/job-postings/{id}/status", id))
                        .header("If-Match", "\"" + json(updated).get("version").asLong() + "\"")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                              "status": "APPLIED"
                            }
                            """))
                .andExpect(status().isOk());

        mockMvc.perform(as(userA, delete("/api/job-postings/{id}", id)))
                .andExpect(status().isNoContent());

        createPosting(userA);
    }

    @Test
    void 同時に登録しても求人の上限を超えない() throws Exception {
        CreateJobPostingRequest request =
                new CreateJobPostingRequest(null, "求人", null, "求人の原文", null, null, null);

        ConcurrentResult result = runConcurrently(() -> jobPostingService.create(userA.id(), request));

        assertEquals(2, result.succeeded());
        assertEquals(2, postingCount(userA));
        assertTrue(result.rejected().stream().allMatch("JobPostingLimitReachedException"::equals),
                () -> "想定外の失敗: " + result.rejected());
    }

    // ---- メモの上限 ----

    @Test
    void メモは上限まで登録でき_超えると409を返して保存しない() throws Exception {
        long id = createPosting(userA).get("id").asLong();
        createMemo(userA, id);
        createMemo(userA, id);

        requestCreateMemo(userA, id)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("MEMO_LIMIT_REACHED"))
                .andExpect(jsonPath("$.message").value(containsString("2件")));

        assertEquals(2, memoCount(id));
    }

    @Test
    void メモの上限は他の求人に影響しない() throws Exception {
        long full = createPosting(userA).get("id").asLong();
        long other = createPosting(userA).get("id").asLong();
        createMemo(userA, full);
        createMemo(userA, full);

        createMemo(userA, other);

        assertEquals(1, memoCount(other));
    }

    @Test
    void 他人の求人へのメモは_上限に達していても404を返す() throws Exception {
        long id = createPosting(userA).get("id").asLong();
        createMemo(userA, id);
        createMemo(userA, id);

        requestCreateMemo(userB, id)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("JOB_POSTING_NOT_FOUND"));
    }

    @Test
    void メモが上限でも編集と削除はでき_削除すると再び登録できる() throws Exception {
        long id = createPosting(userA).get("id").asLong();
        long memoId = createMemo(userA, id).get("id").asLong();
        createMemo(userA, id);

        mockMvc.perform(as(userA, put("/api/job-postings/{id}/notes/{memoId}", id, memoId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                              "content": "編集後"
                            }
                            """))
                .andExpect(status().isOk());

        mockMvc.perform(as(userA, delete("/api/job-postings/{id}/notes/{memoId}", id, memoId)))
                .andExpect(status().isNoContent());

        createMemo(userA, id);
    }

    @Test
    void 同時に登録してもメモの上限を超えない() throws Exception {
        long id = createPosting(userA).get("id").asLong();
        CreateJobPostingMemoRequest request = new CreateJobPostingMemoRequest("メモ");

        ConcurrentResult result = runConcurrently(() -> jobPostingMemoService.create(userA.id(), id, request));

        assertEquals(2, result.succeeded());
        assertEquals(2, memoCount(id));
        assertTrue(result.rejected().stream().allMatch("MemoLimitReachedException"::equals),
                () -> "想定外の失敗: " + result.rejected());
    }

    // ---- ユーザーが存在しないセッション ----

    private void assertSessionEndedAfterRequest(LoginUser user, ResultActions rejected) throws Exception {
        MvcResult result = rejected
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"))
                .andReturn();

        Cookie cleared = result.getResponse().getCookie("SESSION");
        assertNotNull(cleared, "セッションCookieが削除されていない");
        assertEquals(0, cleared.getMaxAge(), "セッションCookieが削除されていない");
        assertEquals("", cleared.getValue(), "セッションCookieが新しく発行されている");

        // /meが200を返し続けると、画面はログイン状態のまま失敗を繰り返す。
        mockMvc.perform(get("/api/auth/me").cookie(user.session()))
                .andExpect(status().isUnauthorized());
        assertEquals(0, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM spring_session WHERE principal_name = ?", Long.class, user.email()));
    }

    @Test
    void 削除済みユーザーのセッションで求人を登録すると_セッションを終了して401を返す() throws Exception {
        jdbcTemplate.update("DELETE FROM users WHERE id = ?", userA.id());

        assertSessionEndedAfterRequest(userA, requestCreatePosting(userA));
    }

    @Test
    void 削除済みユーザーのセッションでメモを登録すると_404ではなく401を返す() throws Exception {
        long id = createPosting(userA).get("id").asLong();
        jdbcTemplate.update("DELETE FROM users WHERE id = ?", userA.id());

        assertSessionEndedAfterRequest(userA, requestCreateMemo(userA, id));
    }
}
