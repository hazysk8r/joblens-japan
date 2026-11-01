package com.joblens.jobposting.exception;

public class InvalidPageException extends IllegalArgumentException {
  public InvalidPageException() {
    super("ページの指定が大きすぎます。");
  }
}
