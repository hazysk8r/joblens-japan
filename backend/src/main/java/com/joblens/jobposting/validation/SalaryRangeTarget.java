package com.joblens.jobposting.validation;

// Create/UpdateのDTOがどちらもsalaryMin、salaryMaxを持つことを、Validatorに共通の方法で伝える役割
public interface SalaryRangeTarget {
  Integer salaryMin();
  Integer salaryMax();
}
