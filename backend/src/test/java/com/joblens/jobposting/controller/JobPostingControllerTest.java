package com.joblens.jobposting.controller;

import com.joblens.jobposting.domain.JobPosting;
import com.joblens.jobposting.repository.JobPostingRepository;
import com.joblens.jobposting.domain.ApplicationStatus;
import com.joblens.AuthenticatedMockMvcConfiguration;
import com.joblens.TestUsers;
import com.joblens.TestcontainersConfiguration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.context.annotation.Import;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.List;
import java.util.stream.IntStream;
import java.util.stream.Stream;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.aMapWithSize;
import static org.hamcrest.Matchers.not;

/**
 * 実際のSpringアプリケーションコンテキストを実行し、
 * HTTPリクエストがControllerから例外ハンドラーまで正しく流れるか確認する
 *
 * 単純なメソッド単位のテストではなく、DB、Controller、Service、
 * GlobalExceptionHandlerが一緒に動く統合テストといえる
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, AuthenticatedMockMvcConfiguration.class})
class JobPostingControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JobPostingRepository jobPostingRepository;

    @Autowired
    private TestUsers testUsers;

    /**
    * 各テストが以前のテストデータの影響を受けないよう、
    * 一時的なテストDBの求人データを初期化する
    *
    * Testcontainersが作ったDBにだけ実行されるため、
    * 開発用のPostgreSQLのデータは影響を受けない
    */
    @BeforeEach
    void setUp() {
        /*
         * 各テストが以前のテストデータの影響を受けないよう、
         * テスト実行前に求人データを初期化する
         */
        jobPostingRepository.deleteAll();
    }

    @Nested
    class JobPostingCrudTests {
        @Test
        void 存在しない求人を取得すると_404を返す() throws Exception {
                mockMvc.perform(get("/api/job-postings/{id}", 9999L))
                                .andExpect(status().isNotFound())
                                .andExpect(jsonPath("$.status").value(404))
                                .andExpect(jsonPath("$.code")
                                                .value("JOB_POSTING_NOT_FOUND"))
                                .andExpect(jsonPath("$.message")
                                                .value("求人が見つかりません。id=9999"))
                                .andExpect(jsonPath("$.path")
                                                .value("/api/job-postings/9999"));
        }

        // JsonPathは応答JSONの特定の値を検査する。$はJSON全体を表す
        @Test
        void タイトルと原文が空なら_400を返す() throws Exception {
                String requestBody = """
                                {
                                  "companyName": "テスト株式会社",
                                  "title": "",
                                  "sourceUrl": "https://example.com/jobs/invalid",
                                  "originalText": ""
                                }
                                """;

                mockMvc.perform(post("/api/job-postings")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(requestBody))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.status").value(400))
                                .andExpect(jsonPath("$.code")
                                                .value("VALIDATION_FAILED"))
                                .andExpect(jsonPath("$.fieldErrors.title")
                                                .value("求人タイトルは必須です。"))
                                .andExpect(jsonPath("$.fieldErrors.originalText")
                                                .value("求人原文は必須です。"));
                // mockMvcは実際のブラウザーやcurl.exeなしでSpring MVCに偽のHTTPリクエストを送る。
        }

        @Test
        void 作成時に月給の逆範囲のメッセージをsalaryMaxに返す() throws Exception {
                mockMvc.perform(post("/api/job-postings")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {
                                          "title": "バックエンドエンジニア",
                                          "originalText": "JavaとSpring Bootの開発業務",
                                          "salaryMin": 500000,
                                          "salaryMax": 300000
                                        }
                                        """))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.status").value(400))
                                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                                .andExpect(jsonPath("$.fieldErrors", aMapWithSize(1)))
                                .andExpect(jsonPath("$.fieldErrors.salaryMax")
                                                .value("最低月給を最高月給より大きくすることはできません。"));

                assertEquals(0L, jobPostingRepository.count());
        }

        @Test
        void 編集時に月給の逆範囲のメッセージを返しデータとversionを維持する() throws Exception {
                JobPosting saved = jobPostingRepository.saveAndFlush(
                                new JobPosting(testUsers.defaultUserId(), "テスト株式会社", "既存タイトル", null,
                                                "既存の求人原文", 300000, 500000, null));
                Long version = saved.getVersion();

                mockMvc.perform(put("/api/job-postings/{id}", saved.getId())
                                .header(HttpHeaders.IF_MATCH, "\"" + version + "\"")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {
                                          "title": "変更タイトル",
                                          "originalText": "変更された求人原文",
                                          "salaryMin": 500000,
                                          "salaryMax": 300000
                                        }
                                        """))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                                .andExpect(jsonPath("$.fieldErrors", aMapWithSize(1)))
                                .andExpect(jsonPath("$.fieldErrors.salaryMax")
                                                .value("最低月給を最高月給より大きくすることはできません。"));

                JobPosting unchanged = jobPostingRepository.findById(saved.getId()).orElseThrow();
                assertEquals("既存タイトル", unchanged.getTitle());
                assertEquals("既存の求人原文", unchanged.getOriginalText());
                assertEquals(300000, unchanged.getSalaryMin());
                assertEquals(500000, unchanged.getSalaryMax());
                assertEquals(version, unchanged.getVersion());
        }

        @Test
        void タイトルの欠落と月給の逆範囲のメッセージを一緒に返す() throws Exception {
                mockMvc.perform(post("/api/job-postings")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {
                                          "title": "",
                                          "originalText": "JavaとSpring Bootの開発業務",
                                          "salaryMin": 500000,
                                          "salaryMax": 300000
                                        }
                                        """))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                                .andExpect(jsonPath("$.fieldErrors", aMapWithSize(2)))
                                .andExpect(jsonPath("$.fieldErrors.title").value("求人タイトルは必須です。"))
                                .andExpect(jsonPath("$.fieldErrors.salaryMax")
                                                .value("最低月給を最高月給より大きくすることはできません。"));
        }

        @Test
        void 正しく求人を作成すると_201を返す() throws Exception {
                String requestBody = """
                                {
                                  "companyName": "テスト株式会社",
                                  "title": "Webエンジニア求人中",
                                  "sourceUrl": "https://example.com/jobs/check",
                                  "originalText": "難しい知識は後からでOK！まずは「チェックと報告」から",
                                  "applicationDeadline": "2026-12-31"
                                }
                                """;

                mockMvc.perform(post("/api/job-postings")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(requestBody))
                                .andExpect(status().isCreated())
                                .andExpect(jsonPath("$.title")
                                                .value("Webエンジニア求人中"))
                                .andExpect(jsonPath("$.originalText")
                                                .value("難しい知識は後からでOK！まずは「チェックと報告」から"))
                                .andExpect(jsonPath("$.applicationDeadline")
                                                .value("2026-12-31"));
                // mockMvcは実際のブラウザーやcurl.exeなしでSpring MVCに偽のHTTPリクエストを送る。
        }

        @Test
        void 求人を編集すると変更内容と_201を返す() throws Exception {
                /*
                 * 編集するには既存のデータが先に必要なため、
                 * Repositoryを通じてテスト用の求人を保存する。
                 */
                JobPosting savedJobPosting = jobPostingRepository.saveAndFlush(
                                new JobPosting(
                                                testUsers.defaultUserId(),
                                                "既存の会社",
                                                "既存のタイトル",
                                                "https://example.com/old",
                                                "既存の求人原文",
                                                null,
                                                null,
                                                LocalDate.parse("2026-10-31")));

                Long savedVersion = savedJobPosting.getVersion();

                String requestBody = """
                                {
                                  "companyName": "札幌クラウド株式会社",
                                  "title": "Java・AWSエンジニア",
                                  "sourceUrl": "https://example.com/jobs/updated",
                                  "originalText": "Spring BootとAWSを利用した開発業務です。",
                                  "salaryMin": null,
                                  "salaryMax": null
                                }
                                """;

                mockMvc.perform(put(
                                "/api/job-postings/{id}",
                                savedJobPosting.getId())
                                .header(
                                                HttpHeaders.IF_MATCH,
                                                "\"" + savedVersion + "\"")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(requestBody))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.id")
                                                .value(savedJobPosting.getId()))
                                .andExpect(header().string(
                                                HttpHeaders.ETAG,
                                                "\"" + (savedVersion + 1) + "\""))
                                .andExpect(jsonPath("$.companyName")
                                                .value("札幌クラウド株式会社"))
                                .andExpect(jsonPath("$.title")
                                                .value("Java・AWSエンジニア"))
                                .andExpect(jsonPath("$.sourceUrl")
                                                .value("https://example.com/jobs/updated"));

                JobPosting updatedJobPosting = jobPostingRepository
                                .findById(savedJobPosting.getId())
                                .orElseThrow();

                assertEquals(
                                "Java・AWSエンジニア",
                                updatedJobPosting.getTitle());

                assertEquals(
                                savedVersion + 1,
                                updatedJobPosting.getVersion());

                /**
                 * HTTP応答だけが編集されたように見えるのではなく、
                 * PostgreSQLの中の実際のデータも変わったか検査する。
                 *
                 * また、Optimistic Lockingが正しく動作して
                 * versionが1増えたかも確認する。
                 */
        }

        @Test
        void 求人を削除すると_204を返しDBから削除される() throws Exception {
                JobPosting savedJobPosting = jobPostingRepository.save(
                                new JobPosting(
                                                testUsers.defaultUserId(),
                                                "削除テストの会社",
                                                "削除テストの求人",
                                                "https://example.com/delete",
                                                "削除する求人の原文",
                                                null,
                                                null,
                                                null));

                Long jobPostingId = savedJobPosting.getId();

                /*
                 * 削除の成功時は応答の本文が不要なため、
                 * APIは204 No Contentを返す。
                 */
                mockMvc.perform(delete(
                                "/api/job-postings/{id}",
                                jobPostingId))
                                .andExpect(status().isNoContent());

                /*
                 * ステータスコードだけでなく、実際のDBでもデータが削除されたか確認する。
                 */
                boolean exists = jobPostingRepository.existsById(jobPostingId);

                assertFalse(exists);
        }

        @Test
        void 求人を登録すると既定の応募ステータスはSAVEDである() throws Exception {

                // 正しい求人登録リクエスト
                String requestBody = """
                                {
                                  "companyName": "既定ステータステストの会社",
                                  "title": "Javaバックエンドエンジニア",
                                  "sourceUrl": "https://example.com/default-status",
                                  "originalText": "新規求人の既定ステータステスト用の原文"
                                }
                                """;

                // POSTリクエスト後に応答のステータスを確認
                mockMvc.perform(post("/api/job-postings")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(requestBody))
                                .andExpect(status().isCreated())
                                .andExpect(jsonPath("$.id").exists())
                                .andExpect(jsonPath("$.applicationStatus")
                                                .value("SAVED"));

                // DBに実際に保存された求人を取得
                JobPosting savedJobPosting = jobPostingRepository
                                .findAll()
                                .stream()
                                .findFirst()
                                .orElseThrow();

                // DBでも既定のステータスがSAVEDか確認
                assertEquals(
                                ApplicationStatus.SAVED,
                                savedJobPosting.getApplicationStatus());
        }
    }

    /**
     * 1件のサイズと1回の一覧取得件数に上限があり、
     * 大きなデータの保存や一覧取得でサーバーの資源を使い切れないことを確認する。
     */
    @Nested
    class InputAndPageSizeLimitTests {
        private static final int MAX_SOURCE_URL_LENGTH = 2048;
        private static final int MAX_ORIGINAL_TEXT_LENGTH = 20000;

        private String requestBody(String sourceUrl, String originalText) {
                return """
                                {
                                  "title": "上限確認用の求人",
                                  "sourceUrl": "%s",
                                  "originalText": "%s"
                                }
                                """.formatted(sourceUrl, originalText);
        }

        // 指定した長さちょうどのURLを作る。
        private String urlOfLength(int length) {
                String prefix = "https://example.com/";
                return prefix + "a".repeat(length - prefix.length());
        }

        @Test
        void 作成時にURLと原文が上限と同じ長さなら_201を返す() throws Exception {
                mockMvc.perform(post("/api/job-postings")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(requestBody(
                                                urlOfLength(MAX_SOURCE_URL_LENGTH),
                                                "あ".repeat(MAX_ORIGINAL_TEXT_LENGTH))))
                                .andExpect(status().isCreated());
        }

        @Test
        void 作成時にURLが上限を超えると_400を返し保存しない() throws Exception {
                mockMvc.perform(post("/api/job-postings")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(requestBody(urlOfLength(MAX_SOURCE_URL_LENGTH + 1), "原文")))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                                .andExpect(jsonPath("$.fieldErrors.sourceUrl").exists());

                assertEquals(0, jobPostingRepository.count());
        }

        @Test
        void 作成時に原文が上限を超えると_400を返し保存しない() throws Exception {
                mockMvc.perform(post("/api/job-postings")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(requestBody(
                                                "https://example.com/jobs/1",
                                                "あ".repeat(MAX_ORIGINAL_TEXT_LENGTH + 1))))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                                .andExpect(jsonPath("$.fieldErrors.originalText").exists());

                assertEquals(0, jobPostingRepository.count());
        }

        @Test
        void 編集時にURLと原文が上限を超えると_400を返しデータを維持する() throws Exception {
                JobPosting saved = jobPostingRepository.saveAndFlush(
                                new JobPosting(testUsers.defaultUserId(), null, "既存タイトル",
                                                "https://example.com/old", "既存の原文", null, null, null));

                mockMvc.perform(put("/api/job-postings/{id}", saved.getId())
                                .header(HttpHeaders.IF_MATCH, "\"" + saved.getVersion() + "\"")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(requestBody(
                                                urlOfLength(MAX_SOURCE_URL_LENGTH + 1),
                                                "あ".repeat(MAX_ORIGINAL_TEXT_LENGTH + 1))))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.fieldErrors.sourceUrl").exists())
                                .andExpect(jsonPath("$.fieldErrors.originalText").exists());

                JobPosting unchanged = jobPostingRepository.findById(saved.getId()).orElseThrow();
                assertEquals("https://example.com/old", unchanged.getSourceUrl());
                assertEquals("既存の原文", unchanged.getOriginalText());
        }

        // ---- URLのスキーム ----

        private static final String INVALID_SOURCE_URL_MESSAGE =
                        "http://またはhttps://で始まるURLを、空白を含めずに入力してください。";

        @Test
        void 作成時にhttpとhttps以外のURLなら_400を返し保存しない() throws Exception {
                mockMvc.perform(post("/api/job-postings")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(requestBody("javascript:alert(1)", "原文")))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                                .andExpect(jsonPath("$.fieldErrors.sourceUrl").value(INVALID_SOURCE_URL_MESSAGE));

                assertEquals(0, jobPostingRepository.count());
        }

        @Test
        void 編集時にhttpとhttps以外のURLなら_400を返しデータを維持する() throws Exception {
                JobPosting saved = jobPostingRepository.saveAndFlush(
                                new JobPosting(testUsers.defaultUserId(), null, "既存タイトル",
                                                "https://example.com/old", "既存の原文", null, null, null));

                mockMvc.perform(put("/api/job-postings/{id}", saved.getId())
                                .header(HttpHeaders.IF_MATCH, "\"" + saved.getVersion() + "\"")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(requestBody("javascript:alert(1)", "原文")))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.fieldErrors.sourceUrl").value(INVALID_SOURCE_URL_MESSAGE));

                JobPosting unchanged = jobPostingRepository.findById(saved.getId()).orElseThrow();
                assertEquals("https://example.com/old", unchanged.getSourceUrl());
        }

        @Test
        void 検証導入前の不正なURLは正しいURLに直せば編集できる() throws Exception {
                JobPosting saved = jobPostingRepository.saveAndFlush(
                                new JobPosting(testUsers.defaultUserId(), null, "既存タイトル",
                                                "www.example.com", "既存の原文", null, null, null));

                mockMvc.perform(put("/api/job-postings/{id}", saved.getId())
                                .header(HttpHeaders.IF_MATCH, "\"" + saved.getVersion() + "\"")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(requestBody("https://www.example.com", "既存の原文")))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.sourceUrl").value("https://www.example.com"));
        }

        @Test
        void 検証導入前の不正なURLがあっても応募ステータスは変更できる() throws Exception {
                JobPosting saved = jobPostingRepository.saveAndFlush(
                                new JobPosting(testUsers.defaultUserId(), null, "既存タイトル",
                                                "www.example.com", "既存の原文", null, null, null));

                mockMvc.perform(patch("/api/job-postings/{id}/status", saved.getId())
                                .header(HttpHeaders.IF_MATCH, "\"" + saved.getVersion() + "\"")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                                {
                                                  "status": "APPLIED"
                                                }
                                                """))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.applicationStatus").value("APPLIED"));
        }

        @Test
        void ページサイズを上限より大きく要求しても100件までしか返さない() throws Exception {
                List<JobPosting> postings = IntStream.rangeClosed(1, 101)
                                .mapToObj(i -> new JobPosting(testUsers.defaultUserId(), null, "求人" + i,
                                                null, "原文" + i, null, null, null))
                                .toList();
                jobPostingRepository.saveAll(postings);

                mockMvc.perform(get("/api/job-postings").param("size", "2000"))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.content.length()").value(100))
                                .andExpect(jsonPath("$.size").value(100))
                                .andExpect(jsonPath("$.totalElements").value(101))
                                .andExpect(jsonPath("$.totalPages").value(2));
        }
    }

    @Nested
    class SearchAndPaginationTests {
        @Test
        void キーワードで求人を検索できる() throws Exception {
                jobPostingRepository.save(
                                new JobPosting(
                                                testUsers.defaultUserId(),
                                                "北海道クラウド株式会社",
                                                "AWSクラウドエンジニア",
                                                "https://example.com/aws",
                                                "AWS環境の設計と構築を担当します。",
                                                null,
                                                null,
                                                null));

                jobPostingRepository.save(
                                new JobPosting(
                                                testUsers.defaultUserId(),
                                                "札幌Java株式会社",
                                                "Javaバックエンドエンジニア",
                                                "https://example.com/java",
                                                "Spring Bootを利用した開発を担当します。",
                                                null,
                                                null,
                                                null));

                mockMvc.perform(get("/api/job-postings")
                                .param("keyword", "AWS")
                                .param("page", "0")
                                .param("size", "10"))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.content.length()").value(1))
                                .andExpect(jsonPath("$.content[0].title")
                                                .value("AWSクラウドエンジニア"))
                                .andExpect(jsonPath("$.totalElements").value(1));

        }

        @Test
        void 求人をページ単位で取得できる() throws Exception {
                jobPostingRepository.save(
                                new JobPosting(testUsers.defaultUserId(), "会社 1", "求人 1", null, "原文 1", null, null, null));
                jobPostingRepository.save(
                                new JobPosting(testUsers.defaultUserId(), "会社 2", "求人 2", null, "原文 2", null, null, null));
                jobPostingRepository.save(
                                new JobPosting(testUsers.defaultUserId(), "会社 3", "求人 3", null, "原文 3", null, null, null));

                mockMvc.perform(get("/api/job-postings")
                                .param("page", "0")
                                .param("size", "2"))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.content.length()").value(2))
                                .andExpect(jsonPath("$.page").value(0))
                                .andExpect(jsonPath("$.size").value(2))
                                .andExpect(jsonPath("$.totalElements").value(3))
                                .andExpect(jsonPath("$.totalPages").value(2))
                                .andExpect(jsonPath("$.first").value(true))
                                .andExpect(jsonPath("$.last").value(false));
        }

        @Test
        void 大文字小文字に関係なく絞り込める() throws Exception {

                jobPostingRepository.save(
                                new JobPosting(testUsers.defaultUserId(), "会社1", "Spring Backend Engineer", null, "原文1", null, null, null));

                mockMvc.perform(get("/api/job-postings")
                                .param("keyword", "spring"))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.content.length()").value(1))
                                .andExpect(jsonPath("$.content[0].title").value("Spring Backend Engineer"));
        }

        @Test
        void ワイルドカードをエスケープできる() throws Exception {

                jobPostingRepository.save(
                                new JobPosting(testUsers.defaultUserId(), "会社1", "100% Remote Engineer", null, "原文1", null, null, null));
                jobPostingRepository.save(
                                new JobPosting(testUsers.defaultUserId(), "会社2", "Java Developer", null, "原文2", null, null, null));

                mockMvc.perform(get("/api/job-postings")
                                .param("keyword", "%"))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.content.length()").value(1))
                                .andExpect(jsonPath("$.content[0].title").value("100% Remote Engineer"));
        }

        @Test
        void 応募ステータスとキーワードで絞り込める() throws Exception {

                jobPostingRepository.save(
                                new JobPosting(testUsers.defaultUserId(), "会社1", "求人1", null, "原文1", null, null, null));

                JobPosting appliedJobPosting = new JobPosting(testUsers.defaultUserId(), "会社2", "求人2", null, "原文2", null, null, null);
                appliedJobPosting.changeApplicationStatus(ApplicationStatus.APPLIED);
                jobPostingRepository.save(appliedJobPosting);

                mockMvc.perform(get("/api/job-postings")
                                .param("keyword", "求人")
                                .param("status", "APPLIED"))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.content.length()").value(1))
                                .andExpect(jsonPath("$.content[0].applicationStatus").value("APPLIED"))
                                .andExpect(jsonPath("$.content[0].title").value("求人2"));
        }

        @Test
        void 応募ステータスで絞り込める() throws Exception {

                jobPostingRepository.save(
                                new JobPosting(testUsers.defaultUserId(), "会社1", "求人1", null, "原文1", null, null, null));

                JobPosting appliedJobPosting = new JobPosting(testUsers.defaultUserId(), "会社2", "求人2", null, "原文2", null, null, null);
                appliedJobPosting.changeApplicationStatus(ApplicationStatus.APPLIED);
                jobPostingRepository.save(appliedJobPosting);

                JobPosting secondAppliedJobPosting = new JobPosting(testUsers.defaultUserId(), "会社2", "求人2", null, "原文2", null, null, null);
                secondAppliedJobPosting.changeApplicationStatus(ApplicationStatus.APPLIED);
                jobPostingRepository.save(secondAppliedJobPosting);

                mockMvc.perform(get("/api/job-postings")
                                .param("status", "APPLIED"))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.content.length()").value(2))
                                .andExpect(jsonPath("$.content[0].applicationStatus").value("APPLIED"))
                                .andExpect(jsonPath("$.content[1].applicationStatus").value("APPLIED"));
        }

        @Test
        void 無効なステータスにはBad_Requestを返す() throws Exception {

            mockMvc.perform(get("/api/job-postings?status=INVALID"))
                            .andExpect(status().isBadRequest());
        }

        @Test
        void ステータスとページネーションで絞り込める() throws Exception {
                JobPosting appliedJobPosting = new JobPosting(testUsers.defaultUserId(), "会社1", "求人1", null, "原文1", null, null, null);
                appliedJobPosting.changeApplicationStatus(ApplicationStatus.APPLIED);
                jobPostingRepository.save(appliedJobPosting);

                JobPosting secondAppliedJobPosting = new JobPosting(testUsers.defaultUserId(), "会社2", "求人2", null, "原文2", null, null, null);
                secondAppliedJobPosting.changeApplicationStatus(ApplicationStatus.APPLIED);
                jobPostingRepository.save(secondAppliedJobPosting);

                JobPosting thirdAppliedJobPosting = new JobPosting(testUsers.defaultUserId(), "会社3", "求人3", null, "原文3", null, null, null);
                thirdAppliedJobPosting.changeApplicationStatus(ApplicationStatus.APPLIED);
                jobPostingRepository.save(thirdAppliedJobPosting);

                jobPostingRepository.save(
                                new JobPosting(testUsers.defaultUserId(), "会社4", "100% Remote Engineer", null, "原文4", null, null, null));
                jobPostingRepository.save(
                                new JobPosting(testUsers.defaultUserId(), "会社5", "Java Developer", null, "原文5", null, null, null));
                        
                mockMvc.perform(get("/api/job-postings")
                            .param("status", "APPLIED")
                            .param("page", "0")
                            .param("size", "2"))
                            .andExpect(status().isOk())
                            .andExpect(jsonPath("$.page").value(0))
                            .andExpect(jsonPath("$.content.length()").value(2))
                            .andExpect(jsonPath("$.content[0].applicationStatus").value("APPLIED"))
                            .andExpect(jsonPath("$.content[1].applicationStatus").value("APPLIED"))
                            .andExpect(jsonPath("$.totalElements").value(3));
        }
    }

    @Nested
    class SortingTests {
        @Test
        void 許可一覧にない項目の並び替え要求は拒否される() throws Exception {
                mockMvc.perform(get("/api/job-postings").param("sort", "id,asc"))
                            .andExpect(status().isBadRequest())
                            .andExpect(jsonPath("$.status").value(400))   
                            .andExpect(jsonPath("$.code").value("INVALID_SORT_FIELD"))
                            .andExpect(jsonPath("$.message").value("許可されていない並び替え項目です: id"));
        }

        @Test
        void 会社名での並び替えが動くか確認する() throws Exception {
                jobPostingRepository.save(
                                new JobPosting(testUsers.defaultUserId(), "B", "Java Developer", null, "原文1", null, null, null));
                jobPostingRepository.save(
                                new JobPosting(testUsers.defaultUserId(), "A", "Python Developer", null, "原文2", null, null, null));
                jobPostingRepository.save(
                                new JobPosting(testUsers.defaultUserId(), "C", "C++ Developer", null, "原文3", null, null, null));
        
                mockMvc.perform(get("/api/job-postings").param("sort", "companyName,asc"))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.content[0].companyName").value("A"))
                                .andExpect(jsonPath("$.content[1].companyName").value("B"))
                                .andExpect(jsonPath("$.content[2].companyName").value("C"));
        }

        @Test
        void キーワードと応募ステータスで絞り込み会社名順に並び替えられる() throws Exception {
                JobPosting charlie = jobPostingRepository.save(
                                new JobPosting(testUsers.defaultUserId(), "Charlie Company","AWS Engineer","https://example.com/charlie","Cloud", 
                                                null, null, null));
                JobPosting alpha = jobPostingRepository.save(
                                new JobPosting(testUsers.defaultUserId(), "Alpha Company", "AWS Engineer", "https://example.com/alpha", "Cloud", null,
                                                null, null));
                JobPosting wrongKeyword = jobPostingRepository.save(
                                new JobPosting(testUsers.defaultUserId(), "Beta Company", "JAVA Engineer", "https://example.com/beta", "Spring", null,
                                                null, null));
                JobPosting wrongStatus = jobPostingRepository.save(
                                new JobPosting(testUsers.defaultUserId(), "Delta Company", "AWS Engineer", "https://example.com/delta", "Cloud", null,
                                                null, null));
            
                charlie.changeApplicationStatus(ApplicationStatus.APPLIED);
                alpha.changeApplicationStatus(ApplicationStatus.APPLIED);
                wrongKeyword.changeApplicationStatus(ApplicationStatus.APPLIED);
                wrongStatus.changeApplicationStatus(ApplicationStatus.SAVED);

                jobPostingRepository.saveAll(List.of(charlie, alpha, wrongKeyword, wrongStatus));

                mockMvc.perform(get("/api/job-postings")
                                .param("keyword", "AWS")
                                .param("status", "APPLIED")
                                .param("sort", "companyName,asc"))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.content.length()").value(2))
                                .andExpect(jsonPath("$.content[0].companyName").value("Alpha Company"))
                                .andExpect(jsonPath("$.content[1].companyName").value("Charlie Company"));
        }
    }

    @Nested
    class ApplicationStatusTests {
        @Test
        void 求人の応募ステータスを変更すると応答とDBに反映される() throws Exception {
                // テスト用の求人をDBに保存
                JobPosting savedJobPosting = jobPostingRepository.saveAndFlush(
                                new JobPosting(testUsers.defaultUserId(), "ステータス変更テストの会社", "バックエンドエンジニア", "https://example.com/status",
                                                "応募ステータス変更テスト用の原文", null, null,
                                                null));
                Long savedVersion = savedJobPosting.getVersion();

                // SAVEDから別の応募ステータスへ変更するリクエスト
                String requestBody = """
                                {
                                  "status": "APPLIED"
                                }
                                """;

                // PATCH APIを呼んだ後、HTTP応答を確認
                mockMvc.perform(patch(
                                "/api/job-postings/{id}/status",
                                savedJobPosting.getId())
                                .header(HttpHeaders.IF_MATCH, "\"" + savedVersion + "\"")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(requestBody))
                                .andExpect(status().isOk())
                                .andExpect(header().string(HttpHeaders.ETAG, "\"" + (savedVersion + 1) + "\""))
                                .andExpect(jsonPath("$.id")
                                                .value(savedJobPosting.getId()))
                                .andExpect(jsonPath("$.version").value(savedVersion + 1))
                                .andExpect(jsonPath("$.applicationStatus")
                                                .value("APPLIED"));

                JobPosting updatedJobPosting = jobPostingRepository
                                .findById(savedJobPosting.getId())
                                .orElseThrow();

                assertEquals(
                                ApplicationStatus.APPLIED,
                                updatedJobPosting.getApplicationStatus());
                assertEquals(savedVersion + 1, updatedJobPosting.getVersion());

                mockMvc.perform(get("/api/job-postings/{id}", savedJobPosting.getId()))
                                .andExpect(status().isOk())
                                .andExpect(header().string(HttpHeaders.ETAG, "\"" + (savedVersion + 1) + "\""))
                                .andExpect(jsonPath("$.version").value(savedVersion + 1))
                                .andExpect(jsonPath("$.applicationStatus").value("APPLIED"));
        }

        @Test
        void 存在しない求人の応募ステータスを変更すると_404を返す() throws Exception {
                String requestBody = """
                                {
                                  "status": "APPLIED"
                                }
                                """;
                mockMvc.perform(patch(
                                "/api/job-postings/{id}/status",
                                9999L)
                                .header(HttpHeaders.IF_MATCH, "\"0\"")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(requestBody))
                                .andExpect(status().isNotFound())
                                .andExpect(jsonPath("$.status").value(404))
                                .andExpect(jsonPath("$.code").value("JOB_POSTING_NOT_FOUND"))
                                .andExpect(jsonPath("$.message").value("求人が見つかりません。id=9999"))
                                .andExpect(jsonPath("$.path").value("/api/job-postings/9999/status"));
        }

        @Test
        void 応募ステータスがないと_400を返しDBは変更されない() throws Exception {

                // 既定のステータスがSAVEDの状態で保存
                JobPosting savedJobPosting = jobPostingRepository.save(
                                new JobPosting(
                                                testUsers.defaultUserId(),
                                                "検証テストの会社",
                                                "バックエンドエンジニア",
                                                "https://example.com/status-validation",
                                                "応募ステータス検証テスト用の原文",
                                                null,
                                                null,
                                                null));

                // statusの項目がないリクエスト
                String requestBody = """
                                {
                                }
                                """;

                // PATCHリクエスト後に検証エラーを確認
                mockMvc.perform(patch(
                                "/api/job-postings/{id}/status",
                                savedJobPosting.getId())
                                .header(HttpHeaders.IF_MATCH, "\"" + savedJobPosting.getVersion() + "\"")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(requestBody))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.status")
                                                .value(400))
                                .andExpect(jsonPath("$.code")
                                                .value("VALIDATION_FAILED"))
                                .andExpect(jsonPath("$.fieldErrors.status").exists());

                // 失敗したリクエストがDBの状態を変更していないか確認
                JobPosting unchangedJobPosting = jobPostingRepository
                                .findById(savedJobPosting.getId())
                                .orElseThrow();
                assertEquals(
                                ApplicationStatus.SAVED,
                                unchangedJobPosting.getApplicationStatus());

        }

        @Test
        void 応募ステータスごとの求人数を取得できる() throws Exception {
                // 1. SAVEDの求人2件
                jobPostingRepository.save(
                                new JobPosting(testUsers.defaultUserId(), "会社1", "求人1", null, "原文1", null, null, null));
                jobPostingRepository.save(
                                new JobPosting(testUsers.defaultUserId(), "会社2", "求人2", null, "原文2", null, null, null));

                // 2. APPLIEDの求人1件
                JobPosting appliedJobPosting = new JobPosting(testUsers.defaultUserId(), "会社3", "求人3", null, "原文3", null, null, null);
                appliedJobPosting.changeApplicationStatus(ApplicationStatus.APPLIED);
                jobPostingRepository.save(appliedJobPosting);

                // 3. INTERVIEWINGの求人1件
                JobPosting interviewingJobPosting = new JobPosting(testUsers.defaultUserId(), "会社4", "求人4", null, "原文4", null, null, null);
                interviewingJobPosting.changeApplicationStatus(ApplicationStatus.INTERVIEWING);
                jobPostingRepository.save(interviewingJobPosting);

                // 4. OFFEREDの求人1件
                JobPosting offeredJobPosting = new JobPosting(testUsers.defaultUserId(), "会社5", "求人5", null, "原文5", null, null, null);
                offeredJobPosting.changeApplicationStatus(ApplicationStatus.OFFERED);
                jobPostingRepository.save(offeredJobPosting);

                // 5. ステータス集計APIを呼ぶ
                mockMvc.perform(get("/api/job-postings/status-summary"))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.saved").value(2))
                                .andExpect(jsonPath("$.applied").value(1))
                                .andExpect(jsonPath("$.interviewing").value(1))
                                .andExpect(jsonPath("$.offered").value(1))
                                .andExpect(jsonPath("$.rejected").value(0));
        }
    }

    @Nested
    class AnalysisTests {
        @Test
        void 句読点付きの技術名だけを配列で返す() throws Exception {
                JobPosting posting = jobPostingRepository.save(
                                new JobPosting(testUsers.defaultUserId(), "テスト会社", "開発者", null,
                                                "Java. AWS. Docker. C++. JavaScript C# Java.util AWS.Lambda",
                                                null, null, null));

                mockMvc.perform(get("/api/job-postings/{id}/analysis", posting.getId()))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.skills").isArray())
                                .andExpect(jsonPath("$.skills", hasSize(4)))
                                .andExpect(jsonPath("$.skills[0]").value("Java"))
                                .andExpect(jsonPath("$.skills[1]").value("AWS"))
                                .andExpect(jsonPath("$.skills[2]").value("Docker"))
                                .andExpect(jsonPath("$.skills[3]").value("C++"));
        }

        @Test
        void 技術を含む求人でその求人の技術スタックを確認できる() throws Exception {
                JobPosting charlie = jobPostingRepository.save(
                                new JobPosting(testUsers.defaultUserId(), "Charlie Company", "AWS Engineer", "https://example.com/charlie", "JavaとSpring Bootを使ったバックエンド開発です", 
                                                null, null, null));
                JobPosting alpha = jobPostingRepository.save(
                                new JobPosting(testUsers.defaultUserId(), "Alpha Company", "AWS Engineer", "https://example.com/alpha", "AWSとDockerを利用します。", 
                                                null, null, null));

                mockMvc.perform(get("/api/job-postings/{id}/analysis", charlie.getId()))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.skills[0]").value("Java" ))
                                .andExpect(jsonPath("$.skills[1]").value("Spring Boot"));
                mockMvc.perform(get("/api/job-postings/{id}/analysis", alpha.getId()))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.skills[0]").value("AWS"))
                                .andExpect(jsonPath("$.skills[1]").value("Docker"));
            
        }

        @Test
        void 技術の記載がない求人では空を返す() throws Exception {
                JobPosting charlie = jobPostingRepository.save(
                                new JobPosting(testUsers.defaultUserId(), "Charlie Company", "AWS Engineer", "https://example.com/charlie",
                                                "営業部求人中", null, null, null));
                mockMvc.perform(get("/api/job-postings/{id}/analysis", charlie.getId()))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.skills").isEmpty());
        }

        @Test
        void JavaScriptを含む内容を取得してもJavaを抽出しない() throws Exception {
                JobPosting charlie = jobPostingRepository.save(
                                new JobPosting(testUsers.defaultUserId(), "Charlie Company", "AWS Engineer", "https://example.com/charlie",
                                                "JavaScript開発者求人中", null, null, null));
                mockMvc.perform(get("/api/job-postings/{id}/analysis", charlie.getId()))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.skills").isEmpty());
        }

        @Test
        void 内容にCppとCの両方があるときCppとCを区別して抽出する() throws Exception {
                JobPosting charlie = jobPostingRepository.save(
                                new JobPosting(testUsers.defaultUserId(), "Charlie Company", "AWS Engineer", "https://example.com/charlie",
                                                "CとC++を全部開発できる人は大歓迎", null, null, null));
                mockMvc.perform(get("/api/job-postings/{id}/analysis", charlie.getId()))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.skills", hasSize(2)))
                                .andExpect(jsonPath("$.skills[0]").value("C"))
                                .andExpect(jsonPath("$.skills[1]").value("C++"));
        }

        @Test
        void 内容にCppだけがあるときCを抽出しない() throws Exception {
                JobPosting charlie = jobPostingRepository.save(
                                new JobPosting(testUsers.defaultUserId(), "Charlie Company", "AWS Engineer", "https://example.com/charlie",
                                                "C++を開発できる人は大歓迎", null, null, null));
                mockMvc.perform(get("/api/job-postings/{id}/analysis", charlie.getId()))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.skills", hasSize(1)))
                                .andExpect(jsonPath("$.skills[0]").value("C++"));
        }
        @Test
        void 固定残業代の判定と根拠と技術名を一つの応答で返す() throws Exception {
                JobPosting posting = jobPostingRepository.save(
                                new JobPosting(testUsers.defaultUserId(), "テスト会社", "開発者", null,
                                                "必須スキル・条件\nJavaとDockerの実務経験\n給与\n月給30万円（固定残業代40時間分を含む）\n超過分は別途支給",
                                                null, null, null));

                mockMvc.perform(get("/api/job-postings/{id}/analysis", posting.getId()))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.fixedOvertime.status").value("PRESENT"))
                                .andExpect(jsonPath("$.fixedOvertime.hours").value(40))
                                .andExpect(jsonPath("$.fixedOvertime.excessPayStated").value(true))
                                .andExpect(jsonPath("$.fixedOvertime.evidence", hasSize(2)))
                                .andExpect(jsonPath("$.fixedOvertime.evidence[0].section").value("給与"))
                                .andExpect(jsonPath("$.fixedOvertime.evidence[0].text")
                                                .value("月給30万円（固定残業代40時間分を含む）"))
                                .andExpect(jsonPath("$.fixedOvertime.evidence[0].start").value(29))
                                .andExpect(jsonPath("$.fixedOvertime.evidence[0].end").value(50))
                                .andExpect(jsonPath("$.fixedOvertime.evidence[1].text").value("超過分は別途支給"))
                                .andExpect(jsonPath("$.fixedOvertime.evidence[1].start").value(51))
                                .andExpect(jsonPath("$.fixedOvertime.evidence[1].end").value(59))
                                .andExpect(jsonPath("$.skills", hasSize(2)))
                                .andExpect(jsonPath("$.skills[0]").value("Java"))
                                .andExpect(jsonPath("$.skills[1]").value("Docker"));
        }

        @Test
        void 判定できない項目はnullとして返し_キーを省略しない() throws Exception {
                JobPosting posting = jobPostingRepository.save(
                                new JobPosting(testUsers.defaultUserId(), "テスト会社", "開発者", null,
                                                "営業職の求人です", null, null, null));

                mockMvc.perform(get("/api/job-postings/{id}/analysis", posting.getId()))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.fixedOvertime.status").value("NOT_MENTIONED"))
                                .andExpect(jsonPath("$.fixedOvertime.hours").value(org.hamcrest.Matchers.nullValue()))
                                .andExpect(jsonPath("$.fixedOvertime.excessPayStated")
                                                .value(org.hamcrest.Matchers.nullValue()))
                                .andExpect(jsonPath("$.fixedOvertime.evidence").isEmpty())
                                .andExpect(jsonPath("$.skills").isEmpty());
        }

        @Test
        void サイトが付け加えた他社の求人の技術名は返さない() throws Exception {
                JobPosting posting = jobPostingRepository.save(
                                new JobPosting(testUsers.defaultUserId(), "テスト会社", "開発者", null,
                                                "Javaの開発経験\nこの企業が募集中のほかの求人\nDocker活用の開発エンジニア",
                                                null, null, null));

                mockMvc.perform(get("/api/job-postings/{id}/analysis", posting.getId()))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.skills", hasSize(1)))
                                .andExpect(jsonPath("$.skills[0]").value("Java"));
        }

        @Test
        void 隅付き括弧の見出しにある技術名も返す() throws Exception {
                JobPosting posting = jobPostingRepository.save(
                                new JobPosting(testUsers.defaultUserId(), "テスト会社", "開発者", null,
                                                "【Java経験者歓迎】\n月給30万円", null, null, null));

                mockMvc.perform(get("/api/job-postings/{id}/analysis", posting.getId()))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.skills", hasSize(1)))
                                .andExpect(jsonPath("$.skills[0]").value("Java"));
        }

        @Test
        void 存在しない求人を分析すると_404を返す() throws Exception {
                mockMvc.perform(get("/api/job-postings/{id}/analysis", 9999L))
                                .andExpect(status().isNotFound())
                                .andExpect(jsonPath("$.code").value("JOB_POSTING_NOT_FOUND"));
        }
    }

    @Nested
    class SalaryFilterTests {
        @Test
        void SalaryRangeが有効なら正しく出力される() throws Exception {
                jobPostingRepository.save(
                                new JobPosting(testUsers.defaultUserId(), "Charlie Company", "AWS Engineer", "https://example.com/charlie",
                                                "AWSを開発できる人は大歓迎", 300000, 500000, null));
                mockMvc.perform(get("/api/job-postings")
                                    .param("salaryMin", "300000")
                                    .param("salaryMax", "500000"))
                            .andExpect(status().isOk());
        }

        @Test
        void 最低月給の条件を最高月給の条件より大きくすると_400を返す() throws Exception {
                mockMvc.perform(get("/api/job-postings")
                                .param("salaryMin", "500000")
                                .param("salaryMax", "300000"))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.status").value(400))
                                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                                .andExpect(jsonPath("$", aMapWithSize(6)))
                                .andExpect(jsonPath("$.message").value("入力値が正しくありません。"))
                                .andExpect(jsonPath("$.path").value("/api/job-postings"))
                                .andExpect(jsonPath("$.timestamp").exists())
                                .andExpect(jsonPath("$.fieldErrors", aMapWithSize(1)))
                                .andExpect(jsonPath("$.fieldErrors.salaryMax")
                                                .value("最低月給を最高月給より大きくすることはできません。"));
        }

        @Test
        void 負の最高月給では範囲エラーより項目検証のメッセージを返す() throws Exception {
                mockMvc.perform(get("/api/job-postings")
                                .param("salaryMin", "0")
                                .param("salaryMax", "-10"))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                                .andExpect(jsonPath("$.fieldErrors", aMapWithSize(1)))
                                .andExpect(jsonPath("$.fieldErrors.salaryMax").isNotEmpty())
                                .andExpect(jsonPath("$.fieldErrors.salaryMax",
                                                not("最低月給を最高月給より大きくすることはできません。")));
        }

        @Test
        void 最低月給の条件が負なら_400を返す() throws Exception {
                mockMvc.perform(get("/api/job-postings")
                                .param("salaryMin", "-10"))
                                .andExpect(status().isBadRequest())
                                .andExpect(jsonPath("$.status").value(400))
                                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        }
    }

    @Nested
    class DeadlineFilterTests {
        @Test
        void 締切日の範囲が逆なら_400を返す() throws Exception {
            mockMvc.perform(get("/api/job-postings")
                    .param("deadlineFrom", "2026-11-01")
                    .param("deadlineTo", "2026-10-01"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.status").value(400))
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                    .andExpect(jsonPath("$.fieldErrors", aMapWithSize(1)))
                    .andExpect(jsonPath("$.fieldErrors.deadlineTo")
                            .value("締切日（以降）を締切日（以前）より後の日付にすることはできません。"));
        }
    }

    @Nested
    class IfMatchTests {
        @Test
        void 以前のIf_Matchで応募ステータスを再度変更すると_412を返す() throws Exception {
            JobPosting savedJobPosting = jobPostingRepository.saveAndFlush(
                    new JobPosting(testUsers.defaultUserId(), "ステータス変更テストの会社", "バックエンドエンジニア", null, "ステータス変更テストの原文", null, null, null)
            );
            Long staleVersion = savedJobPosting.getVersion();
            String path = "/api/job-postings/" + savedJobPosting.getId() + "/status";

            mockMvc.perform(patch(path)
                            .header(HttpHeaders.IF_MATCH, "\"" + staleVersion + "\"")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"status": "APPLIED"}
                                    """))
                    .andExpect(status().isOk());

            mockMvc.perform(patch(path)
                            .header(HttpHeaders.IF_MATCH, "\"" + staleVersion + "\"")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"status": "INTERVIEWING"}
                                    """))
                    .andExpect(status().isPreconditionFailed())
                    .andExpect(jsonPath("$.status").value(412))
                    .andExpect(jsonPath("$.code").value("JOB_POSTING_VERSION_CONFLICT"))
                    .andExpect(jsonPath("$.path").value(path));

            JobPosting unchangedJobPosting = jobPostingRepository.findById(savedJobPosting.getId()).orElseThrow();
            assertEquals(ApplicationStatus.APPLIED, unchangedJobPosting.getApplicationStatus());
            assertEquals(staleVersion + 1, unchangedJobPosting.getVersion());
        }

        @Test
        void 通常の編集より前のIf_Matchで応募ステータスを変更すると_412を返す() throws Exception {
            JobPosting savedJobPosting = jobPostingRepository.saveAndFlush(
                    new JobPosting(testUsers.defaultUserId(), "ステータス変更テストの会社", "既存のタイトル", null, "既存の原文", null, null, null)
            );
            Long staleVersion = savedJobPosting.getVersion();

            mockMvc.perform(put("/api/job-postings/{id}", savedJobPosting.getId())
                            .header(HttpHeaders.IF_MATCH, "\"" + staleVersion + "\"")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"companyName": "ステータス変更テストの会社", "title": "編集されたタイトル", "originalText": "既存の原文"}
                                    """))
                    .andExpect(status().isOk())
                    .andExpect(header().string(HttpHeaders.ETAG, "\"" + (staleVersion + 1) + "\""));

            mockMvc.perform(patch("/api/job-postings/{id}/status", savedJobPosting.getId())
                            .header(HttpHeaders.IF_MATCH, "\"" + staleVersion + "\"")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"status": "APPLIED"}
                                    """))
                    .andExpect(status().isPreconditionFailed())
                    .andExpect(jsonPath("$.code").value("JOB_POSTING_VERSION_CONFLICT"));

            JobPosting unchangedJobPosting = jobPostingRepository.findById(savedJobPosting.getId()).orElseThrow();
            assertEquals("編集されたタイトル", unchangedJobPosting.getTitle());
            assertEquals(ApplicationStatus.SAVED, unchangedJobPosting.getApplicationStatus());
            assertEquals(staleVersion + 1, unchangedJobPosting.getVersion());
        }

        @Test
        void 応募ステータス変更より前のIf_Matchで通常の編集をすると_412を返す() throws Exception {
            JobPosting savedJobPosting = jobPostingRepository.saveAndFlush(
                    new JobPosting(testUsers.defaultUserId(), "ステータス変更テストの会社", "既存のタイトル", null, "既存の原文", null, null, null)
            );
            Long staleVersion = savedJobPosting.getVersion();

            mockMvc.perform(patch("/api/job-postings/{id}/status", savedJobPosting.getId())
                            .header(HttpHeaders.IF_MATCH, "\"" + staleVersion + "\"")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"status": "APPLIED"}
                                    """))
                    .andExpect(status().isOk())
                    .andExpect(header().string(HttpHeaders.ETAG, "\"" + (staleVersion + 1) + "\""));

            mockMvc.perform(put("/api/job-postings/{id}", savedJobPosting.getId())
                            .header(HttpHeaders.IF_MATCH, "\"" + staleVersion + "\"")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"companyName": "ステータス変更テストの会社", "title": "編集されたタイトル", "originalText": "既存の原文"}
                                    """))
                    .andExpect(status().isPreconditionFailed())
                    .andExpect(jsonPath("$.code").value("JOB_POSTING_VERSION_CONFLICT"));

            JobPosting unchangedJobPosting = jobPostingRepository.findById(savedJobPosting.getId()).orElseThrow();
            assertEquals("既存のタイトル", unchangedJobPosting.getTitle());
            assertEquals(ApplicationStatus.APPLIED, unchangedJobPosting.getApplicationStatus());
            assertEquals(staleVersion + 1, unchangedJobPosting.getVersion());
        }

        @Test
        void If_Matchヘッダーなしで編集すると_428を返す() throws Exception {
                JobPosting charlie = jobPostingRepository.saveAndFlush(
                                new JobPosting(testUsers.defaultUserId(), "Charlie Company", "AWS Engineer", "https://example.com/charlie",
                                                "AWSを開発できる人は大歓迎", 300000, 500000, null));

                String requestBody = """
                                {
                                  "companyName": "Charlie Company",
                                  "title": "Junior AWS Engineer",
                                  "sourceUrl": "https://example.com/charlie",
                                  "originalText": "AWSを開発できる人は大歓迎",
                                  "salaryMin": 300000,
                                  "salaryMax": 500000
                                }
                                """;

                mockMvc.perform(put(
                                "/api/job-postings/{id}",
                                charlie.getId())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(requestBody))
                                .andExpect(status().is(428))
                                .andExpect(jsonPath("$.code")
                                                .value("IF_MATCH_REQUIRED"));
            
        }

        @Test
        void If_Matchヘッダーのバージョンが古ければ_412を返す() throws Exception {
                JobPosting charlie = jobPostingRepository.saveAndFlush(
                                new JobPosting(testUsers.defaultUserId(), "Charlie Company", "AWS Engineer", "https://example.com/charlie",
                                                "AWSを開発できる人は大歓迎", 300000, 500000, null));

                Long staleVersion = charlie.getVersion();

                String requestBody = """
                                {
                                  "companyName": "Charlie Company",
                                  "title": "Junior AWS Engineer",
                                  "sourceUrl": "https://example.com/charlie",
                                  "originalText": "AWSを開発できる人は大歓迎",
                                  "salaryMin": 300000,
                                  "salaryMax": 500000
                                }
                                """;
                mockMvc.perform(put(
                    "/api/job-postings/{id}",
                    charlie.getId())
                    .header(
                            HttpHeaders.IF_MATCH,
                            "\"" + staleVersion +"\""
                    )
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(requestBody))
                    .andExpect(status().isOk());

                mockMvc.perform(put(
                                "/api/job-postings/{id}",
                                charlie.getId())
                                .header(
                                    HttpHeaders.IF_MATCH,
                                    "\""+ staleVersion + "\""
                                )
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(requestBody))               
                                .andExpect(status().isPreconditionFailed())
                                .andExpect(jsonPath("$.code")
                                                .value("JOB_POSTING_VERSION_CONFLICT"));

        }

        @Test
        void If_Matchヘッダーのバージョンが一致すれば編集に成功する() throws Exception {
                JobPosting charlie = jobPostingRepository.saveAndFlush(
                                new JobPosting(testUsers.defaultUserId(), "Charlie Company", "AWS Engineer", "https://example.com/charlie",
                                                "AWSを開発できる人は大歓迎", 300000, 500000, null));

                Long currentVersion = charlie.getVersion();

                String requestBody = """
                                {
                                  "companyName": "Charlie Company",
                                  "title": "Junior AWS Engineer",
                                  "sourceUrl": "https://example.com/charlie",
                                  "originalText": "AWSを開発できる人は大歓迎",
                                  "salaryMin": 300000,
                                  "salaryMax": 500000
                                }
                                """;

                mockMvc.perform(put(
                                "/api/job-postings/{id}",
                                charlie.getId())
                                .header(
                                    HttpHeaders.IF_MATCH,
                                    "\""+ currentVersion +"\"")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(requestBody))
                                .andExpect(status().isOk())
                                .andExpect(header().string(
                                    HttpHeaders.ETAG,
                                    "\"" + (currentVersion + 1) + "\""
                                ))
                                .andExpect(jsonPath("$.title")
                                    .value("Junior AWS Engineer"));
        }
    }

    // If-Matchの未指定・空文字・空白文字を同じ条件としてまとめて検証する。
    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "\t"})
    void If_Matchがないか空なら応募ステータスの変更は_428を返す(String ifMatch) throws Exception {
        JobPosting savedJobPosting = jobPostingRepository.saveAndFlush(
                new JobPosting(testUsers.defaultUserId(), "ステータス変更テストの会社", "バックエンドエンジニア", null, "ステータス変更テストの原文", null, null, null)
        );
        Long savedVersion = savedJobPosting.getVersion();
        String path = "/api/job-postings/" + savedJobPosting.getId() + "/status";
        var request = patch(path)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"status": "APPLIED"}
                        """);
        if (ifMatch != null) {
            request.header(HttpHeaders.IF_MATCH, ifMatch);
        }

        mockMvc.perform(request)
                .andExpect(status().is(428))
                .andExpect(jsonPath("$.status").value(428))
                .andExpect(jsonPath("$.code").value("IF_MATCH_REQUIRED"))
                .andExpect(jsonPath("$.message").value("If-Match header is required."))
                .andExpect(jsonPath("$.path").value(path));

        JobPosting unchangedJobPosting = jobPostingRepository.findById(savedJobPosting.getId()).orElseThrow();
        assertEquals(ApplicationStatus.SAVED, unchangedJobPosting.getApplicationStatus());
        assertEquals(savedVersion, unchangedJobPosting.getVersion());
    }

    // If-Matchヘッダーの形式が不正な場合に400が返されることを複数パターンで確認する
    @ParameterizedTest
    @ValueSource(strings = {
        "abc",
        "\"abc\"",
        "\"3",
        "3\"",
        "W/\"3\"",
        "\"1\", \"2\"",
        "*",
        "\"999999999999999999999999999999999\""
    })
    void If_Matchヘッダーの形式に合わなければ_400を返す(String ifMatch) throws Exception {
            JobPosting charlie = jobPostingRepository.saveAndFlush(
                            new JobPosting(testUsers.defaultUserId(), "Charlie Company", "AWS Engineer", "https://example.com/charlie",
                                            "AWSを開発できる人は大歓迎", 300000, 500000, null));

            String requestBody = """
                            {
                              "companyName": "Charlie Company",
                              "title": "Junior AWS Engineer",
                              "sourceUrl": "https://example.com/charlie",
                              "originalText": "AWSを開発できる人は大歓迎",
                              "salaryMin": 300000,
                              "salaryMax": 500000
                            }
                            """;

            mockMvc.perform(put(
                            "/api/job-postings/{id}",
                            charlie.getId())
                            .header(
                                            HttpHeaders.IF_MATCH,
                                            ifMatch)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(requestBody))
                            .andExpect(status().isBadRequest())
                            .andExpect(jsonPath("$.code")
                                            .value("MALFORMED_IF_MATCH_HEADER"));
    }

    @Test
    void ApplicationStatusの編集時にIf_Matchの形式が不正なら_400を返す() throws Exception {
        JobPosting charlie = jobPostingRepository.saveAndFlush(
                new JobPosting(testUsers.defaultUserId(), "Charlie Company", "AWS Engineer", "https://example.com/charlie",
                                            "AWSを開発できる人は大歓迎", 300000, 500000, null));
        
        String requestBody = """
                        {
                          "status": "APPLIED"
                        }
                        """;

        mockMvc.perform(patch(
                "/api/job-postings/{id}/status",
                        charlie.getId())
                        .header(
                                        HttpHeaders.IF_MATCH,
                                        "abc")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                        .andExpect(status().isBadRequest())
                        .andExpect(jsonPath("$.code")
                                        .value("MALFORMED_IF_MATCH_HEADER"));
    }

    @ParameterizedTest 
    @MethodSource("deadlineFilterCases")
    void applicationDeadlineで求人を絞り込める(String queryString, List<String> expectedTitles) throws Exception {
            jobPostingRepository.saveAllAndFlush(List.of(
                            new JobPosting(
                                            testUsers.defaultUserId(),
                                            "既存の会社",
                                            "求人A",
                                            "https://example.com/old",
                                            "既存の求人原文",
                                            null,
                                            null,
                                            LocalDate.parse("2026-10-01")),
                            new JobPosting(
                                            testUsers.defaultUserId(),
                                            "既存の会社",
                                            "求人B",
                                            "https://example.com/old",
                                            "既存の求人原文",
                                            null,
                                            null,
                                            LocalDate.parse("2026-10-15")),
                            new JobPosting(
                                            testUsers.defaultUserId(),
                                            "既存の会社",
                                            "求人C",
                                            "https://example.com/old",
                                            "既存の求人原文",
                                            null,
                                            null,
                                            LocalDate.parse("2026-11-01")),
                            new JobPosting(
                                            testUsers.defaultUserId(),
                                            "既存の会社",
                                            "求人D",
                                            "https://example.com/old",
                                            "既存の求人原文",
                                            null,
                                            null,
                                            null)));
        
            mockMvc.perform(get("/api/job-postings?" + queryString))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.content.length()").value(expectedTitles.size()))
                        .andExpect(jsonPath("$.content[*].title").value(containsInAnyOrder(expectedTitles.toArray())));

    }

    static Stream<Arguments> deadlineFilterCases() {
        return Stream.of(
                Arguments.of(
                        "deadlineFrom=2026-10-10",
                        List.of("求人B", "求人C")
                ),
                Arguments.of(
                        "deadlineTo=2026-10-15",
                        List.of("求人A", "求人B")
                ),
                Arguments.of(
                        "deadlineFrom=2026-10-10&deadlineTo=2026-10-31",
                        List.of("求人B")
                )
        );
    }

    @Test
    void 応募状態の変更履歴を新しい順に取得できる() throws Exception {
            JobPosting charlie = jobPostingRepository.saveAndFlush(
                            new JobPosting(testUsers.defaultUserId(), "会社1", "求人1", null, "原文1", null, null, null));
            Long version = charlie.getVersion();

            mockMvc.perform(
                            patch("/api/job-postings/{id}/status", charlie.getId())
                                            .header(HttpHeaders.IF_MATCH,
                                                            "\"" + version + "\"")
                                            .contentType(MediaType.APPLICATION_JSON)
                                            .content("""
                                                            {
                                                              "status": "APPLIED"
                                                            }
                                                            """))
                            .andExpect(status().isOk());
        
            mockMvc.perform(
                            patch("/api/job-postings/{id}/status", charlie.getId())
                                            .header(HttpHeaders.IF_MATCH,
                                                            "\"" + (version+1) + "\"")
                                            .contentType(MediaType.APPLICATION_JSON)
                                            .content("""
                                                            {
                                                              "status": "INTERVIEWING"
                                                            }
                                                            """))
                            .andExpect(status().isOk());

            mockMvc.perform(get("/api/job-postings/{id}/status-history", charlie.getId()))
                            .andExpect(status().isOk())
                            .andExpect(jsonPath("$.length()").value(2))
                            .andExpect(jsonPath("$[0].fromStatus").value("APPLIED"))
                            .andExpect(jsonPath("$[0].toStatus").value("INTERVIEWING"))
                            .andExpect(jsonPath("$[1].fromStatus").value("SAVED"))
                            .andExpect(jsonPath("$[1].toStatus").value("APPLIED"));
    }

    @Test
    void 応募状態の変更履歴が存在しない場合は空のリストを返す() throws Exception {
            JobPosting charlie = jobPostingRepository.saveAndFlush(
                            new JobPosting(testUsers.defaultUserId(), "会社1", "求人1", null, "原文1", null, null, null));

            mockMvc.perform(get("/api/job-postings/{id}/status-history", charlie.getId()))
                            .andExpect(status().isOk())
                            .andExpect(jsonPath("$.length()").value(0));
    }

    @Test 
    void 存在しない求人情報の応募状態履歴を取得すると404を返す() throws Exception {
            mockMvc.perform(get("/api/job-postings/{id}/status-history", 9999L))
                                .andExpect(status().isNotFound())
                                .andExpect(jsonPath("$.status").value(404))
                                .andExpect(jsonPath("$.code").value("JOB_POSTING_NOT_FOUND"))
                                .andExpect(jsonPath("$.message").value("求人が見つかりません。id=9999"));
    }

}
