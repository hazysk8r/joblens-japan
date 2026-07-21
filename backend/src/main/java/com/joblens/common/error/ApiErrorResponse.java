package com.joblens.common.error;

import java.time.Instant;
import java.util.Map;

/**
 * API에서 오류가 발생했을 때 일정한 형태로 반환하기 위한 응답 DTO다.
 *
 * record를 사용하면 DTO에 필요한 생성자와 getter 성격의 메서드가
 * 자동으로 만들어져 불필요한 반복 코드를 줄일 수 있다.
 */
public record ApiErrorResponse(
        Instant timestamp,
        int status,
        String code,
        String message,
        String path,
        Map<String, String> fieldErrors
) {
}
/**
 * code를 따로 두는 이유는 나중에 프런트엔드가 오류 메시지 문자열이 아니라 코드로 처리할 수 있기 때문. 
 * 즉, message는 사용자에게 보여주고, code는 프런트엔드 프로그램이 판단할 때 사용
*/