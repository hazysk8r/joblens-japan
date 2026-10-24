package com.joblens.common.error;

import com.joblens.auth.exception.EmailAlreadyExistsException;
import com.joblens.jobposting.exception.IfMatchRequiredException;
import com.joblens.jobposting.exception.InvalidSortFieldException;
import com.joblens.jobposting.exception.JobPostingNotFoundException;
import com.joblens.jobposting.exception.JobPostingVersionConflictException;
import com.joblens.jobposting.exception.MalformedIfMatchHeaderException;
import com.joblens.note.exception.JobPostingMemoNotFoundException;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

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

    // 本文の解析・型変換の詳細を公開せず、既存の共通形式で返す。
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiErrorResponse> handleHttpMessageNotReadable(
            HttpServletRequest request
    ) {
        ApiErrorResponse response = new ApiErrorResponse(
                Instant.now(),
                HttpStatus.BAD_REQUEST.value(),
                "INVALID_REQUEST_BODY",
                "요청 본문의 형식이나 값이 올바르지 않습니다.",
                request.getRequestURI(),
                Map.of()
        );

        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(response);
    }

    // 変換規則は変更せず、経路・クエリの型変換失敗を共通形式で返す。
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiErrorResponse> handleMethodArgumentTypeMismatch(
            HttpServletRequest request
    ) {
        ApiErrorResponse response = new ApiErrorResponse(
                Instant.now(),
                HttpStatus.BAD_REQUEST.value(),
                "INVALID_PARAMETER_TYPE",
                "요청 경로나 검색 조건의 값이 올바르지 않습니다.",
                request.getRequestURI(),
                Map.of()
        );

        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(response);
    }

    @ExceptionHandler(InvalidSortFieldException.class)
    public ResponseEntity<ApiErrorResponse> handleInvalidSortField(
            InvalidSortFieldException exception,
            HttpServletRequest request
    ) {
        ApiErrorResponse response = new ApiErrorResponse(
                Instant.now(),
                HttpStatus.BAD_REQUEST.value(),
                "INVALID_SORT_FIELD",
                exception.getMessage(),
                request.getRequestURI(),
                Map.of()
        );

        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(response);
    }

    @ExceptionHandler(JobPostingMemoNotFoundException.class)
    public ResponseEntity<ApiErrorResponse> handleJobPostingMemoNotFound(
                    JobPostingMemoNotFoundException exception,
                    HttpServletRequest request) {
            ApiErrorResponse response = new ApiErrorResponse(
                            Instant.now(),
                            HttpStatus.NOT_FOUND.value(),
                            "JOB_POSTING_MEMO_NOT_FOUND",
                            exception.getMessage(),
                            request.getRequestURI(),
                            Map.of());

            return ResponseEntity
                            .status(HttpStatus.NOT_FOUND)
                            .body(response);
    }

    @ExceptionHandler(JobPostingVersionConflictException.class)
    public ResponseEntity<ApiErrorResponse> handleJobPostingVersionConflict(
                    JobPostingVersionConflictException exception,
                    HttpServletRequest request) {
            ApiErrorResponse response = new ApiErrorResponse(
                            Instant.now(),
                            HttpStatus.PRECONDITION_FAILED.value(),
                            "JOB_POSTING_VERSION_CONFLICT",
                            exception.getMessage(),
                            request.getRequestURI(),
                            Map.of());

            return ResponseEntity
                            .status(HttpStatus.PRECONDITION_FAILED)
                            .body(response);
    }

    @ExceptionHandler(IfMatchRequiredException.class)
    public ResponseEntity<ApiErrorResponse> handleIfMatchRequired(
                    IfMatchRequiredException exception,
                    HttpServletRequest request) {
            ApiErrorResponse response = new ApiErrorResponse(
                            Instant.now(),
                            HttpStatus.PRECONDITION_REQUIRED.value(),
                            "IF_MATCH_REQUIRED",
                            exception.getMessage(),
                            request.getRequestURI(),
                            Map.of());
            return ResponseEntity
                            .status(HttpStatus.PRECONDITION_REQUIRED)
                            .body(response);
                    }

    @ExceptionHandler(MalformedIfMatchHeaderException.class)
    public ResponseEntity<ApiErrorResponse> handleMalformedIfMatchHeader(
                    MalformedIfMatchHeaderException exception,
                    HttpServletRequest request) {
            ApiErrorResponse response = new ApiErrorResponse(
                            Instant.now(),
                            HttpStatus.BAD_REQUEST.value(),
                            "MALFORMED_IF_MATCH_HEADER",
                            exception.getMessage(),
                            request.getRequestURI(),
                            Map.of());
            return ResponseEntity
                            .status(HttpStatus.BAD_REQUEST)
                            .body(response);
                    }

    @ExceptionHandler(EmailAlreadyExistsException.class)
    public ResponseEntity<ApiErrorResponse> handleEmailAlreadyExists(
            EmailAlreadyExistsException exception,
            HttpServletRequest request
    ) {
        ApiErrorResponse response = new ApiErrorResponse(
                Instant.now(),
                HttpStatus.CONFLICT.value(),
                "EMAIL_ALREADY_EXISTS",
                exception.getMessage(),
                request.getRequestURI(),
                Map.of()
        );

        return ResponseEntity
                .status(HttpStatus.CONFLICT)
                .body(response);
    }

    // メールアドレスの未登録とパスワード不一致を区別せず、同じ応答を返す。
    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<ApiErrorResponse> handleAuthenticationFailure(
            HttpServletRequest request
    ) {
        ApiErrorResponse response = new ApiErrorResponse(
                Instant.now(),
                HttpStatus.UNAUTHORIZED.value(),
                "INVALID_CREDENTIALS",
                "이메일 또는 비밀번호가 올바르지 않습니다.",
                request.getRequestURI(),
                Map.of()
        );

        return ResponseEntity
                .status(HttpStatus.UNAUTHORIZED)
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
