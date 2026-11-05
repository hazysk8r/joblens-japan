package com.joblens.common.limit;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import jakarta.validation.constraints.Positive;

/**
 * 公開環境で保存量が増え続けないようにするための上限。値はapplication.yamlで設定する。
 */
@Validated
@ConfigurationProperties("joblens.limits")
public record UsageLimits(
        @Positive int maxPostingsPerUser,
        @Positive int maxMemosPerPosting,
        @Positive int maxUsers
) {
}
