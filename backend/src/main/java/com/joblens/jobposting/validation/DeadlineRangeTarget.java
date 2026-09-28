package com.joblens.jobposting.validation;

import java.time.LocalDate;

public interface DeadlineRangeTarget {
  LocalDate deadlineFrom();
  LocalDate deadlineTo();
}
