package com.joblens.note.exception;

public class JobPostingMemoNotFoundException extends RuntimeException {

  public JobPostingMemoNotFoundException(Long memoId, Long jobPostingId) {
    super(
        "メモが見つかりません。memoId="
            + memoId
            + ", jobPostingId="
            + jobPostingId);
  }
}
