package com.joblens.jobposting.validation;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

// ValidSalaryRange가 범위 검증 대상임을 알려주면, 실제 비교를 수행하는 역할
public class SalaryRangeValidator implements ConstraintValidator<ValidSalaryRange, SalaryRangeTarget> {
  
  @Override 
  public boolean isValid(
    SalaryRangeTarget value,
    ConstraintValidatorContext context // 検証失敗時のエラーメッセージや、どのフィールドにエラーを関連付けるかを細かく調整するためのもの。
  ) {
    if (value == null) {
      return true;
    }

    Integer salaryMin = value.salaryMin();
    Integer salaryMax = value.salaryMax();

    if (salaryMin == null || salaryMax == null) {
      return true;
    }

    return salaryMin <= salaryMax;
  }
}
