package com.joblens.jobposting.dto;

import java.time.LocalDate;

public record JobPostingDeadlineFilterRequest(
  LocalDate deadlineFrom,
  LocalDate deadlineTo
) {
  
}
