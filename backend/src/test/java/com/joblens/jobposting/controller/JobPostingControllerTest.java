package com.joblens.jobposting.controller;

import com.joblens.jobposting.domain.JobPosting;
import com.joblens.jobposting.repository.JobPostingRepository;
import com.joblens.TestcontainersConfiguration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.context.annotation.Import;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * 실제 Spring 애플리케이션 컨텍스트를 실행하고,
 * HTTP 요청이 Controller부터 예외 처리기까지 정상적으로 흐르는지 확인한다.
 *
 * 단순한 메서드 단위 테스트가 아니라 DB, Controller, Service,
 * GlobalExceptionHandler가 함께 동작하는 통합 테스트에 가깝다.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class JobPostingControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JobPostingRepository jobPostingRepository;

    /**
    * 각 테스트가 이전 테스트 데이터의 영향을 받지 않도록
    * 임시 테스트 DB의 채용공고 데이터를 초기화한다.
    *
    * Testcontainers가 만든 DB에만 실행되므로
    * 개발용 PostgreSQL 데이터는 영향을 받지 않는다.
    */
    @BeforeEach
    void setUp() {
        /*
         * 각 테스트가 이전 테스트 데이터의 영향을 받지 않도록
         * 테스트 실행 전 채용공고 데이터를 초기화한다.
         */
        jobPostingRepository.deleteAll();
    }

    @Test
    void 존재하지_않는_채용공고를_조회하면_404를_반환한다() throws Exception {
        mockMvc.perform(get("/api/job-postings/{id}", 9999L))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.code")
                        .value("JOB_POSTING_NOT_FOUND"))
                .andExpect(jsonPath("$.message")
                        .value("채용공고를 찾을 수 없습니다. id=9999"))
                .andExpect(jsonPath("$.path")
                        .value("/api/job-postings/9999"));
    }
    //JsonPath는 응답 JSON의 특정 값을 검사한다. $는 JSON 전체를 의미함.
    @Test
    void 제목과_원문이_비어있으면_400을_반환한다() throws Exception {
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
                        .value("공고 제목은 필수입니다."))
                .andExpect(jsonPath("$.fieldErrors.originalText")
                        .value("공고 원문은 필수입니다."));
        //mockMvc는 실제 브라우저나 curl.exe 없이 Spring MVC에 가짜 HTTP 요청을 보낸다.
    }

    @Test
    void 채용공고를_수정하면_변경된_내용과_200을_반환한다() throws Exception {
        /*
        * 수정하려면 기존 데이터가 먼저 존재해야 하므로
        * Repository를 통해 테스트용 채용공고를 저장한다.
        */
        JobPosting savedJobPosting = jobPostingRepository.save(
                new JobPosting(
                        "기존 회사",
                        "기존 제목",
                        "https://example.com/old",
                        "기존 채용공고 원문"
                )
        );

        String requestBody = """
                {
                "companyName": "札幌クラウド株式会社",
                "title": "Java・AWSエンジニア",
                "sourceUrl": "https://example.com/jobs/updated",
                "originalText": "Spring BootとAWSを利用した開発業務です。"
                }
                """;

        mockMvc.perform(put(
                        "/api/job-postings/{id}",
                        savedJobPosting.getId()
                )
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id")
                        .value(savedJobPosting.getId()))
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
                updatedJobPosting.getTitle()
        );              
        /**
         * HTTP 응답만 수정된 척한 것이 아니라
         * PostgreSQL 안의 실제 데이터도 바뀌었는지 검사
        */  
    }

    @Test
    void 채용공고를_삭제하면_204를_반환하고_DB에서_제거된다() throws Exception {
        JobPosting savedJobPosting = jobPostingRepository.save(
                new JobPosting(
                        "삭제 테스트 회사",
                        "삭제 테스트 공고",
                        "https://example.com/delete",
                        "삭제할 채용공고 원문"
                )
        );

        Long jobPostingId = savedJobPosting.getId();

        /*
        * 삭제 성공 시 응답 본문이 필요 없으므로
        * API는 204 No Content를 반환한다.
        */
        mockMvc.perform(delete(
                        "/api/job-postings/{id}",
                        jobPostingId
                ))
                .andExpect(status().isNoContent());

        /*
        * 상태 코드뿐 아니라 실제 DB에서도 데이터가 삭제됐는지 확인한다.
        */
        boolean exists = jobPostingRepository.existsById(jobPostingId);

        assertFalse(exists);
    }

    @Test
    void 키워드로_채용공고를_검색할_수_있다() throws Exception {
        jobPostingRepository.save(
                new JobPosting(
                        "北海道クラウド株式会社",
                        "AWSクラウドエンジニア",
                        "https://example.com/aws",
                        "AWS環境の設計と構築を担当します。"
                )
        );

        jobPostingRepository.save(
                new JobPosting(
                        "札幌Java株式会社",
                        "Javaバックエンドエンジニア",
                        "https://example.com/java",
                        "Spring Bootを利用した開発を担当します。"
                )
        );

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
    void 채용공고를_페이지_단위로_조회할_수_있다() throws Exception {
        jobPostingRepository.save(
                new JobPosting("회사 1", "공고 1", null, "원문 1")
        );
        jobPostingRepository.save(
                new JobPosting("회사 2", "공고 2", null, "원문 2")
        );
        jobPostingRepository.save(
                new JobPosting("회사 3", "공고 3", null, "원문 3")
        );

        mockMvc.perform(get("/api/job-postings")
                    .param("page", "0")
                    .param("size", "2")
                    .param("sort", "id,asc"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content.length()").value(2))
            .andExpect(jsonPath("$.page").value(0))
            .andExpect(jsonPath("$.size").value(2))
            .andExpect(jsonPath("$.totalElements").value(3))
            .andExpect(jsonPath("$.totalPages").value(2))
            .andExpect(jsonPath("$.first").value(true))
            .andExpect(jsonPath("$.last").value(false));
    }

}