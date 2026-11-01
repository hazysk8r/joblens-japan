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
import com.joblens.common.error.DatabaseErrors;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class AuthService {

    private static final String EMAIL_UNIQUE_CONSTRAINT = "uq_users_email";

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
            // 他の制約の違反を重複と表示すると、本当の原因が隠れるため区別する。
            if (DatabaseErrors.violatesConstraint(exception, EMAIL_UNIQUE_CONSTRAINT)) {
                throw new EmailAlreadyExistsException();
            }
            throw exception;
        }
    }
}
