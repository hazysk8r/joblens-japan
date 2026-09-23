package com.joblens.jobposting.exception;

public class MalformedIfMatchHeaderException extends IllegalArgumentException{
  public MalformedIfMatchHeaderException(String malformedIfMatch) {
    super(
      "지원하지 않는 If-Match 형식입니다. " + malformedIfMatch
    );
  }
}
