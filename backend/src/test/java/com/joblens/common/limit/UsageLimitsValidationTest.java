package com.joblens.common.limit;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.validation.autoconfigure.ValidationAutoConfiguration;

/**
 * 上限の設定を誤ると、すべての登録が止まったり上限が効かなくなったりするため、起動時に拒否することを検証する。
 */
class UsageLimitsValidationTest {

    private static final String POSTINGS = "joblens.limits.max-postings-per-user";
    private static final String MEMOS = "joblens.limits.max-memos-per-posting";
    private static final String USERS = "joblens.limits.max-users";

    @EnableConfigurationProperties(UsageLimits.class)
    static class LimitsConfiguration {
    }

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(LimitsConfiguration.class)
            .withConfiguration(AutoConfigurations.of(ValidationAutoConfiguration.class));

    private static String[] limits(String postings, String memos, String users) {
        return new String[] {POSTINGS + "=" + postings, MEMOS + "=" + memos, USERS + "=" + users};
    }

    @Test
    void 正の値なら起動して設定を読み込む() {
        runner.withPropertyValues(limits("1", "2", "3")).run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(UsageLimits.class)).isEqualTo(new UsageLimits(1, 2, 3));
        });
    }

    @ParameterizedTest
    @CsvSource({
            "0,1,1", "1,0,1", "1,1,0",
            "-1,1,1", "1,-1,1", "1,1,-1",
            "abc,1,1", "1,abc,1", "1,1,abc",
    })
    void 正の数でなければ起動しない(String postings, String memos, String users) {
        runner.withPropertyValues(limits(postings, memos, users))
                .run(context -> assertThat(context).hasFailed());
    }

    @Test
    void 設定がなければ起動しない() {
        runner.run(context -> assertThat(context).hasFailed());
    }
}
