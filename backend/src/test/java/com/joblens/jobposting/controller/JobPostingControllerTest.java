package com.joblens.jobposting.controller;

import com.joblens.jobposting.domain.JobPosting;
import com.joblens.jobposting.repository.JobPostingRepository;
import com.joblens.jobposting.domain.ApplicationStatus;
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

import java.util.List;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;

import static org.hamcrest.Matchers.hasSize;

/**
 * 실제 Spring 애플리케이션 컨텍스트를 실행하고,
 * HTTP 요청이 Controller부터 예외 처리기까지 정상적으로 흐르는지 확인
 *
 * 단순한 메서드 단위 테스트가 아니라 DB, Controller, Service,
 * GlobalExceptionHandler가 함께 동작하는 통합 테스트라고 할 수 있음
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
    * 임시 테스트 DB의 채용공고 데이터를 초기화
    *
    * Testcontainers가 만든 DB에만 실행되므로
    * 개발용 PostgreSQL 데이터는 영향을 받지 않음
    */
    @BeforeEach
    void setUp() {
        /*
         * 각 테스트가 이전 테스트 데이터의 영향을 받지 않도록
         * 테스트 실행 전 채용공고 데이터를 초기화
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
    //JsonPath는 응답 JSON의 특정 값을 검사한다. $는 JSON 전체를 의미함
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
    void 채용공고의_지원_상태를_변경하면_응답과_DB에_반영된다() throws Exception {
        // 테스트용 공고 DB에 저장
        JobPosting savedJobPosting = jobPostingRepository.save(
                new JobPosting("상태 변경 테스트 회사", "백엔드 엔지니어", "https://example.com/status", "지원 상태 변경 테스트용 원문")
        );

        // SAVED에서 다른 지원 상태로 변경하는 요청
        String requestBody = """
                {
                  "status": "APPLIED"
                }
                """;

        // PATCH API 호출 후, HTTP 응답 확인
        mockMvc.perform(patch(
                        "/api/job-postings/{id}/status",
                        savedJobPosting.getId()
                )
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id")
                        .value(savedJobPosting.getId()))
                .andExpect(jsonPath("$.applicationStatus")
                        .value("APPLIED"));

        JobPosting updatedJobPosting = jobPostingRepository
                .findById(savedJobPosting.getId())
                .orElseThrow();
        
        assertEquals(
                ApplicationStatus.APPLIED, 
                updatedJobPosting.getApplicationStatus()
        );

    }

    @Test
    void 존재하지_않는_채용공고의_지원_상태를_변경하면_404를_반환한다() throws Exception {
        String requestBody = """
                {
                  "status": "APPLIED"       
                }
                """;
        mockMvc.perform(patch(
                        "/api/job-postings/{id}/status",
                        9999L
                )
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.code").value("JOB_POSTING_NOT_FOUND"))
                .andExpect(jsonPath("$.message").value("채용공고를 찾을 수 없습니다. id=9999"))
                .andExpect(jsonPath("$.path").value("/api/job-postings/9999/status"));
    }

    @Test
    void 지원_상태를_누락하면_400을_반환하고_DB는_변경되지_않는다() throws Exception {
        
        // 기본 상태가 SAVED인 상태 저장
        JobPosting savedJobPosting = jobPostingRepository.save(
                new JobPosting(
                        "검증 테스트 회사", 
                        "백엔드 엔지니어", 
                        "https://example.com/status-validation", 
                        "지원 상태 검증 테스트용 원문"
                )
        );

        // status 필드가 없는 요청
        String requestBody = """
                        {
                        }
                        """;
        
        // PATCH 요청 후 검증 오류 확인
        mockMvc.perform(patch(
                        "/api/job-postings/{id}/status",
                        savedJobPosting.getId()      
                )
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status")
                        .value(400))
                .andExpect(jsonPath("$.code")
                        .value("VALIDATION_FAILED")) 
                .andExpect(jsonPath("$.fieldErrors.status").exists());

        // 실패한 요청이 DB 상태를 변경하지 않았는 지 확인
        JobPosting unchangedJobPosting = jobPostingRepository
                        .findById(savedJobPosting.getId())
                        .orElseThrow();
        assertEquals(
                ApplicationStatus.SAVED,
                unchangedJobPosting.getApplicationStatus()
        );


    }

    @Test
    void 채용공고를_등록하면_기본_지원_상태는_SAVED이다() throws Exception {

        // 정상적인 채용 공고 등록 요청
        String requestBody = """
                {
                  "companyName": "기본 상태 테스트 회사",
                  "title": "Java 백엔드 엔지니어",
                  "sourceUrl": "https://example.com/default-status",
                  "originalText": "신규 공고 기본 상태 테스트용 원문"
                }
                """;

        // POST 요청 후 응답 상태 확인
        mockMvc.perform(post("/api/job-postings")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").exists())
                .andExpect(jsonPath("$.applicationStatus")
                        .value("SAVED"));
                  
        // DB에 실제 저장된 공고 조회 
        JobPosting savedJobPosting = jobPostingRepository
                .findAll()
                .stream()
                .findFirst()
                .orElseThrow();
        
        // DB에서도 기본 상태가 SAVED인지 확인
        assertEquals(
                ApplicationStatus.SAVED, 
                savedJobPosting.getApplicationStatus()
        );
    }

    @Test
    void 지원_상태별_채용공고_개수를_조회할_수_있다() throws Exception {
        // 1. SAVED 상태 공고 2개
        jobPostingRepository.save(
                new JobPosting("회사1", "공고1", null, "원문1")
        );
        jobPostingRepository.save(
                        new JobPosting("회사2", "공고2", null, "원문2")
        );

        // 2. APPLIED 상태 공고 1개
        JobPosting appliedJobPosting = new JobPosting("회사3", "공고3", null, "원문3");
        appliedJobPosting.changeApplicationStatus(ApplicationStatus.APPLIED);
        jobPostingRepository.save(appliedJobPosting);

        // 3. INTERVIEWING 상태 공고 1개
        JobPosting interviewingJobPosting = new JobPosting("회사4", "공고4", null, "원문4");
        interviewingJobPosting.changeApplicationStatus(ApplicationStatus.INTERVIEWING);
        jobPostingRepository.save(interviewingJobPosting);

        // 4. OFFERED 상태 공고 1개
        JobPosting offeredJobPosting = new JobPosting("회사5", "공고5", null, "원문5");
        offeredJobPosting.changeApplicationStatus(ApplicationStatus.OFFERED);
        jobPostingRepository.save(offeredJobPosting);

        // 5. 상태 요약 API 호출
        mockMvc.perform(get("/api/job-postings/status-summary"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.saved").value(2))
                .andExpect(jsonPath("$.applied").value(1))
                .andExpect(jsonPath("$.interviewing").value(1))
                .andExpect(jsonPath("$.offered").value(1))
                .andExpect(jsonPath("$.rejected").value(0));
    }

    @Test
    void 지원_상태_및_키워드를_통해서_필터링_할_수_있다() throws Exception {

        jobPostingRepository.save(
                new JobPosting("회사1", "공고1", null, "원문1")
        );

        JobPosting appliedJobPosting = new JobPosting("회사2", "공고2", null, "원문2");
        appliedJobPosting.changeApplicationStatus(ApplicationStatus.APPLIED);
        jobPostingRepository.save(appliedJobPosting);


        mockMvc.perform(get("/api/job-postings")
                        .param("keyword", "공고")
                        .param("status", "APPLIED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].applicationStatus").value("APPLIED"))
                .andExpect(jsonPath("$.content[0].title").value("공고2"));
    }

    @Test
    void 지원_상태로_필터링_할_수_있다() throws Exception {

        jobPostingRepository.save(
                new JobPosting("회사1", "공고1", null, "원문1"));

        JobPosting appliedJobPosting = new JobPosting("회사2", "공고2", null, "원문2");
        appliedJobPosting.changeApplicationStatus(ApplicationStatus.APPLIED);
        jobPostingRepository.save(appliedJobPosting);

        JobPosting secondAppliedJobPosting = new JobPosting("회사2", "공고2", null, "원문2");
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
    void 대소문자_상관_없이_필터링_할_수_있다() throws Exception {

            jobPostingRepository.save(
                            new JobPosting("회사1", "Spring Backend Engineer", null, "원문1"));

            mockMvc.perform(get("/api/job-postings")
                            .param("keyword", "spring"))
                            .andExpect(status().isOk())
                            .andExpect(jsonPath("$.content.length()").value(1))
                            .andExpect(jsonPath("$.content[0].title").value("Spring Backend Engineer"));
    }

    @Test
    void 와일드카드_이스케이프_할_수_있다() throws Exception {

            jobPostingRepository.save(
                            new JobPosting("회사1", "100% Remote Engineer", null, "원문1"));
            jobPostingRepository.save(
                            new JobPosting("회사2", "Java Developer", null, "원문2"));

            mockMvc.perform(get("/api/job-postings")
                            .param("keyword", "%"))
                            .andExpect(status().isOk())
                            .andExpect(jsonPath("$.content.length()").value(1))
                            .andExpect(jsonPath("$.content[0].title").value("100% Remote Engineer"));
    }

    @Test
    void 유효하지_않는_상태는_Bad_Request_전송한다() throws Exception {

        mockMvc.perform(get("/api/job-postings?status=INVALID"))
                        .andExpect(status().isBadRequest());
    }

    @Test
    void 상태와_페이지네이션을_활용해_필터링_할_수_있다() throws Exception {
            JobPosting appliedJobPosting = new JobPosting("회사1", "공고1", null, "원문1");
            appliedJobPosting.changeApplicationStatus(ApplicationStatus.APPLIED);
            jobPostingRepository.save(appliedJobPosting);

            JobPosting secondAppliedJobPosting = new JobPosting("회사2", "공고2", null, "원문2");
            secondAppliedJobPosting.changeApplicationStatus(ApplicationStatus.APPLIED);
            jobPostingRepository.save(secondAppliedJobPosting);

            JobPosting thirdAppliedJobPosting = new JobPosting("회사3", "공고3", null, "원문3");
            thirdAppliedJobPosting.changeApplicationStatus(ApplicationStatus.APPLIED);
            jobPostingRepository.save(thirdAppliedJobPosting);

            jobPostingRepository.save(
                            new JobPosting("회사4", "100% Remote Engineer", null, "원문4"));
            jobPostingRepository.save(
                            new JobPosting("회사5", "Java Developer", null, "원문5"));
                        
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

    @Test
    void 허용_목록에_없는_필드의_정렬_요청은_거부된다() throws Exception {
            mockMvc.perform(get("/api/job-postings").param("sort", "id,asc"))
                        .andExpect(status().isBadRequest())
                        .andExpect(jsonPath("$.status").value(400))   
                        .andExpect(jsonPath("$.code").value("INVALID_SORT_FIELD"))
                        .andExpect(jsonPath("$.message").value("허용되지 않는 정렬 필드입니다: id"));
    }

    @Test
    void 회사명_으로_정렬기능이_동작하는지_확인한다() throws Exception {
            jobPostingRepository.save(
                            new JobPosting("B", "Java Developer", null, "원문1"));
            jobPostingRepository.save(
                            new JobPosting("A", "Python Developer", null, "원문2"));
            jobPostingRepository.save(
                            new JobPosting("C", "C++ Developer", null, "원문3"));
        
            mockMvc.perform(get("/api/job-postings").param("sort", "companyName,asc"))
                            .andExpect(status().isOk())
                            .andExpect(jsonPath("$.content[0].companyName").value("A"))
                            .andExpect(jsonPath("$.content[1].companyName").value("B"))
                            .andExpect(jsonPath("$.content[2].companyName").value("C"));
    }

    @Test
    void 키워드와_지원상태로_필터링하고_회사명순으로_정렬할_수_있다() throws Exception {
            JobPosting charlie = jobPostingRepository.save(
                            new JobPosting("Charlie Company","AWS Engineer","https://example.com/charlie","Cloud"));
            JobPosting alpha = jobPostingRepository.save(
                            new JobPosting("Alpha Company", "AWS Engineer", "https://example.com/alpha", "Cloud"));
            JobPosting wrongKeyword = jobPostingRepository.save(
                            new JobPosting("Beta Company", "JAVA Engineer", "https://example.com/beta", "Spring"));
            JobPosting wrongStatus = jobPostingRepository.save(
                            new JobPosting("Delta Company", "AWS Engineer", "https://example.com/delta", "Cloud"));
            
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


    @Test
    void 기술이_포함된_공고에서__해당_포스트의_기술_스택을_확인할_수_있다() throws Exception {
            JobPosting charlie = jobPostingRepository.save(
                            new JobPosting("Charlie Company", "AWS Engineer", "https://example.com/charlie", "JavaとSpring Bootを使ったバックエンド開発です"));
            JobPosting alpha = jobPostingRepository.save(
                            new JobPosting("Alpha Company", "AWS Engineer", "https://example.com/alpha", "AWSとDockerを利用します。"));

            mockMvc.perform(get("/api/job-postings/{id}/skills", charlie.getId()))
                            .andExpect(status().isOk())
                            .andExpect(jsonPath("$[0]").value("Java" ))
                            .andExpect(jsonPath("$[1]").value("Spring Boot"));
            mockMvc.perform(get("/api/job-postings/{id}/skills", alpha.getId()))
                            .andExpect(status().isOk())
                            .andExpect(jsonPath("$[0]").value("AWS"))
                            .andExpect(jsonPath("$[1]").value("Docker"));
            
    }

    @Test
    void 기술이_기입되어_있지_않는_포스트의_경우_공백을_보여준다() throws Exception {
            JobPosting charlie = jobPostingRepository.save(
                            new JobPosting("Charlie Company", "AWS Engineer", "https://example.com/charlie",
                                            "営業部求人中"));
            mockMvc.perform(get("/api/job-postings/{id}/skills", charlie.getId()))
                            .andExpect(status().isOk())
                            .andExpect(jsonPath("$").isEmpty());
    }

    @Test 
    void 존재하지_않는_채용공고의_기술스택을_조회하면_404를_반환한다() throws Exception {
            mockMvc.perform(get("/api/job-postings/{id}/skills", 9999L))
                   .andExpect(status().isNotFound());
    }

    @Test
    void JavaScript가_포함된_내용을_조회하면_Java를_추출하지_않는다() throws Exception {
            JobPosting charlie = jobPostingRepository.save(
                            new JobPosting("Charlie Company", "AWS Engineer", "https://example.com/charlie",
                                            "JavaScript開発者求人中"));
            mockMvc.perform(get("/api/job-postings/{id}/skills", charlie.getId()))
                            .andExpect(status().isOk())
                            .andExpect(jsonPath("$").isEmpty());
    }

    @Test
    void 내용에_Cpp과_C가_모두_있을_때_Cpp과_C를_구분하여_추출한다() throws Exception {
            JobPosting charlie = jobPostingRepository.save(
                            new JobPosting("Charlie Company", "AWS Engineer", "https://example.com/charlie",
                                            "CとC++を全部開発できる人は大歓迎"));
            mockMvc.perform(get("/api/job-postings/{id}/skills", charlie.getId()))
                            .andExpect(status().isOk())
                            .andExpect(jsonPath("$", hasSize(2)))
                            .andExpect(jsonPath("$[0]").value("C"))
                            .andExpect(jsonPath("$[1]").value("C++"));
    }

    @Test
    void 내용에_Cpp만_있을_때_C를_추출하지_않는다() throws Exception {
            JobPosting charlie = jobPostingRepository.save(
                            new JobPosting("Charlie Company", "AWS Engineer", "https://example.com/charlie",
                                            "C++を開発できる人は大歓迎"));
            mockMvc.perform(get("/api/job-postings/{id}/skills", charlie.getId()))
                            .andExpect(status().isOk())
                            .andExpect(jsonPath("$", hasSize(1)))
                            .andExpect(jsonPath("$[0]").value("C++"));
    }
}