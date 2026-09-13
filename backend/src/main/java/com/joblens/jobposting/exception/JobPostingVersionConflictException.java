package com.joblens.jobposting.exception;

public class JobPostingVersionConflictException extends RuntimeException {

  public JobPostingVersionConflictException(
    Long id,
    Long requstedVersion,
    Long currentVersion
  ) {
    super(
      "JobPosting version conflict. id=" + id
        + ", requestedVersion=" + requstedVersion
        + ", currentVersion=" + currentVersion
    );
  }
}