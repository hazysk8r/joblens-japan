package com.joblens.jobposting.dto;

import java.time.Instant;

import com.joblens.jobposting.domain.ApplicationStatus;
import com.joblens.jobposting.domain.JobPostingStatusHistory;

public record JobPostingStatusHistoryResponse(
  Long id,
  ApplicationStatus fromStatus,
  ApplicationStatus toStatus,
  Instant changedAt
) {

  public static JobPostingStatusHistoryResponse from(JobPostingStatusHistory jobPostingStatusHistory) {
    return new JobPostingStatusHistoryResponse(
      jobPostingStatusHistory.getId(), 
      jobPostingStatusHistory.getFromStatus(), 
      jobPostingStatusHistory.getToStatus(), 
      jobPostingStatusHistory.getChangedAt()
    );
  }
}
