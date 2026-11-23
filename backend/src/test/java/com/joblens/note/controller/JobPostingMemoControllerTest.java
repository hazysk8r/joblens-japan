package com.joblens.note.controller;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;


import com.joblens.AuthenticatedMockMvcConfiguration;
import com.joblens.TestUsers;
import com.joblens.TestcontainersConfiguration;
import com.joblens.jobposting.domain.JobPosting;
import com.joblens.jobposting.repository.JobPostingRepository;
import com.joblens.note.domain.JobPostingMemo;
import com.joblens.note.repository.JobPostingMemoRepository;

import tools.jackson.databind.ObjectMapper;


@SpringBootTest
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, AuthenticatedMockMvcConfiguration.class})
public class JobPostingMemoControllerTest {
  
  @Autowired
  private MockMvc mockMvc;
  
  @Autowired
  private JobPostingMemoRepository jobPostingMemoRepository;

  @Autowired
  private JobPostingRepository jobPostingRepository;

  @Autowired
  private TestUsers testUsers;

  @Autowired
  ObjectMapper objectMapper;

  @BeforeEach
  void setUp() {
    /*
     * 各テストが以前のテストデータの影響を受けないよう、
     * テスト実行前にデータを初期化する
     */
    jobPostingMemoRepository.deleteAll();
  }

