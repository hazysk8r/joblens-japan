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

    if (!from.isAfter(to)) {
      return true;
    }

    // デフォルトの制約違反を無効にする。
    context.disableDefaultConstraintViolation();
    // 既存のメッセージを使い、deadlineToに制約違反を追加する。
    context.buildConstraintViolationWithTemplate(context.getDefaultConstraintMessageTemplate())
        .addPropertyNode("deadlineTo")
        .addConstraintViolation();
    return false;
  }
}
