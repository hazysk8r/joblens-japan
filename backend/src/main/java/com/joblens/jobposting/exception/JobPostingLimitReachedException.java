package com.joblens.jobposting.exception;

public class JobPostingLimitReachedException extends RuntimeException {

    public JobPostingLimitReachedException(int limit) {
        super("登録できる求人は" + limit + "件までです。");
    }
}
