package com.joblens.jobposting.exception;

public class IfMatchRequiredException extends RuntimeException {

  public IfMatchRequiredException() {
    super("If-Match header is required.");
  }
}
