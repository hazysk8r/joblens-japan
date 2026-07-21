package com.joblens.common.error;

import com.joblens.jobposting.exception.JobPostingNotFoundException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    /**
     * JobPostingNotFoundException이 발생하면
     * 서버 오류인 500 대신 리소스가 없다는 의미의 404를 반환한다.
     */
    @ExceptionHandler(JobPostingNotFoundException.class)
    public ResponseEntity<ApiErrorResponse> handleJobPostingNotFound(
            JobPostingNotFoundException exception,
            HttpServletRequest request
    ) {
        ApiErrorResponse response = new ApiErrorResponse(
                Instant.now(),
                HttpStatus.NOT_FOUND.value(),
                "JOB_POSTING_NOT_FOUND",
                exception.getMessage(),
                request.getRequestURI(),
                Map.of()
        );

        return ResponseEntity
                .status(HttpStatus.NOT_FOUND)
                .body(response);
    }

    /**
     * Controller의 @Valid 검증에 실패했을 때 발생하는 예외를 처리.
     *
     * 예를 들어 title이 비어 있으면 Service까지 요청이 전달되지 않고
     * 이 메서드에서 400 Bad Request 응답을 만든다.
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiErrorResponse> handleValidation(
            MethodArgumentNotValidException exception,
            HttpServletRequest request
    ) {
        Map<String, String> fieldErrors = new LinkedHashMap<>();

        for (FieldError fieldError : exception.getBindingResult().getFieldErrors()) {
            /*
             * 하나의 필드에 여러 오류가 있더라도 첫 번째 메시지를 유지한다.
             * putIfAbsent를 사용하면 뒤의 오류가 앞의 오류를 덮어쓰지 않는다.
             */
            fieldErrors.putIfAbsent(
                    fieldError.getField(),
                    fieldError.getDefaultMessage()
            );
        }

        ApiErrorResponse response = new ApiErrorResponse(
                Instant.now(),
                HttpStatus.BAD_REQUEST.value(),
                "VALIDATION_FAILED",
                "입력값이 올바르지 않습니다.",
                request.getRequestURI(),
                fieldErrors
        );

        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(response);
    }
}

/**
 * Controller
→ Service
→ Repository에서 ID 조회
→ 데이터 없음
→ JobPostingNotFoundException 발생
→ GlobalExceptionHandler가 잡음
→ HTTP 404 JSON 응답 반환
 */