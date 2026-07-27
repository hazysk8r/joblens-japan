package com.joblens;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * 통합 테스트에서 사용할 임시 PostgreSQL을 생성하는 설정이다.
 *
 * 이 설정은 src/test 아래에 있으므로 실제 애플리케이션 실행이나
 * 운영 빌드에는 포함되지 않는다.
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

    /**
     * 테스트 시작 시 PostgreSQL 컨테이너를 만들고,
     * 테스트 종료 시 자동으로 제거한다.
     *
     * @ServiceConnection 덕분에 Spring Boot가 컨테이너의
     * JDBC URL, 사용자 이름, 비밀번호를 자동으로 DataSource와
     * Flyway에 연결한다.
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