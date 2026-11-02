package com.joblens.jobposting.exception;

public class MalformedIfMatchHeaderException extends IllegalArgumentException{
  public MalformedIfMatchHeaderException(String malformedIfMatch) {
    super(
      "サポートされていないIf-Match形式です。" + malformedIfMatch
    );
  }
}
