package com.joblens.jobposting.controller;

import com.joblens.AuthenticatedMockMvcConfiguration;
import com.joblens.TestUsers;
import com.joblens.TestcontainersConfiguration;
import com.joblens.jobposting.domain.ApplicationStatus;
import com.joblens.jobposting.domain.JobPosting;
import com.joblens.jobposting.repository.JobPostingRepository;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.resource.jdbc.spi.StatementInspector;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.hibernate.autoconfigure.HibernatePropertiesCustomizer;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.aMapWithSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = "spring.jpa.properties.hibernate.generate_statistics=true")
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, AuthenticatedMockMvcConfiguration.class, JobPostingStatusSummaryTest.SqlCaptureConfiguration.class})
@Execution(ExecutionMode.SAME_THREAD)
class JobPostingStatusSummaryTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JobPostingRepository jobPostingRepository;

    @Autowired
    private TestUsers testUsers;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @Autowired
    private SqlCapture sqlCapture;

    @BeforeEach
    void clearPostings() {
        jobPostingRepository.deleteAll();
    }

    @Test
    void 全状態の件数を一回の集計SQLで取得する() throws Exception {
        List<JobPosting> postings = new ArrayList<>();
        addPostings(postings, ApplicationStatus.SAVED, 2);
        addPostings(postings, ApplicationStatus.APPLIED, 3);
        addPostings(postings, ApplicationStatus.INTERVIEWING, 1);
        addPostings(postings, ApplicationStatus.OFFERED, 4);
        addPostings(postings, ApplicationStatus.REJECTED, 5);
        jobPostingRepository.saveAllAndFlush(postings);

        assertSummaryWithOneQuery(2, 3, 1, 4, 5);
    }

    @Test
    void 集計結果に存在しない状態をゼロで返す() throws Exception {
        List<JobPosting> postings = new ArrayList<>();
        addPostings(postings, ApplicationStatus.APPLIED, 2);
        addPostings(postings, ApplicationStatus.REJECTED, 1);
        jobPostingRepository.saveAllAndFlush(postings);

        assertSummaryWithOneQuery(0, 2, 0, 0, 1);
    }

    @Test
    void 求人がゼロ件でも一回の集計SQLで全状態をゼロにする() throws Exception {
        assertSummaryWithOneQuery(0, 0, 0, 0, 0);
    }

    private void assertSummaryWithOneQuery(
            long saved, long applied, long interviewing, long offered, long rejected) throws Exception {
        Statistics statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();

        // テストデータの保存や削除は、APIのSQL計測に含めない。
        statistics.clear();
        sqlCapture.clear();

        mockMvc.perform(get("/api/job-postings/status-summary"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", aMapWithSize(5)))
                .andExpect(jsonPath("$.saved").value(saved))
                .andExpect(jsonPath("$.applied").value(applied))
                .andExpect(jsonPath("$.interviewing").value(interviewing))
                .andExpect(jsonPath("$.offered").value(offered))
                .andExpect(jsonPath("$.rejected").value(rejected));

        List<String> statements = sqlCapture.statements();
        assertThat(statistics.getPrepareStatementCount())
                .as("status-summary SQL: %s", statements)
                .isEqualTo(1);
        assertThat(statistics.getQueryExecutionCount()).isEqualTo(1);
        assertThat(statements).singleElement().satisfies(sql ->
                assertThat(sql.toLowerCase(Locale.ROOT).replaceAll("\\s+", " "))
                        .contains("select", "count(", "job_postings", "application_status", "group by"));
    }

    private void addPostings(List<JobPosting> postings, ApplicationStatus status, int count) {
        for (int index = 0; index < count; index++) {
            JobPosting posting = new JobPosting(
                    testUsers.defaultUserId(),
                    "テスト会社", status + "-" + index, null, "求人原文", null, null, null);
            posting.changeApplicationStatus(status);
            postings.add(posting);
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class SqlCaptureConfiguration {
        @Bean
        SqlCapture summarySqlCapture() {
            return new SqlCapture();
        }

        @Bean
        HibernatePropertiesCustomizer summarySqlCaptureCustomizer(SqlCapture capture) {
            return properties -> properties.put("hibernate.session_factory.statement_inspector", capture);
        }
    }

    static class SqlCapture implements StatementInspector {
        private final List<String> statements = new CopyOnWriteArrayList<>();

        @Override
        public String inspect(String sql) {
            statements.add(sql);
            return sql;
        }

        void clear() {
            statements.clear();
        }

        List<String> statements() {
            return List.copyOf(statements);
        }
    }
}
