package com.joblens.note.exception;

public class MemoLimitReachedException extends RuntimeException {

    public MemoLimitReachedException(int limit) {
        super("メモは1つの求人につき" + limit + "件までです。");
    }
}
