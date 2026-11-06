package com.joblens.auth.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.joblens.auth.domain.User;

import jakarta.persistence.LockModeType;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);

    // そのユーザーのデータを変更する処理を1つずつ実行するために、トランザクションが終わるまで行を占有する。
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<User> findLockedById(Long id);

    /*
     * そのユーザーのすべてのセッション(他の端末を含む)を削除する。
     * セッションのテーブルはSpring Session JDBCのもので、ユーザーとの外部キーがないため明示的に削除する。
     * ユーザーの削除と同じトランザクションで実行し、片方だけが削除された状態を残さない。
     */
    @Modifying
    @Query(value = "DELETE FROM spring_session WHERE principal_name = :email", nativeQuery = true)
    int deleteSessionsByEmail(@Param("email") String email);
}
