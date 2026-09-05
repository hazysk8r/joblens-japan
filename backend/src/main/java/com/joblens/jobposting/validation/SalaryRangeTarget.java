package com.joblens.jobposting.validation;

// Create/Update DTO 둘 다 salaryMin, salaryMax를 가지고 있다는 걸 Validator에게 공통된 방식으로 알려주는 역할
public interface SalaryRangeTarget {
  Integer salaryMin();
  Integer salaryMax();
}
