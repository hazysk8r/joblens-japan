package com.joblens.common.web;

public class MalformedIfMatchHeaderException extends IllegalArgumentException{
  public MalformedIfMatchHeaderException(String malformedIfMatch) {
    super(
      "サポートされていないIf-Match形式です。" + malformedIfMatch
    );
  }
}
