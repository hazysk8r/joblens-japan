package com.joblens.note.controller;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.springframework.http.MediaType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;


import com.joblens.TestcontainersConfiguration;
import com.joblens.jobposting.domain.JobPosting;
import com.joblens.jobposting.repository.JobPostingRepository;
import com.joblens.note.domain.JobPostingMemo;
import com.joblens.note.repository.JobPostingMemoRepository;


@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
public class JobPostingMemoControllerTest {
  
  @Autowired
  private MockMvc mockMvc;
  
  @Autowired
  private JobPostingMemoRepository jobPostingMemoRepository;

  @Autowired
  private JobPostingRepository jobPostingRepository;

  @BeforeEach
  void setUp() {
    /*
     * 각 테스트가 이전 테스트 데이터의 영향을 받지 않도록
     * 테스트 실행 전 데이터를 초기화
     */
    jobPostingMemoRepository.deleteAll();
  }

  @Test
  void 정상적으로_생성된_메모는_201_created_를_보여준다() throws Exception {
    JobPosting savedJobPosting = jobPostingRepository.save(
        new JobPosting(
            "テスト会社",
            "メモテスト情報",
            "https://example.com/memotest",
            "メモが正常に作動するかな"));

    Long jobPostingId = savedJobPosting.getId();

    String requestBody = """
        {
          "content": "面接で確認したい内容"
        }
        """;
    mockMvc.perform(post("/api/job-postings/{jobPostingId}/notes", jobPostingId)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(requestBody))
           .andExpect(status().isCreated())
           .andExpect(jsonPath("$.id").exists())
           .andExpect(jsonPath("$.content").value("面接で確認したい内容"));
  }

  @Test
  void 존재하지_않는_채용공고에_메모를_작성할려고_하면_404_코드를_보여준다() throws Exception {
    String requestBody = """
        {
          "content": "面接で確認したい内容"
        }
        """;
    mockMvc.perform(post("/api/job-postings/{jobPostingId}/notes", 9999L)
        .contentType(MediaType.APPLICATION_JSON)
        .content(requestBody))
        .andExpect(status().isNotFound());
  }

  @Test
  void 공백만_있는_메모를_작성하면_400_bad_request를_반환한다() throws Exception {
    JobPosting savedJobPosting = jobPostingRepository.save(
        new JobPosting(
            "テスト会社",
            "メモテスト情報",
            "https://example.com/memotest",
            "メモが正常に作動するかな"));

    Long jobPostingId = savedJobPosting.getId();

    String requestBody = """
        {
          "content": "      "
        }
        """;
    mockMvc.perform(post("/api/job-postings/{jobPostingId}/notes", jobPostingId)
        .contentType(MediaType.APPLICATION_JSON)
        .content(requestBody))
        .andExpect(status().isBadRequest());
  }

  @Test
  void 메모를_글자수_250자_이상으로_작성하면_400_bad_request를_반환한다() throws Exception {
    JobPosting savedJobPosting = jobPostingRepository.save(
        new JobPosting(
            "テスト会社",
            "メモテスト情報",
            "https://example.com/memotest",
            "メモが正常に作動するかな"));

    Long jobPostingId = savedJobPosting.getId();

    String tooLongContent = "a".repeat(251); //글자 수 250자 이상을 테스트하기 위한 문자열 반복 생성
    String requestBody = """
        {
          "content": "%s"
        }
        """.formatted(tooLongContent);
    mockMvc.perform(post("/api/job-postings/{jobPostingId}/notes", jobPostingId)
        .contentType(MediaType.APPLICATION_JSON)
        .content(requestBody))
        .andExpect(status().isBadRequest());
  }

  @Test
  void 저장된_메모_목록을_조회할_수_있다() throws Exception {
    JobPosting savedJobPosting = jobPostingRepository.save(
        new JobPosting(
            "テスト会社",
            "メモテスト情報",
            "https://example.com/memotest",
            "メモが正常に作動するかな"));
    
    jobPostingMemoRepository.save(new JobPostingMemo("メモテストA", savedJobPosting));
    jobPostingMemoRepository.save(new JobPostingMemo("メモテストB", savedJobPosting));


    Long jobPostingId = savedJobPosting.getId();

    mockMvc.perform(get("/api/job-postings/{jobPostingId}/notes", jobPostingId))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$", hasSize(2)))
          .andExpect(jsonPath("$[*].content", containsInAnyOrder("メモテストA", "メモテストB")));
  }

  @Test
  void 존재하지_않는_채용공고의_메모를_조회하면_404를_반환한다() throws Exception {
    mockMvc.perform(get("/api/job-postings/{jobPostingId}/notes", 9999L))
          .andExpect(status().isNotFound());
  }

  @Test
  void 메모를_삭제하면_204를_반환하고_DB에서_제거된다() throws Exception {
    JobPosting savedJobPosting = jobPostingRepository.save(
        new JobPosting(
            "テスト会社",
            "メモテスト情報",
            "https://example.com/memotest",
            "メモが正常に作動するかな"));

    JobPostingMemo savedJobPostingMemo = jobPostingMemoRepository.save(
      new JobPostingMemo("メモテストA", savedJobPosting));

    Long jobPostingId = savedJobPosting.getId();
    Long memoId = savedJobPostingMemo.getId();

    mockMvc.perform(delete("/api/job-postings/{jobPostingId}/notes/{memoId}", jobPostingId, memoId))
            .andExpect(status().isNoContent());
    assertFalse(
        jobPostingMemoRepository.existsById(memoId));
  }

  @Test
  void 존재하지_않는_채용공고에_대한_메모를_삭제하려고_하면_404_코드를_보여준다() throws Exception {
    mockMvc.perform(delete("/api/job-postings/{jobPostingId}/notes/{memoId}", 9999L, 9999L))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("JOB_POSTING_NOT_FOUND"));
  }

  @Test
  void 존재하지_않는_메모를_삭제할려고_하면_404_코드를_보여준다() throws Exception {
    JobPosting savedJobPostingA = jobPostingRepository.save(
        new JobPosting(
            "テスト会社",
            "メモテスト情報",
            "https://example.com/memotest",
            "メモが正常に作動するかな"));

    Long jobPostingId = savedJobPostingA.getId();

    mockMvc.perform(delete("/api/job-postings/{jobPostingId}/notes/{memoId}", jobPostingId, 9999L))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("JOB_POSTING_MEMO_NOT_FOUND"));
  }

  @Test
  void 다른_채용공고에_속한_메모를_삭제하려고_하면_404를_반환하고_메모를_유지한다() throws Exception {
    JobPosting savedJobPostingA = jobPostingRepository.save(
        new JobPosting(
            "テスト会社",
            "メモテスト情報",
            "https://example.com/memotest",
            "メモが正常に作動するかな"));
    JobPosting savedJobPostingB = jobPostingRepository.save(
        new JobPosting(
            "テスト会社",
            "メモテスト情報",
            "https://example.com/memotest",
            "メモが正常に作動するかな"));

    JobPostingMemo savedJobPostingMemo = jobPostingMemoRepository.save(new JobPostingMemo("メモテストA", savedJobPostingA));

    Long jobPostingIdNot = savedJobPostingB.getId();
    Long memoId = savedJobPostingMemo.getId();

    mockMvc.perform(delete("/api/job-postings/{jobPostingId}/notes/{memoId}", jobPostingIdNot, memoId))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("JOB_POSTING_MEMO_NOT_FOUND"));
    
    assertTrue(
        jobPostingMemoRepository.existsById(memoId));
  }



}
