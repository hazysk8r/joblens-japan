package com.joblens.auth.security;

import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.joblens.auth.EmailNormalizer;
import com.joblens.auth.repository.UserRepository;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AuthUserDetailsService implements UserDetailsService {

    private final UserRepository userRepository;

    /*
     * ユーザーが存在しない場合の例外は、Spring Securityがパスワード不一致と同じ
     * BadCredentialsExceptionに変換するため、登録済みかどうかは外部に漏れない。
     */
    @Override
    public UserDetails loadUserByUsername(String email) {
        return userRepository.findByEmail(EmailNormalizer.normalize(email))
                .map(AuthenticatedUser::from)
                .orElseThrow(() -> new UsernameNotFoundException("User not found"));
    }
}
