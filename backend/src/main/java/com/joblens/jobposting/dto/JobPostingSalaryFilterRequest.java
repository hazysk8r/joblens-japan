package com.joblens.jobposting.dto;

import com.joblens.jobposting.validation.SalaryRangeTarget;
import com.joblens.jobposting.validation.ValidSalaryRange;
import jakarta.validation.constraints.PositiveOrZero;

/*
 * GET検索で使用する月給範囲条件。
 * 既存のSalaryRangeValidatorを再利用するため、
 * SalaryRangeTargetを実装する。
 */
@ValidSalaryRange
public record JobPostingSalaryFilterRequest(

  @PositiveOrZero
  Integer salaryMin,

  @PositiveOrZero
  Integer salaryMax

) implements SalaryRangeTarget{
}
