package com.joblens.auth.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.joblens.auth.domain.User;
import com.joblens.auth.dto.SignupRequest;
import com.joblens.auth.exception.EmailAlreadyExistsException;
import com.joblens.auth.exception.SignupClosedException;
import com.joblens.auth.repository.UserRepository;
import com.joblens.auth.security.AuthenticatedUser;
import com.joblens.common.error.DatabaseErrors;
import com.joblens.common.limit.UsageLimits;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    private static final String EMAIL_UNIQUE_CONSTRAINT = "uq_users_email";

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final UsageLimits usageLimits;

    @Transactional
    public AuthenticatedUser signup(SignupRequest request) {
        if (userRepository.existsByEmail(request.email())) {
            throw new EmailAlreadyExistsException();
        }

        // 全体の保存量を抑えるための上限のため、同時登録で数件超えることは許容し、ロックは取らない。
        if (userRepository.count() >= usageLimits.maxUsers()) {
            // 悪用で埋められると新しい利用者が登録できなくなるため、運営者が気付けるように残す。
            log.warn("会員登録の上限に達しました: 上限={}人", usageLimits.maxUsers());
            throw new SignupClosedException();
        }

        // ハッシュの計算は時間がかかるため、拒否しない要求についてだけ行う。
        String passwordHash = passwordEncoder.encode(request.password());

        try {
            User user = userRepository.saveAndFlush(new User(request.email(), passwordHash));
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
