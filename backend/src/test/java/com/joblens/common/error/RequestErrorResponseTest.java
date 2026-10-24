package com.joblens.common.error;

import com.joblens.AuthenticatedMockMvcConfiguration;
import com.joblens.TestUsers;
import com.joblens.TestcontainersConfiguration;
import com.joblens.jobposting.domain.ApplicationStatus;
import com.joblens.jobposting.domain.JobPosting;
import com.joblens.jobposting.repository.JobPostingRepository;
import com.joblens.jobposting.repository.JobPostingStatusHistoryRepository;
import com.joblens.note.repository.JobPostingMemoRepository;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.time.Instant;

import static org.hamcrest.Matchers.aMapWithSize;
import static org.hamcrest.Matchers.hasKey;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, AuthenticatedMockMvcConfiguration.class})
class RequestErrorResponseTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JobPostingRepository jobPostingRepository;

    @Autowired
    private TestUsers testUsers;

    @Autowired
    private JobPostingStatusHistoryRepository statusHistoryRepository;

    @Autowired
    private JobPostingMemoRepository memoRepository;

    @BeforeEach
    void テストデータを初期化する() {
        memoRepository.deleteAll();
        statusHistoryRepository.deleteAll();
        jobPostingRepository.deleteAll();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "{\"title\":",
            "",
            "{\"title\":\"求人\",\"originalText\":\"Java\",\"salaryMin\":{\"value\":300000}}",
            "{\"title\":\"求人\",\"originalText\":\"Java\",\"salaryMin\":\"abc\"}",
            "{\"title\":\"求人\",\"originalText\":\"Java\",\"applicationDeadline\":\"not-a-date\"}"
    })
    void 読み取れない作成本文は共通エラーを返して求人を保存しない(String body) throws Exception {
        assertRequestBodyError(mockMvc.perform(post("/api/job-postings")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)), "/api/job-postings");

        assertEquals(0L, jobPostingRepository.count());
    }

    @Test
    void 不正な状態列挙値は共通本文エラーを返して状態と履歴とバージョンを維持する() throws Exception {
        JobPosting saved = saveJobPosting();
        String path = "/api/job-postings/" + saved.getId() + "/status";

        assertRequestBodyError(mockMvc.perform(patch(path)
                        .header(HttpHeaders.IF_MATCH, "\"" + saved.getVersion() + "\"")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"INVALID_STATUS\"}")), path);

        JobPosting unchanged = jobPostingRepository.findById(saved.getId()).orElseThrow();
        assertEquals(ApplicationStatus.SAVED, unchanged.getApplicationStatus());
        assertEquals(saved.getVersion(), unchanged.getVersion());
        assertEquals("既存タイトル", unchanged.getTitle());
        assertEquals(0L, statusHistoryRepository.count());
    }

    @ParameterizedTest
    @ValueSource(strings = {"not-a-number", "9223372036854775808"})
    void 数値に変換できない求人IDは共通パラメーターエラーを返す(String id) throws Exception {
        String path = "/api/job-postings/" + id;
        assertParameterTypeError(mockMvc.perform(get(path)), path);
        assertEquals(0L, jobPostingRepository.count());
    }

    @Test
    void 不正な検索状態は本文エラーと区別した共通パラメーターエラーを返す() throws Exception {
        assertParameterTypeError(mockMvc.perform(get("/api/job-postings")
                        .param("status", "INVALID_STATUS")), "/api/job-postings");
    }

    @Test
    void メモAPIの本文読み取りエラーにも同じ共通形式を適用する() throws Exception {
        JobPosting saved = saveJobPosting();
        String path = "/api/job-postings/" + saved.getId() + "/notes";

        assertRequestBodyError(mockMvc.perform(post(path)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":")), path);

        assertEquals(0L, memoRepository.count());
        assertEquals(saved.getVersion(), jobPostingRepository.findById(saved.getId()).orElseThrow().getVersion());
    }

    @Test
    void メモAPIの経路変換エラーにも同じ共通形式を適用する() throws Exception {
        String path = "/api/job-postings/not-a-number/notes";
        assertParameterTypeError(mockMvc.perform(get(path)), path);
    }

    @Test
    void 数値文字列の給与を受け入れる既存の変換規則を維持する() throws Exception {
        mockMvc.perform(post("/api/job-postings")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "title": "求人",
                                  "originalText": "Java",
                                  "salaryMin": "300000",
                                  "salaryMax": "500000"
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.salaryMin").value(300000))
                .andExpect(jsonPath("$.salaryMax").value(500000));

        assertEquals(1L, jobPostingRepository.count());
        JobPosting saved = jobPostingRepository.findAll().getFirst();
        assertEquals(300000, saved.getSalaryMin());
        assertEquals(500000, saved.getSalaryMax());
    }

    @Test
    void タイトルの必須検証は既存の検証エラーとフィールド情報を維持する() throws Exception {
        mockMvc.perform(post("/api/job-postings")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"\",\"originalText\":\"Java\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(result -> assertInstanceOf(MethodArgumentNotValidException.class,
                        result.getResolvedException()))
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.message").value("입력값이 올바르지 않습니다."))
                .andExpect(jsonPath("$.fieldErrors", aMapWithSize(1)))
                .andExpect(jsonPath("$.fieldErrors.title").value("공고 제목은 필수입니다."));

        assertEquals(0L, jobPostingRepository.count());
    }

    @ParameterizedTest
    @CsvSource({"salaryMin, not-a-number", "deadlineFrom, not-a-date"})
    void 検索DTOの型変換失敗は既存のフィールド検証形式を維持する(String parameter, String value)
            throws Exception {
        mockMvc.perform(get("/api/job-postings").param(parameter, value))
                .andExpect(status().isBadRequest())
                .andExpect(result -> assertInstanceOf(MethodArgumentNotValidException.class,
                        result.getResolvedException()))
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.message").value("입력값이 올바르지 않습니다."))
                .andExpect(jsonPath("$.fieldErrors", hasKey(parameter)));
    }

    private JobPosting saveJobPosting() {
        return jobPostingRepository.saveAndFlush(new JobPosting(
                testUsers.defaultUserId(),
                "テスト株式会社", "既存タイトル", null, "Javaの開発", 300000, 500000, null));
    }

    private void assertRequestBodyError(ResultActions result, String path) throws Exception {
        result.andExpect(response -> assertInstanceOf(HttpMessageNotReadableException.class,
                response.getResolvedException()));
        assertCommonError(result, path, "INVALID_REQUEST_BODY", "요청 본문의 형식이나 값이 올바르지 않습니다.");
    }

    private void assertParameterTypeError(ResultActions result, String path) throws Exception {
        result.andExpect(response -> assertInstanceOf(MethodArgumentTypeMismatchException.class,
                response.getResolvedException()));
        assertCommonError(result, path, "INVALID_PARAMETER_TYPE", "요청 경로나 검색 조건의 값이 올바르지 않습니다.");
    }

    private void assertCommonError(ResultActions result, String path, String code, String message) throws Exception {
        result.andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$", aMapWithSize(6)))
                .andExpect(jsonPath("$.timestamp").isString())
                .andExpect(response -> {
                    String timestamp = JsonPath.read(response.getResponse().getContentAsString(), "$.timestamp");
                    assertNotNull(Instant.parse(timestamp));
                })
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.code").value(code))
                .andExpect(jsonPath("$.message").value(message))
                .andExpect(jsonPath("$.path").value(path))
                .andExpect(jsonPath("$.fieldErrors", aMapWithSize(0)));
    }
}
