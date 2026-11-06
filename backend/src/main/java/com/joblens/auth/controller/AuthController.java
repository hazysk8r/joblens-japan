package com.joblens.auth.controller;

import java.net.URI;

import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.joblens.auth.dto.DeleteAccountRequest;
import com.joblens.auth.dto.LoginRequest;
import com.joblens.auth.dto.SignupRequest;
import com.joblens.auth.dto.UserResponse;
import com.joblens.auth.security.AuthenticatedUser;
import com.joblens.auth.security.LoginSessionManager;
import com.joblens.auth.service.AuthService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * 会員登録・ログイン・ログイン中ユーザーの取得を担当する。
 * ログアウトはSecurityConfigのlogout設定(POST /api/auth/logout)で処理する。
 */
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final AuthenticationManager authenticationManager;
    private final LoginSessionManager loginSessionManager;
    private final CsrfTokenRepository csrfTokenRepository;

    // 登録後はそのままログイン状態にする。
    @PostMapping("/signup")
    public ResponseEntity<UserResponse> signup(
            @Valid @RequestBody SignupRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse
    ) {
        AuthenticatedUser user = authService.signup(request);
        user.eraseCredentials();

        loginSessionManager.establish(
                UsernamePasswordAuthenticationToken.authenticated(user, null, user.getAuthorities()),
                httpRequest,
                httpResponse);

        return ResponseEntity
                .created(URI.create("/api/auth/me"))
                .body(UserResponse.from(user));
    }

    @PostMapping("/login")
    public UserResponse login(
            @Valid @RequestBody LoginRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse
    ) {
        // 認証失敗時のAuthenticationExceptionはGlobalExceptionHandlerで401に変換する。
        Authentication authentication = authenticationManager.authenticate(
                UsernamePasswordAuthenticationToken.unauthenticated(request.email(), request.password()));

        loginSessionManager.establish(authentication, httpRequest, httpResponse);

        return UserResponse.from((AuthenticatedUser) authentication.getPrincipal());
    }

    /*
     * アカウントを削除し、ログアウトと同じように、このリクエストのセッション・認証情報・CSRFトークンを消す。
     * DBのセッションは削除済みのため、ここではブラウザのCookieと、このリクエストの状態を片付ける。
     */
    @PostMapping("/account/delete")
    public ResponseEntity<Void> deleteAccount(
            @AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody DeleteAccountRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse
    ) {
        authService.deleteAccount(user.getId(), request.password());

        HttpSession session = httpRequest.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        SecurityContextHolder.clearContext();
        csrfTokenRepository.saveToken(null, httpRequest, httpResponse);

        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me")
    public UserResponse me(@AuthenticationPrincipal AuthenticatedUser user) {
        return UserResponse.from(user);
    }
}
