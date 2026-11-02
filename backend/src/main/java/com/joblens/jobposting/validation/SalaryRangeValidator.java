package com.joblens.jobposting.validation;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

// ValidSalaryRangeで範囲検証の対象と示されたものを、実際に比較する役割
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

    // 負の値は各フィールドの@PositiveOrZeroで検証し、範囲エラーとの競合を避ける。
    if (salaryMin < 0 || salaryMax < 0) {
      return true;
    }

    if (salaryMin <= salaryMax) {
      return true;
    }

    // デフォルトの制約違反を無効にする。
    context.disableDefaultConstraintViolation();
    // 既存のメッセージを使い、deadlineToに制約違反を追加する。
    context.buildConstraintViolationWithTemplate(context.getDefaultConstraintMessageTemplate())
        .addPropertyNode("salaryMax")
        .addConstraintViolation();
    return false;
  }
}
