package com.joblens.note.dto;

import java.time.Instant;

import com.joblens.note.domain.JobPostingMemo;

public record JobPostingMemoResponse(
    Long id,
    String content,
    Instant createdAt,
    Instant updatedAt,
    // 編集のときにIf-Matchで送り返すバージョン。
    Long version
) {

  public static JobPostingMemoResponse from (JobPostingMemo jobPostingMemo) {
    return new JobPostingMemoResponse(
      jobPostingMemo.getId(),
      jobPostingMemo.getContent(),
      jobPostingMemo.getCreatedAt(),
      jobPostingMemo.getUpdatedAt(),
      jobPostingMemo.getVersion()
    );
  }
}
