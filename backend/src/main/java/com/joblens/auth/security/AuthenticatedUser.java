package com.joblens.auth.security;

import java.io.Serial;
import java.util.Collection;
import java.util.List;

import org.springframework.security.core.CredentialsContainer;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import com.joblens.auth.domain.User;

import lombok.Getter;

/**
 * ログイン中のユーザーを表すPrincipal。
 * セッション(DB)にシリアライズして保存されるため、エンティティではなく必要な値だけを保持する。
 */
@Getter
public class AuthenticatedUser implements UserDetails, CredentialsContainer {

    @Serial
    private static final long serialVersionUID = 1L;

    private final Long id;
    private final String email;
    private String passwordHash;

    public AuthenticatedUser(Long id, String email, String passwordHash) {
        this.id = id;
        this.email = email;
        this.passwordHash = passwordHash;
    }

    public static AuthenticatedUser from(User user) {
        return new AuthenticatedUser(user.getId(), user.getEmail(), user.getPasswordHash());
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of();
    }

    @Override
    public String getPassword() {
        return passwordHash;
    }

    @Override
    public String getUsername() {
        return email;
    }

    // 認証後にパスワードのハッシュをセッションへ残さないよう、Spring Securityから消去される。
    @Override
    public void eraseCredentials() {
        this.passwordHash = null;
    }
}
