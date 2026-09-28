package com.joblens.jobposting.dto;

import java.time.LocalDate;

import com.joblens.jobposting.validation.DeadlineRangeTarget;
import com.joblens.jobposting.validation.ValidDeadlineRange;

@ValidDeadlineRange 
public record JobPostingDeadlineFilterRequest(
  LocalDate deadlineFrom,
  LocalDate deadlineTo
) implements DeadlineRangeTarget{
  
}
