package com.joblens.jobposting.exception;

/**
 * 求人情報の更新競合を表す例外。
 * 事前のversion不一致と、保存時の楽観的ロック競合に使用する。
 * 保存時の競合では、原因となった例外を保持する。
 */
public class JobPostingVersionConflictException extends RuntimeException {

  public JobPostingVersionConflictException(
    Long id,
    Long requestedVersion,
    Long currentVersion
  ) {
    super(
      "JobPosting version conflict. id=" + id
        + ", requestedVersion=" + requestedVersion
        + ", currentVersion=" + currentVersion
    );
  }

  public JobPostingVersionConflictException(
    Long id,
    Throwable cause
  ) {
    super(
      "JobPosting was modified while saving. id=" + id,
      cause
    );
  }
}