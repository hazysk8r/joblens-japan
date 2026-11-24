package com.joblens.jobposting.controller;

import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import com.joblens.AuthenticatedMockMvcConfiguration;
import com.joblens.TestUsers;
import com.joblens.TestcontainersConfiguration;
import com.joblens.jobposting.domain.JobPosting;
import com.joblens.jobposting.repository.JobPostingRepository;

/**
 * 一覧は原文の全体ではなく、カードに出す要約だけを返すことを検証する。
 * 原文は最大2万文字で、カードは100文字しか使わないため。
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, AuthenticatedMockMvcConfiguration.class})
class JobPostingListExcerptTest {

    // 検索語の「Kubernetes」が原文の後ろのほうにだけある求人票。
    private static final String ORIGINAL_TEXT =
            "仕事内容\n" + "業".repeat(150) + "\n開発環境\nAWS、Kubernetes、Terraform\n" + "他".repeat(150);

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JobPostingRepository jobPostingRepository;

    @Autowired
    private TestUsers testUsers;

    private Long postingId;

    @BeforeEach
    void setUp() {
        jobPostingRepository.deleteAll();
        postingId = jobPostingRepository.save(new JobPosting(
                testUsers.defaultUserId(), "A社", "バックエンドエンジニア", null, ORIGINAL_TEXT, null, null, null))
                .getId();
    }

    @Test
    void 一覧は原文の全体を返さず_先頭の要約を返す() throws Exception {
        mockMvc.perform(get("/api/job-postings"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0]", not(hasKey("originalText"))))
                .andExpect(jsonPath("$.content[0].excerpt").value("仕事内容 " + "業".repeat(95) + "…"));
    }

    @Test
    void 原文の後ろのほうで検索語が見つかったら_その前後を要約にする() throws Exception {
        mockMvc.perform(get("/api/job-postings").param("keyword", "kubernetes"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].excerpt").value(
                        "…" + "業".repeat(10) + " 開発環境 AWS、Kubernetes、Terraform " + "他".repeat(59) + "…"));
    }

    @Test
    void 詳細はこれまでどおり原文の全体を返す() throws Exception {
        mockMvc.perform(get("/api/job-postings/{id}", postingId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.originalText").value(ORIGINAL_TEXT));
    }
}
