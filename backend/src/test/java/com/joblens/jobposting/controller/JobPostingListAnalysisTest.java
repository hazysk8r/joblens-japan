package com.joblens.jobposting.controller;

import com.joblens.AuthenticatedMockMvcConfiguration;
import com.joblens.TestUsers;
import com.joblens.TestcontainersConfiguration;
import com.joblens.jobposting.analysis.FixedOvertimeAnalyzer;
import com.joblens.jobposting.analysis.PostingSection;
import com.joblens.jobposting.analysis.SourceLine;
import com.joblens.jobposting.domain.JobPosting;
import com.joblens.jobposting.repository.JobPostingRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.hamcrest.Matchers.aMapWithSize;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 一覧の各求人に付ける固定残業代の判定(一覧のバッジ用)を検証する。
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, AuthenticatedMockMvcConfiguration.class})
class JobPostingListAnalysisTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JobPostingRepository jobPostingRepository;

    @Autowired
    private TestUsers testUsers;

    @BeforeEach
    void setUp() {
        jobPostingRepository.deleteAll();
    }

    private JobPosting save(String companyName, String originalText) {
        return jobPostingRepository.save(new JobPosting(
                testUsers.defaultUserId(), companyName, "開発者", null, originalText, null, null, null));
    }

    @Test
    void 一覧の各求人に固定残業代の判定と時間数を付け_根拠の文は付けない() throws Exception {
        save("A社", "給与\n月給30万円（固定残業代40時間分を含む）");
        save("B社", "給与\n月給30万円");

        mockMvc.perform(get("/api/job-postings").param("sort", "companyName,asc"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].companyName").value("A社"))
                .andExpect(jsonPath("$.content[0].fixedOvertime", aMapWithSize(2)))
                .andExpect(jsonPath("$.content[0].fixedOvertime.status").value("PRESENT"))
                .andExpect(jsonPath("$.content[0].fixedOvertime.hours").value(40))
                .andExpect(jsonPath("$.content[1].fixedOvertime.status").value("NOT_MENTIONED"))
                .andExpect(jsonPath("$.content[1].fixedOvertime.hours").value(nullValue()))
                // 一覧の他の項目はこれまでどおり返す。
                .andExpect(jsonPath("$.content[1].originalText").value("給与\n月給30万円"));
    }

    @Test
    void サイトが付け加えた他社の求人の固定残業代は一覧の判定にも使わない() throws Exception {
        save("A社", "給与\n月給30万円\nこの企業が募集中のほかの求人\n月給35万円（固定残業代40時間分を含む）");

        mockMvc.perform(get("/api/job-postings"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].fixedOvertime.status").value("NOT_MENTIONED"));
    }

    @Test
    void 一つの求人の分析が失敗しても一覧は返し_その求人の判定だけをnullにする() throws Exception {
        save("A社", "壊れる求人票");
        save("B社", "給与\n固定残業代30時間分を含む");

        try (MockedStatic<FixedOvertimeAnalyzer> analyzer =
                     Mockito.mockStatic(FixedOvertimeAnalyzer.class, Mockito.CALLS_REAL_METHODS)) {
            analyzer.when(() -> FixedOvertimeAnalyzer.analyze(any())).thenAnswer(invocation -> {
                List<PostingSection> sections = invocation.getArgument(0);
                boolean broken = sections.stream()
                        .flatMap(section -> section.lines().stream())
                        .map(SourceLine::text)
                        .anyMatch("壊れる求人票"::equals);
                if (broken) {
                    throw new IllegalStateException("分析の失敗");
                }
                return invocation.callRealMethod();
            });

            mockMvc.perform(get("/api/job-postings").param("sort", "companyName,asc"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.content[0].companyName").value("A社"))
                    .andExpect(jsonPath("$.content[0].fixedOvertime").value(nullValue()))
                    .andExpect(jsonPath("$.content[1].fixedOvertime.status").value("PRESENT"))
                    .andExpect(jsonPath("$.content[1].fixedOvertime.hours").value(30));
        }
    }

    @Test
    void 詳細と登録と更新の応答には一覧用の判定を付けない() throws Exception {
        JobPosting posting = save("A社", "固定残業代40時間分を含む");

        mockMvc.perform(get("/api/job-postings/{id}", posting.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fixedOvertime").doesNotExist());

        mockMvc.perform(post("/api/job-postings")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"companyName":"B社","title":"開発者","originalText":"固定残業代40時間分を含む"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.fixedOvertime").doesNotExist());

        mockMvc.perform(put("/api/job-postings/{id}", posting.getId())
                        .header("If-Match", "\"" + posting.getVersion() + "\"")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"companyName":"A社","title":"開発者","originalText":"固定残業代45時間分を含む"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fixedOvertime").doesNotExist());
    }
}
