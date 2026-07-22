package com.joblens.jobposting.controller;

import com.joblens.jobposting.repository.JobPostingRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 실제 Spring 애플리케이션 컨텍스트를 실행하고,
 * HTTP 요청이 Controller부터 예외 처리기까지 정상적으로 흐르는지 확인한다.
 *
 * 단순한 메서드 단위 테스트가 아니라 DB, Controller, Service,
 * GlobalExceptionHandler가 함께 동작하는 통합 테스트에 가깝다.
 */
@SpringBootTest
@AutoConfigureMockMvc
class JobPostingControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JobPostingRepository jobPostingRepository;

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
}