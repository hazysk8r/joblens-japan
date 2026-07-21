package com.joblens.jobposting.exception;

/**
 * 요청한 ID에 해당하는 채용공고가 존재하지 않을 때 발생시키는 예외다.
 *
 * IllegalArgumentException 같은 범용 예외 대신 전용 예외를 사용하면,
 * 전역 예외 처리기에서 이 오류를 정확히 404 응답으로 변환할 수 있다.
 */
public class JobPostingNotFoundException extends RuntimeException {

    public JobPostingNotFoundException(Long id) {
        super("채용공고를 찾을 수 없습니다. id=" + id);
    }
}