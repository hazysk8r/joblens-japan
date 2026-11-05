package com.joblens.common.error;

import com.joblens.auth.exception.EmailAlreadyExistsException;
import com.joblens.auth.exception.SignupClosedException;
import com.joblens.auth.exception.UserNoLongerExistsException;
import com.joblens.common.web.AuthContextChangedException;
import com.joblens.jobposting.exception.IfMatchRequiredException;
import com.joblens.jobposting.exception.InvalidPageException;
import com.joblens.jobposting.exception.InvalidSortFieldException;
import com.joblens.jobposting.exception.JobPostingLimitReachedException;
import com.joblens.jobposting.exception.JobPostingNotFoundException;
import com.joblens.jobposting.exception.JobPostingVersionConflictException;
import com.joblens.jobposting.exception.MalformedIfMatchHeaderException;
import com.joblens.note.exception.JobPostingMemoNotFoundException;
import com.joblens.note.exception.MemoLimitReachedException;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.authentication.AuthenticationServiceException;
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

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    // PostgreSQLのSQLState。22xxxは値自体がDBで扱えない場合(NUL文字、範囲外の日付など)。
    private static final String SQL_STATE_CLASS_DATA_EXCEPTION = "22";
    private static final String SQL_STATE_UNIQUE_VIOLATION = "23505";
    private static final String SQL_STATE_FOREIGN_KEY_VIOLATION = "23503";

    /**
     * JobPostingNotFoundExceptionが発生した場合は、
     * サーバーエラーの500ではなく、リソースがないことを表す404を返す。
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
     * Controllerの@Validによる検証に失敗したときに発生する例外を処理する。
     *
     * たとえばtitleが空の場合は、Serviceまでリクエストが渡らず、
     * このメソッドで400 Bad Requestの応答を作る。
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiErrorResponse> handleValidation(
            MethodArgumentNotValidException exception,
            HttpServletRequest request
    ) {
        Map<String, String> fieldErrors = new LinkedHashMap<>();

        for (FieldError fieldError : exception.getBindingResult().getFieldErrors()) {
            /*
             * 1つの項目に複数のエラーがあっても、最初のメッセージを保持する。
             * putIfAbsentを使うと、後のエラーが先のエラーを上書きしない。
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
                "入力値が正しくありません。",
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
                "リクエスト本文の形式または値が正しくありません。",
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
                "リクエストのパスまたは検索条件の値が正しくありません。",
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

    @ExceptionHandler(InvalidPageException.class)
    public ResponseEntity<ApiErrorResponse> handleInvalidPage(
            InvalidPageException exception,
            HttpServletRequest request
    ) {
        return errorResponse(HttpStatus.BAD_REQUEST, "INVALID_PAGE", exception.getMessage(), request);
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

    @ExceptionHandler(JobPostingLimitReachedException.class)
    public ResponseEntity<ApiErrorResponse> handleJobPostingLimitReached(
            JobPostingLimitReachedException exception,
            HttpServletRequest request
    ) {
        return errorResponse(HttpStatus.CONFLICT, "JOB_POSTING_LIMIT_REACHED", exception.getMessage(), request);
    }

    @ExceptionHandler(MemoLimitReachedException.class)
    public ResponseEntity<ApiErrorResponse> handleMemoLimitReached(
            MemoLimitReachedException exception,
            HttpServletRequest request
    ) {
        return errorResponse(HttpStatus.CONFLICT, "MEMO_LIMIT_REACHED", exception.getMessage(), request);
    }

    @ExceptionHandler(SignupClosedException.class)
    public ResponseEntity<ApiErrorResponse> handleSignupClosed(
            SignupClosedException exception,
            HttpServletRequest request
    ) {
        return errorResponse(HttpStatus.CONFLICT, "SIGNUP_CLOSED", exception.getMessage(), request);
    }

    /*
     * セッションを残すと/meが200を返し続け、画面はログイン状態のまま401を繰り返す。
     * 画面が401の後に/meで確認するため、ここでセッションを終了する。
     */
    @ExceptionHandler(UserNoLongerExistsException.class)
    public ResponseEntity<ApiErrorResponse> handleUserNoLongerExists(
            UserNoLongerExistsException exception,
            HttpServletRequest request
    ) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        return errorResponse(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", exception.getMessage(), request);
    }

    // 画面のユーザーとセッションのユーザーが異なるため、変更を行わなかったことを返す。
    @ExceptionHandler(AuthContextChangedException.class)
    public ResponseEntity<ApiErrorResponse> handleAuthContextChanged(
            AuthContextChangedException exception,
            HttpServletRequest request
    ) {
        ApiErrorResponse response = new ApiErrorResponse(
                Instant.now(),
                HttpStatus.CONFLICT.value(),
                "AUTH_CONTEXT_CHANGED",
                exception.getMessage(),
                request.getRequestURI(),
                Map.of()
        );

        return ResponseEntity
                .status(HttpStatus.CONFLICT)
                .body(response);
    }

    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<ApiErrorResponse> handleDataAccessFailure(
            DataAccessException exception,
            HttpServletRequest request
    ) {
        return storageFailureResponse(exception, request);
    }

    /*
     * ユーザーの検索に失敗した場合。AuthenticationExceptionの一種だが、認証の失敗ではない。
     * 401にすると、DBの障害が「パスワードが違う」と表示され、ログにも残らない。
     */
    @ExceptionHandler(AuthenticationServiceException.class)
    public ResponseEntity<ApiErrorResponse> handleAuthenticationServiceFailure(
            AuthenticationServiceException exception,
            HttpServletRequest request
    ) {
        return storageFailureResponse(exception, request);
    }

    private ResponseEntity<ApiErrorResponse> storageFailureResponse(
            Exception exception,
            HttpServletRequest request
    ) {
        String sqlState = DatabaseErrors.sqlStateOf(exception);

        // 400・409は不正な入力の繰り返しで増えるため、例外の詳細は残さない。
        // 22001(値が長すぎる)のように、DTOの上限とDBの列のずれが原因の場合に、どのAPIかを追えるようにする。
        if (sqlState != null && sqlState.startsWith(SQL_STATE_CLASS_DATA_EXCEPTION)) {
            log.warn("データベースが値を受け付けませんでした: {} {} sqlState={}",
                    request.getMethod(), request.getRequestURI(), sqlState);
            return errorResponse(HttpStatus.BAD_REQUEST, "INVALID_REQUEST_VALUE",
                    "入力された値を処理できませんでした。", request);
        }

        if (SQL_STATE_UNIQUE_VIOLATION.equals(sqlState) || SQL_STATE_FOREIGN_KEY_VIOLATION.equals(sqlState)) {
            log.warn("データが競合しました: {} {} sqlState={}",
                    request.getMethod(), request.getRequestURI(), sqlState);
            return errorResponse(HttpStatus.CONFLICT, "DATA_CONFLICT",
                    "他のデータと競合したため処理できませんでした。画面を更新してから再度お試しください。", request);
        }

        // 入力の検証を通過した値のCHECK違反やDBの障害は、サーバーの問題として扱う。
        log.error("データの処理に失敗しました: {} {}", request.getMethod(), request.getRequestURI(), exception);
        return errorResponse(HttpStatus.INTERNAL_SERVER_ERROR, HttpStatus.INTERNAL_SERVER_ERROR.name(),
                ApiErrorAttributes.SERVER_ERROR_MESSAGE, request);
    }

    private ResponseEntity<ApiErrorResponse> errorResponse(
            HttpStatus status,
            String code,
            String message,
            HttpServletRequest request
    ) {
        return ResponseEntity
                .status(status)
                .body(new ApiErrorResponse(
                        Instant.now(), status.value(), code, message, request.getRequestURI(), Map.of()));
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
                "メールアドレスまたはパスワードが正しくありません。",
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
→ RepositoryでIDを検索
→ データなし
→ JobPostingNotFoundExceptionが発生
→ GlobalExceptionHandlerが捕捉
→ HTTP 404のJSON応答を返す
 */
