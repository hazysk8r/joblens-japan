package com.joblens.jobposting.exception;

public class InvalidSortFieldException extends IllegalArgumentException{
  public InvalidSortFieldException(String invalidSortField) {
    super(
      "허용되지 않는 정렬 필드입니다: " + invalidSortField
    );
  }
}
