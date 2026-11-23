package com.joblens.common.web;

public class IfMatchRequiredException extends RuntimeException {

  public IfMatchRequiredException() {
    super("If-Match header is required.");
  }
}
