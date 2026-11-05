package com.joblens.auth.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import com.joblens.auth.domain.User;

import jakarta.persistence.LockModeType;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);

    // そのユーザーのデータを変更する処理を1つずつ実行するために、行を更新するまで占有する。
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<User> findLockedById(Long id);
}
