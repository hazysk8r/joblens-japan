package com.joblens.common.web;

import java.util.Set;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import com.joblens.auth.security.AuthenticatedUser;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 変更リクエストを送った画面のユーザーと、セッションのユーザーが同じかを確認する。
 *
 * 別のタブでアカウントが切り替わると、ブラウザのセッションCookieは新しいユーザーのものになる。
 * 前のユーザーの画面から送られた変更が、新しいユーザーのデータとして処理されないようにする。
 *
 * これは認証ではない。認証と所有者の判定は常にセッションのユーザーで行い、
 * ヘッダーはフロントエンドの画面とセッションの食い違いを検出するためだけに使う。
 * ヘッダーがない場合は確認しない(省略しても、自分のセッションで自分のデータを変更できるだけのため)。
 */
@Component
public class ExpectedUserInterceptor implements HandlerInterceptor {

    static final String EXPECTED_USER_HEADER = "X-Expected-User-Id";

    // データを変更しないメソッドは確認しない。
    private static final Set<String> SAFE_METHODS = Set.of("GET", "HEAD", "OPTIONS", "TRACE");

    @Override
    public boolean preHandle(
            HttpServletRequest request,
            HttpServletResponse response,
            Object handler
    ) {
        String expectedUserId = request.getHeader(EXPECTED_USER_HEADER);

        if (expectedUserId == null || SAFE_METHODS.contains(request.getMethod())) {
            return true;
        }

        // 数値に変換せず文字列で比較し、形式が不正な値も「一致しない」として扱う。
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null
                && authentication.getPrincipal() instanceof AuthenticatedUser user
                && expectedUserId.equals(String.valueOf(user.getId()))) {
            return true;
        }

        throw new AuthContextChangedException();
    }
}
