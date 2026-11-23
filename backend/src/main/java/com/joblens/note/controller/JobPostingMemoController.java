package com.joblens.note.controller;

import java.net.URI;
import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.joblens.auth.security.AuthenticatedUser;
import com.joblens.common.web.IfMatchHeader;
import com.joblens.note.dto.CreateJobPostingMemoRequest;
import com.joblens.note.dto.JobPostingMemoResponse;
import com.joblens.note.dto.UpdateJobPostingMemoRequest;
import com.joblens.note.service.JobPostingMemoService;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/job-postings/{jobPostingId}/notes")
@RequiredArgsConstructor

public class JobPostingMemoController {
  private final JobPostingMemoService jobPostingMemoService;

  @PostMapping
  public ResponseEntity<JobPostingMemoResponse> create(
        @AuthenticationPrincipal AuthenticatedUser user,
        @PathVariable Long jobPostingId, // URLパスの中の値をControllerの変数として取り出すため
        @Valid @RequestBody CreateJobPostingMemoRequest request // @Validを使い、不正なContentをControllerで弾く
  ) {
    JobPostingMemoResponse response = jobPostingMemoService.create(user.getId(), jobPostingId, request);

    return ResponseEntity
            .created(URI.create("/api/job-postings/" + jobPostingId + "/notes/" + response.id()))
            .body(response);
  }

  @GetMapping
  public ResponseEntity<List<JobPostingMemoResponse>> getMemos(
    @AuthenticationPrincipal AuthenticatedUser user,
    @PathVariable Long jobPostingId
  ) {
    List<JobPostingMemoResponse> response = jobPostingMemoService.getMemos(user.getId(), jobPostingId);
    return ResponseEntity.ok(response);
  }

  @DeleteMapping("/{memoId}")
  public ResponseEntity<Void> delete(
    @AuthenticationPrincipal AuthenticatedUser user,
    @PathVariable Long memoId, 
    @PathVariable Long jobPostingId
  ) {
    jobPostingMemoService.delete(user.getId(), jobPostingId, memoId);

    return ResponseEntity.noContent().build();
  }

  /**
   * メモを編集する。求人と同じく、画面が読み込んだときのバージョンをIf-Matchで受け取り、
   * ほかで先に保存されていれば412にして上書きしない。
   */
  @PutMapping("/{memoId}")
  public ResponseEntity<JobPostingMemoResponse> update(
    @AuthenticationPrincipal AuthenticatedUser user,
    @PathVariable Long memoId,
    @PathVariable Long jobPostingId,
    @RequestHeader(value = "If-Match", required = false) String ifMatch,
    @Valid @RequestBody UpdateJobPostingMemoRequest request
  ) {
    Long expectedVersion = IfMatchHeader.parse(ifMatch);
    JobPostingMemoResponse response =
        jobPostingMemoService.update(user.getId(), jobPostingId, memoId, expectedVersion, request);

    return ResponseEntity
            .ok()
            .eTag(String.valueOf(response.version()))
            .body(response);
  }
}