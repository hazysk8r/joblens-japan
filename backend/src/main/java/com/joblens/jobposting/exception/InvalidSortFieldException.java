package com.joblens.jobposting.exception;

public class InvalidSortFieldException extends IllegalArgumentException{
  public InvalidSortFieldException(String invalidSortField) {
    super(
      "許可されていない並び替え項目です: " + invalidSortField
    );
  }
}
