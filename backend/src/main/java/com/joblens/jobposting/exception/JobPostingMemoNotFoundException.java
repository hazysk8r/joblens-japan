package com.joblens.jobposting.exception;

public class JobPostingMemoNotFoundException extends RuntimeException {

  public JobPostingMemoNotFoundException(Long memoId, Long jobPostingId) {
    super(
        "메모를 찾을 수 없습니다. memoId="
            + memoId
            + ", jobPostingId="
            + jobPostingId);
  }
}
