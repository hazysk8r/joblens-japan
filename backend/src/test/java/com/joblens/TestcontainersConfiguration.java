package com.joblens;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * 統合テストで使う一時的なPostgreSQLを作成する設定
 *
 * この設定はsrc/testの下にあるため、実際のアプリケーションの実行や
 * 本番ビルドには含まれない
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

    /**
     * テスト開始時にPostgreSQLコンテナを作り、
     * テスト終了時に自動で削除する
     *
     * @ServiceConnectionのおかげでSpring Bootがコンテナの
     * JDBC URL、ユーザー名、パスワードを自動でDataSourceと
     * Flywayに接続する
     */
    @Bean
    @ServiceConnection
    @SuppressWarnings("resource")
    PostgreSQLContainer postgresContainer() {
        return new PostgreSQLContainer("postgres:16-alpine")
                .withDatabaseName("joblens-test")
                .withUsername("test")
                .withPassword("test");
    }
}