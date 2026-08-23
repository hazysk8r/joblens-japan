package com.joblens.note.dto;

import java.time.Instant;

import com.joblens.note.domain.JobPostingMemo;

public record JobPostingMemoResponse(
    Long id,
    String content,
    Instant createdAt,
    Instant updatedAt
) {

  public static JobPostingMemoResponse from (JobPostingMemo jobPostingMemo) {
    return new JobPostingMemoResponse(
      jobPostingMemo.getId(), 
      jobPostingMemo.getContent(), 
      jobPostingMemo.getCreatedAt(), 
      jobPostingMemo.getUpdatedAt()
    );
  }
}
