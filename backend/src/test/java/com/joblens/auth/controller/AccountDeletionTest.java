package com.joblens.auth.controller;

import static com.joblens.CsrfTestSupport.doubleSubmitCsrf;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.joblens.TestcontainersConfiguration;

import jakarta.servlet.http.Cookie;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * アカウント削除のAPIを、実際のセキュリティ設定・セッション保存先・DBを通して検証する。
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class AccountDeletionTest {

    private static final String PASSWORD = "password123";
    private static final String DELETE_PATH = "/api/auth/account/delete";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    private LoginUser userA;
    private LoginUser userB;

    private record LoginUser(long id, String email, Cookie session) {
    }

    @BeforeEach
    void setUp() throws Exception {
        jdbcTemplate.update("DELETE FROM spring_session");
        jdbcTemplate.update("DELETE FROM users");

        userA = signup("delete-a@example.com");
        userB = signup("delete-b@example.com");
    }

    // ---- テスト用の補助メソッド ----

    private String credentials(String email) {
        return """
            {
              "email": "%s",
              "password": "%s"
            }
            """.formatted(email, PASSWORD);
    }

    private LoginUser signup(String email) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/signup")
                        .with(doubleSubmitCsrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials(email)))
                .andExpect(status().isCreated())
                .andReturn();
        return new LoginUser(json(result).get("id").asLong(), email, sessionOf(result));
    }

    private Cookie login(LoginUser user) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/login")
                        .with(doubleSubmitCsrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials(user.email())))
                .andExpect(status().isOk())
                .andReturn();
        return sessionOf(result);
    }

    private Cookie sessionOf(MvcResult result) {
        Cookie session = result.getResponse().getCookie("SESSION");
        assertNotNull(session, "セッションCookieが発行されていない");
        return session;
    }

    private MockHttpServletRequestBuilder as(Cookie session, MockHttpServletRequestBuilder request) {
        return request.cookie(session).with(doubleSubmitCsrf());
    }

    private JsonNode json(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    private String passwordBody(String password) {
        return objectMapper.writeValueAsString(java.util.Map.of("password", password));
    }

    private ResultActions requestDelete(Cookie session, String password) throws Exception {
        return mockMvc.perform(as(session, post(DELETE_PATH))
                .contentType(MediaType.APPLICATION_JSON)
                .content(passwordBody(password)));
    }

    private long createPostingWithMemoAndHistory(LoginUser owner) throws Exception {
        JsonNode posting = json(mockMvc.perform(as(owner.session(), post("/api/job-postings"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                              "title": "求人",
                              "originalText": "求人の原文"
                            }
                            """))
                .andExpect(status().isCreated())
                .andReturn());
        long id = posting.get("id").asLong();

        mockMvc.perform(as(owner.session(), post("/api/job-postings/{id}/notes", id))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                              "content": "メモ"
                            }
                            """))
                .andExpect(status().isCreated());

        mockMvc.perform(as(owner.session(), patch("/api/job-postings/{id}/status", id))
                        .header("If-Match", "\"" + posting.get("version").asLong() + "\"")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                              "status": "APPLIED"
                            }
                            """))
                .andExpect(status().isOk());
        return id;
    }

    // ユーザーに関係するすべての行の数(ユーザー・求人・メモ・状態履歴・セッション)。
    private long rowsOf(LoginUser user) {
        return jdbcTemplate.queryForObject("""
                SELECT (SELECT count(*) FROM users WHERE id = ?)
                     + (SELECT count(*) FROM job_postings WHERE user_id = ?)
                     + (SELECT count(*) FROM job_posting_memos m JOIN job_postings j ON m.job_posting_id = j.id
                        WHERE j.user_id = ?)
                     + (SELECT count(*) FROM job_posting_status_histories h JOIN job_postings j ON h.job_posting_id = j.id
                        WHERE j.user_id = ?)
                     + (SELECT count(*) FROM spring_session WHERE principal_name = ?)
                """, Long.class, user.id(), user.id(), user.id(), user.id(), user.email());
    }

    // ---- 削除 ----

    @Test
    void 正しいパスワードで削除すると_204を返し_本人のデータとすべてのセッションを削除する() throws Exception {
        createPostingWithMemoAndHistory(userA);
        Cookie otherDevice = login(userA);

        requestDelete(userA.session(), PASSWORD).andExpect(status().isNoContent());

        assertEquals(0, rowsOf(userA));
        mockMvc.perform(get("/api/auth/me").cookie(userA.session())).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/auth/me").cookie(otherDevice)).andExpect(status().isUnauthorized());
    }

    @Test
    void 削除しても他のユーザーのデータとセッションは残る() throws Exception {
        createPostingWithMemoAndHistory(userA);
        createPostingWithMemoAndHistory(userB);
        long before = rowsOf(userB);

        requestDelete(userA.session(), PASSWORD).andExpect(status().isNoContent());

        assertEquals(before, rowsOf(userB));
        mockMvc.perform(get("/api/auth/me").cookie(userB.session())).andExpect(status().isOk());
    }

    @Test
    void 削除したメールアドレスで再び登録でき_ログインできる() throws Exception {
        requestDelete(userA.session(), PASSWORD).andExpect(status().isNoContent());

        LoginUser again = signup(userA.email());

        assertTrue(again.id() != userA.id(), "以前のユーザーIDが再利用されている");
        login(again);
    }

    // ---- 削除しない場合 ----

    @ParameterizedTest
    @ValueSource(strings = {"wrong-password", "ああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああ"})
    void パスワードが違うと_400を返し_何も削除しない(String wrongPassword) throws Exception {
        createPostingWithMemoAndHistory(userA);
        long before = rowsOf(userA);

        requestDelete(userA.session(), wrongPassword)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_PASSWORD"))
                .andExpect(jsonPath("$.fieldErrors.password").value("パスワードが正しくありません。"));

        assertEquals(before, rowsOf(userA));
        mockMvc.perform(get("/api/auth/me").cookie(userA.session())).andExpect(status().isOk());
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 65})
    void パスワードが空または64文字を超えると_400を返す(int length) throws Exception {
        requestDelete(userA.session(), "a".repeat(length))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fieldErrors.password").exists());

        assertEquals(1, jdbcTemplate.queryForObject("SELECT count(*) FROM users WHERE id = ?", Long.class, userA.id()));
    }

    @Test
    void 未ログインで削除すると_401を返す() throws Exception {
        mockMvc.perform(post(DELETE_PATH)
                        .with(doubleSubmitCsrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(passwordBody(PASSWORD)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void 画面のユーザーとセッションのユーザーが違うと_409を返し_削除しない() throws Exception {
        mockMvc.perform(as(userA.session(), post(DELETE_PATH))
                        .header("X-Expected-User-Id", String.valueOf(userB.id()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(passwordBody(PASSWORD)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("AUTH_CONTEXT_CHANGED"));

        assertEquals(1, jdbcTemplate.queryForObject("SELECT count(*) FROM users WHERE id = ?", Long.class, userA.id()));
    }

    @Test
    void 画面のユーザーとセッションのユーザーが同じなら削除する() throws Exception {
        mockMvc.perform(as(userA.session(), post(DELETE_PATH))
                        .header("X-Expected-User-Id", String.valueOf(userA.id()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(passwordBody(PASSWORD)))
                .andExpect(status().isNoContent());
    }

    // ---- 同時実行 ----

    @Test
    void 二つの端末から同時に削除しても_一方は204でもう一方は401になりサーバーエラーにしない() throws Exception {
        Cookie otherDevice = login(userA);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            Future<Integer> first = executor.submit(() -> {
                start.await();
                return requestDelete(userA.session(), PASSWORD).andReturn().getResponse().getStatus();
            });
            Future<Integer> second = executor.submit(() -> {
                start.await();
                return requestDelete(otherDevice, PASSWORD).andReturn().getResponse().getStatus();
            });

            start.countDown();

            List<Integer> statuses = new ArrayList<>(List.of(first.get(), second.get()));
            statuses.sort(null);
            assertEquals(List.of(204, 401), statuses);
        } finally {
            executor.shutdownNow();
        }

        assertEquals(0, rowsOf(userA));
    }

    @Test
    void 削除と求人の登録が同時に起きても_削除したユーザーのデータは残らない() throws Exception {
        int creators = 8;
        ExecutorService executor = Executors.newFixedThreadPool(creators + 1);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<Integer>> results = new ArrayList<>();
            for (int index = 0; index < creators; index++) {
                results.add(executor.submit(() -> {
                    start.await();
                    return mockMvc.perform(as(userA.session(), post("/api/job-postings"))
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content("""
                                        {
                                          "title": "求人",
                                          "originalText": "求人の原文"
                                        }
                                        """))
                            .andReturn().getResponse().getStatus();
                }));
            }
            Future<Integer> deletion = executor.submit(() -> {
                start.await();
                return requestDelete(userA.session(), PASSWORD).andReturn().getResponse().getStatus();
            });

            start.countDown();

            assertEquals(204, deletion.get());
            for (Future<Integer> result : results) {
                int status = result.get();
                assertTrue(status == 201 || status == 401, "想定外の応答: " + status);
            }
        } finally {
            executor.shutdownNow();
        }

        assertEquals(0, rowsOf(userA));
    }
}
