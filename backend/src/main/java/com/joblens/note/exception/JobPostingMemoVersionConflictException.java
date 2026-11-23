package com.joblens.note.exception;

/**
 * メモの更新競合を表す例外。
 * 事前のversion不一致と、保存時の楽観的ロック競合に使用する。
 * 保存時の競合では、原因となった例外を保持する。
 */
public class JobPostingMemoVersionConflictException extends RuntimeException {

  public JobPostingMemoVersionConflictException(Long memoId, Long requestedVersion, Long currentVersion) {
    super("JobPostingMemo version conflict. id=" + memoId
        + ", requestedVersion=" + requestedVersion
        + ", currentVersion=" + currentVersion);
  }

  public JobPostingMemoVersionConflictException(Long memoId, Throwable cause) {
    super("JobPostingMemo was modified while saving. id=" + memoId, cause);
  }
}
