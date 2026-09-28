package com.joblens.jobposting.validation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = DeadlineRangeValidator.class)
public @interface ValidDeadlineRange {
  String message()
    default "시작일은 마감일보다 뒤의 날짜를 선택할 수 없습니다.";
  
  Class<?>[] groups() default {};

  Class<? extends Payload>[] payload() default {};
}