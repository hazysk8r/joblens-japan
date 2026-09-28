package com.joblens.jobposting.validation;

import java.time.LocalDate;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

public class DeadlineRangeValidator implements ConstraintValidator<ValidDeadlineRange, DeadlineRangeTarget> {
  
  @Override 
  public boolean isValid(
    DeadlineRangeTarget value,
    ConstraintValidatorContext context
  ) {
    if (value == null) {
      return true;
    }

    LocalDate from = value.deadlineFrom();
    LocalDate to = value.deadlineTo();

    if (from == null || to == null) {
      return true;
    }

    return !from.isAfter(to);
  }
}
