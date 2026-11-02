package com.joblens.jobposting.validation;

import java.util.Set;

import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Component;

import com.joblens.jobposting.exception.InvalidSortFieldException;

@Component
public class JobPostingSortValidator {
  // Validatorのオブジェクトが1つの一覧を共有し、別のSetへの差し替えとSetの中身の変更を防ぐため
  private static final Set<String> ALLOWED_SORT_FIELDS = 
    Set.of("createdAt", "companyName");
  public void validate(Sort sort) {
    for (Sort.Order order : sort) {
      String property = order.getProperty();

      if(!ALLOWED_SORT_FIELDS.contains(property)) {
        throw new InvalidSortFieldException(property);
      }
    }
  }
}