  @Test
  void 正しく作成されたメモは_201_createdを返す() throws Exception {
    JobPosting savedJobPosting = jobPostingRepository.save(
        new JobPosting(
            testUsers.defaultUserId(),
            "テスト会社",
            "メモテスト情報",
            "https://example.com/memotest",
            "メモが正常に作動するかな", 
            null, 
            null,
            null
        ));

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
  void 存在しない求人にメモを書こうとすると_404を返す() throws Exception {
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
  void 空白だけのメモを書くと_400_bad_requestを返す() throws Exception {
    JobPosting savedJobPosting = jobPostingRepository.save(
        new JobPosting(
            testUsers.defaultUserId(),
            "テスト会社",
            "メモテスト情報",
            "https://example.com/memotest",
            "メモが正常に作動するかな", 
            null, 
            null,
            null
        ));

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
  void メモを250文字より長く書くと_400_bad_requestを返す() throws Exception {
    JobPosting savedJobPosting = jobPostingRepository.save(
        new JobPosting(
            testUsers.defaultUserId(),
            "テスト会社",
            "メモテスト情報",
            "https://example.com/memotest",
            "メモが正常に作動するかな", 
            null, 
            null,
            null
        ));

    Long jobPostingId = savedJobPosting.getId();

    String tooLongContent = "a".repeat(251); //250文字を超える場合をテストするために文字列を繰り返して作る
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
  void 保存されたメモの一覧を取得できる() throws Exception {
    JobPosting savedJobPosting = jobPostingRepository.save(
        new JobPosting(
            testUsers.defaultUserId(),
            "テスト会社",
            "メモテスト情報",
            "https://example.com/memotest",
            "メモが正常に作動するかな", 
            null, 
            null,
            null
        ));
    
    jobPostingMemoRepository.save(new JobPostingMemo("メモテストA", savedJobPosting));
    jobPostingMemoRepository.save(new JobPostingMemo("メモテストB", savedJobPosting));


    Long jobPostingId = savedJobPosting.getId();

    mockMvc.perform(get("/api/job-postings/{jobPostingId}/notes", jobPostingId))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$", hasSize(2)))
          .andExpect(jsonPath("$[*].content", containsInAnyOrder("メモテストA", "メモテストB")));
  }

  @Test
  void 存在しない求人のメモを取得すると_404を返す() throws Exception {
    mockMvc.perform(get("/api/job-postings/{jobPostingId}/notes", 9999L))
          .andExpect(status().isNotFound());
  }

  @Test
  void メモを削除すると_204を返しDBから削除される() throws Exception {
    JobPosting savedJobPosting = jobPostingRepository.save(
        new JobPosting(
            testUsers.defaultUserId(),
            "テスト会社",
            "メモテスト情報",
            "https://example.com/memotest",
            "メモが正常に作動するかな", 
            null, 
            null,
            null
        ));

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
  void 存在しない求人のメモを削除しようとすると_404を返す() throws Exception {
    mockMvc.perform(delete("/api/job-postings/{jobPostingId}/notes/{memoId}", 9999L, 9999L))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("JOB_POSTING_NOT_FOUND"));
  }

  @Test
  void 存在しないメモを削除しようとすると_404を返す() throws Exception {
    JobPosting savedJobPostingA = jobPostingRepository.save(
        new JobPosting(
            testUsers.defaultUserId(),
            "テスト会社",
            "メモテスト情報",
            "https://example.com/memotest",
            "メモが正常に作動するかな", 
            null, 
            null,
            null
        ));

    Long jobPostingId = savedJobPostingA.getId();

    mockMvc.perform(delete("/api/job-postings/{jobPostingId}/notes/{memoId}", jobPostingId, 9999L))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("JOB_POSTING_MEMO_NOT_FOUND"));
  }

  @Test
  void 別の求人のメモを削除しようとすると_404を返しメモを維持する() throws Exception {
    JobPosting savedJobPostingA = jobPostingRepository.save(
        new JobPosting(
            testUsers.defaultUserId(),
            "テスト会社",
            "メモテスト情報",
            "https://example.com/memotest",
            "メモが正常に作動するかな", 
            null, 
            null,
            null
        ));
    JobPosting savedJobPostingB = jobPostingRepository.save(
        new JobPosting(
            testUsers.defaultUserId(),
            "テスト会社",
            "メモテスト情報",
            "https://example.com/memotest",
            "メモが正常に作動するかな", 
            null, 
            null,
            null
        ));

    JobPostingMemo savedJobPostingMemo = jobPostingMemoRepository.save(new JobPostingMemo("メモテストA", savedJobPostingA));

    Long jobPostingIdNot = savedJobPostingB.getId();
    Long memoId = savedJobPostingMemo.getId();

    mockMvc.perform(delete("/api/job-postings/{jobPostingId}/notes/{memoId}", jobPostingIdNot, memoId))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("JOB_POSTING_MEMO_NOT_FOUND"));
    
    assertTrue(
        jobPostingMemoRepository.existsById(memoId));
  }

  @Test
  void メモを編集すると変更内容を返す() throws Exception {
    JobPosting savedJobPosting = jobPostingRepository.save(
        new JobPosting(
            testUsers.defaultUserId(),
            "テスト会社",
            "メモテスト情報",
            "https://example.com/memotest",
            "メモが正常に作動するかな", 
            null, 
            null,
            null
        ));
    JobPostingMemo savedJobPostingMemo = jobPostingMemoRepository.save(new JobPostingMemo("メモテストA", savedJobPosting));

    String requestBody = """
        {
        "content": "変更後のメモ"
        }
        """;

    Long jobPostingId = savedJobPosting.getId();
    Long memoId = savedJobPostingMemo.getId();

    mockMvc.perform(put("/api/job-postings/{jobPostingId}/notes/{memoId}", 
                    jobPostingId, 
                    memoId)
                  .header(HttpHeaders.IF_MATCH, "\"0\"")
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(requestBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(memoId))
                .andExpect(jsonPath("$.content").value("変更後のメモ"));
        JobPostingMemo updatedJobPostingMemo = jobPostingMemoRepository
                  .findByIdAndJobPosting_Id(memoId, jobPostingId)
                  .orElseThrow();
        assertEquals("変更後のメモ", updatedJobPostingMemo.getContent());
    
  }

  @Test
  void 別の求人のメモを編集しようとすると_404を返す() throws Exception {
    JobPosting savedJobPostingA = jobPostingRepository.save(
        new JobPosting(
            testUsers.defaultUserId(),
            "テスト会社",
            "メモテスト情報",
            "https://example.com/memotest",
            "メモが正常に作動するかな", 
            null, 
            null,
            null
        ));
    JobPosting savedJobPostingB = jobPostingRepository.save(
        new JobPosting(
            testUsers.defaultUserId(),
            "テスト会社",
            "メモテスト情報",
            "https://example.com/memotest",
            "メモが正常に作動するかな", 
            null, 
            null,
            null
        ));
    JobPostingMemo savedJobPostingMemoA = jobPostingMemoRepository.save(new JobPostingMemo("メモテストA", savedJobPostingA));
    

    String requestBody = """
        {
        "content": "変更後のメモ"
        }
        """;

    Long jobPostingId = savedJobPostingB.getId();
    Long memoId = savedJobPostingMemoA.getId();

    mockMvc.perform(put("/api/job-postings/{jobPostingId}/notes/{memoId}",
        jobPostingId,
        memoId)
                  .header(HttpHeaders.IF_MATCH, "\"0\"")
        .contentType(MediaType.APPLICATION_JSON)
        .content(requestBody))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code")
            .value("JOB_POSTING_MEMO_NOT_FOUND"));
    
    JobPostingMemo unchangedMemo = jobPostingMemoRepository.findById(memoId).orElseThrow();
    assertEquals("メモテストA", unchangedMemo.getContent());

  }

  @Test
  void 更新されたメモが最新のメモとして並ぶ() throws Exception {
    JobPosting savedJobPostingA = jobPostingRepository.save(
        new JobPosting(
            testUsers.defaultUserId(),
            "テスト会社",
            "メモテスト情報",
            "https://example.com/memotest",
            "メモが正常に作動するかな", 
            null, 
            null,
            null
        ));
    JobPostingMemo savedJobPostingMemoA = jobPostingMemoRepository.save(new JobPostingMemo("メモテストA", savedJobPostingA));
    JobPostingMemo savedJobPostingMemoB = jobPostingMemoRepository.save(new JobPostingMemo("メモテストB", savedJobPostingA));

    String requestBody = """
        {
        "content": "修正後のメモ"
        }
        """;
    

    Long jobPostingId = savedJobPostingA.getId();
    Long memoAId = savedJobPostingMemoA.getId();
    Long memoBId = savedJobPostingMemoB.getId();

    mockMvc.perform(put("/api/job-postings/{jobPostingId}/notes/{memoId}",
        jobPostingId,
        memoAId)
                  .header(HttpHeaders.IF_MATCH, "\"0\"")
        .contentType(MediaType.APPLICATION_JSON)
        .content(requestBody))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.id").value(memoAId))
        .andExpect(jsonPath("$.content").value("修正後のメモ"));

    mockMvc.perform(get("/api/job-postings/{jobPostingId}/notes",
        jobPostingId))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].id").value(memoAId))
        .andExpect(jsonPath("$[0].content").value("修正後のメモ"))
        .andExpect(jsonPath("$[1].id").value(memoBId));

    JobPostingMemo updatedMemo = jobPostingMemoRepository.findById(memoAId).orElseThrow();
    assertEquals("修正後のメモ", updatedMemo.getContent());

  }

  @Test
  void 編集の応答のupdatedAtとその後に取得したupdatedAtが同じである() throws Exception {
      JobPosting savedJobPosting = jobPostingRepository.save(
              new JobPosting(
                      testUsers.defaultUserId(),
                      "テスト会社",
                      "メモテスト情報",
                      "https://example.com/memotest",
                      "メモが正常に作動するかな",
                      null,
                      null,
                      null));

      JobPostingMemo savedJobPostingMemo = jobPostingMemoRepository
              .save(new JobPostingMemo("メモテストA", savedJobPosting));

      Long jobPostingId = savedJobPosting.getId();
      Long memoId = savedJobPostingMemo.getId();
      
      String updateResponse = mockMvc.perform(
              put("/api/job-postings/{jobPostingId}/notes/{memoId}",
                      jobPostingId, memoId)
                  .header(HttpHeaders.IF_MATCH, "\"0\"")
                      .contentType(MediaType.APPLICATION_JSON)
                      .content("""
                              {
                                "content": "変更後のメモ"
                              }
                              """))
              .andExpect(status().isOk())
              .andReturn()
              .getResponse()
              .getContentAsString();

      String updatedAt = objectMapper.readTree(updateResponse)
              .get("updatedAt")
              .asString();

      mockMvc.perform(
              get("/api/job-postings/{jobPostingId}/notes",
                      jobPostingId))
              .andExpect(status().isOk())
              .andExpect(
                      jsonPath("$[0].updatedAt")
                              .value(updatedAt));
  }

  // ---- 同時編集による上書きの防止(If-Matchとバージョン)

  private JobPostingMemo saveMemo(String content) {
    JobPosting jobPosting = jobPostingRepository.save(new JobPosting(
        testUsers.defaultUserId(), "テスト会社", "メモテスト情報", "https://example.com/memotest",
        "メモが正常に作動するかな", null, null, null));
    return jobPostingMemoRepository.save(new JobPostingMemo(content, jobPosting));
  }

  private ResultActions updateMemo(JobPostingMemo memo, String ifMatch, String content) throws Exception {
    var request = put("/api/job-postings/{jobPostingId}/notes/{memoId}", memo.getJobPosting().getId(), memo.getId())
        .contentType(MediaType.APPLICATION_JSON)
        .content(objectMapper.writeValueAsString(java.util.Map.of("content", content)));
    if (ifMatch != null) {
      request.header(HttpHeaders.IF_MATCH, ifMatch);
    }
    return mockMvc.perform(request);
  }

  private String contentOf(JobPostingMemo memo) {
    return jobPostingMemoRepository.findById(memo.getId()).orElseThrow().getContent();
  }

  @Test
  void 登録と一覧の応答にバージョンを含める() throws Exception {
    JobPostingMemo memo = saveMemo("メモ");

    mockMvc.perform(post("/api/job-postings/{jobPostingId}/notes", memo.getJobPosting().getId())
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {
                  "content": "新しいメモ"
                }
                """))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.version").value(0));

    mockMvc.perform(get("/api/job-postings/{jobPostingId}/notes", memo.getJobPosting().getId()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[*].version", containsInAnyOrder(0, 0)));
  }

  @Test
  void 編集に成功するとバージョンを上げてETagで返す() throws Exception {
    JobPostingMemo memo = saveMemo("メモ");

    updateMemo(memo, "\"0\"", "1回目")
        .andExpect(status().isOk())
        .andExpect(header().string(HttpHeaders.ETAG, "\"1\""))
        .andExpect(jsonPath("$.version").value(1));
    updateMemo(memo, "\"1\"", "2回目")
        .andExpect(status().isOk())
        .andExpect(header().string(HttpHeaders.ETAG, "\"2\""))
        .andExpect(jsonPath("$.version").value(2));

    assertEquals("2回目", contentOf(memo));
  }

  @Test
  void 以前のバージョンで編集すると_412を返し内容を変えない() throws Exception {
    JobPostingMemo memo = saveMemo("メモ");
    // 別の画面で先に保存された。
    updateMemo(memo, "\"0\"", "別の画面の内容").andExpect(status().isOk());

    updateMemo(memo, "\"0\"", "この画面の内容")
        .andExpect(status().isPreconditionFailed())
        .andExpect(jsonPath("$.code").value("JOB_POSTING_MEMO_VERSION_CONFLICT"));

    assertEquals("別の画面の内容", contentOf(memo));
  }

  @Test
  void If_Matchがなければ_428を返し内容を変えない() throws Exception {
    JobPostingMemo memo = saveMemo("メモ");

    updateMemo(memo, null, "変更後")
        .andExpect(status().isPreconditionRequired())
        .andExpect(jsonPath("$.code").value("IF_MATCH_REQUIRED"));

    assertEquals("メモ", contentOf(memo));
  }

  @ParameterizedTest
  @ValueSource(strings = {"0", "W/\"0\"", "\"abc\"", "\"-1\"", "\"99999999999999999999\"", "*"})
  void If_Matchの形式が正しくなければ_400を返し内容を変えない(String ifMatch) throws Exception {
    JobPostingMemo memo = saveMemo("メモ");

    updateMemo(memo, ifMatch, "変更後")
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("MALFORMED_IF_MATCH_HEADER"));

    assertEquals("メモ", contentOf(memo));
  }

  @Test
  void 別の求人のメモを誤ったバージョンで編集しても_412ではなく_404を返す() throws Exception {
    JobPostingMemo memo = saveMemo("メモ");
    JobPostingMemo otherMemo = saveMemo("別の求人のメモ");

    mockMvc.perform(put("/api/job-postings/{jobPostingId}/notes/{memoId}",
            memo.getJobPosting().getId(), otherMemo.getId())
            .header(HttpHeaders.IF_MATCH, "\"99\"")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {
                  "content": "変更後"
                }
                """))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("JOB_POSTING_MEMO_NOT_FOUND"));

    assertEquals("別の求人のメモ", contentOf(otherMemo));
  }

}
