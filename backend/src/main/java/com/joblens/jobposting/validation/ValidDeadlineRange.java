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
    default "締切日（以降）を締切日（以前）より後の日付にすることはできません。";
  
  Class<?>[] groups() default {};

  Class<? extends Payload>[] payload() default {};
}