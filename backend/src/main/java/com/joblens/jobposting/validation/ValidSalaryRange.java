package com.joblens.jobposting.validation;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;



@Target(ElementType.TYPE) // FieldではなくDTO全体に付けるAnnotation
@Retention(RetentionPolicy.RUNTIME) // Application実行中にもAnnotation情報を読めるようにするため
@Constraint(validatedBy = SalaryRangeValidator.class) // 実際の検証は SalaryRangeValidator に任せる

// 해당 DTO의 급여 범위 검증 대상임을 알려주는 역할
public @interface ValidSalaryRange {

  String message()
    default "최소 급여는 최대 급여보다 클 수 없습니다.";
  
  Class<?>[] groups() default {};

  Class<? extends Payload>[] payload() default {};
}