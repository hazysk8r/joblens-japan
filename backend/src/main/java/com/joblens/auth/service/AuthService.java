package com.joblens.auth.service;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.joblens.auth.domain.User;
import com.joblens.auth.dto.SignupRequest;
import com.joblens.auth.exception.EmailAlreadyExistsException;
import com.joblens.auth.repository.UserRepository;
import com.joblens.auth.security.AuthenticatedUser;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Transactional
    public AuthenticatedUser signup(SignupRequest request) {
        if (userRepository.existsByEmail(request.email())) {
            throw new EmailAlreadyExistsException();
        }

        try {
            User user = userRepository.saveAndFlush(
                    new User(request.email(), passwordEncoder.encode(request.password())));
            return AuthenticatedUser.from(user);
        } catch (DataIntegrityViolationException exception) {
            // 同じメールアドレスで同時に登録された場合も、一意制約違反を重複エラーとして返す。
            throw new EmailAlreadyExistsException();
        }
    }
}
