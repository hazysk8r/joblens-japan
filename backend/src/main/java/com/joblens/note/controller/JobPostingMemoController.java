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
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.joblens.auth.security.AuthenticatedUser;
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
        @PathVariable Long jobPostingId, // URL 경로 안에 들어있는 값을 Controller의 변수로 꺼내오기 위함
        @Valid @RequestBody CreateJobPostingMemoRequest request //@Valid를 사용하여 잘못된 Content는 Controller에서 걸러냄
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

  @PutMapping("/{memoId}")
  public JobPostingMemoResponse update(
    @AuthenticationPrincipal AuthenticatedUser user,
    @PathVariable Long memoId,
    @PathVariable Long jobPostingId,
    @Valid @RequestBody UpdateJobPostingMemoRequest request
  ) {
    return jobPostingMemoService.update(user.getId(), jobPostingId, memoId, request);
  }
}