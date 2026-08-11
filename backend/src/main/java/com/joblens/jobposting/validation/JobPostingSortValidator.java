package com.joblens.jobposting.validation;

import java.util.Set;

import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Component;

import com.joblens.jobposting.exception.InvalidSortFieldException;

@Component
public class JobPostingSortValidator {
  // Validator 객체들이 하나의 목록을 공유하며, 다른 Set으로 교체를 막고, Set안의 내용 수정을 막기 위함
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