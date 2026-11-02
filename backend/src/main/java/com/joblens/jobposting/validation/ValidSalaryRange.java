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

// 該当するDTOが月給範囲の検証対象であることを示す役割
public @interface ValidSalaryRange {

  String message()
    default "最低月給を最高月給より大きくすることはできません。";
  
  Class<?>[] groups() default {};

  Class<? extends Payload>[] payload() default {};
}