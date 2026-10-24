package com.joblens.auth.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextHolderStrategy;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.stereotype.Component;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;

/**
 * 認証済みのユーザーをセッションに保存し、ログイン状態を開始する。
 *
 * JSONで受け取る独自のログインAPIでは、フォームログインが自動で行う
 * セッションIDの変更とCSRFトークンの再発行を自分で行う必要がある。
 */
@Component
@RequiredArgsConstructor
public class LoginSessionManager {

    private final SecurityContextRepository securityContextRepository;
    private final CsrfTokenRepository csrfTokenRepository;
    private final SecurityContextHolderStrategy securityContextHolderStrategy =
            SecurityContextHolder.getContextHolderStrategy();

    public void establish(
            Authentication authentication,
            HttpServletRequest request,
            HttpServletResponse response
    ) {
        // セッション固定攻撃対策として、ログイン前のセッションIDを使い続けない。
        if (request.getSession(false) != null) {
            request.changeSessionId();
        }

        SecurityContext context = securityContextHolderStrategy.createEmptyContext();
        context.setAuthentication(authentication);
        securityContextHolderStrategy.setContext(context);
        securityContextRepository.saveContext(context, request, response);

        // ログイン前に発行されたCSRFトークンを、ログイン後に使い続けないよう再発行する。
        CsrfToken csrfToken = csrfTokenRepository.generateToken(request);
        csrfTokenRepository.saveToken(csrfToken, request, response);
    }
}
