package com.joblens.jobposting.validation;

import com.joblens.jobposting.dto.CreateJobPostingRequest;
import com.joblens.jobposting.dto.JobPostingDeadlineFilterRequest;
import com.joblens.jobposting.dto.JobPostingSalaryFilterRequest;
import com.joblens.jobposting.dto.UpdateJobPostingRequest;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;

import java.time.LocalDate;
import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

class RangeValidationTest {

    private static final String SALARY_RANGE_MESSAGE =
            "최소 급여는 최대 급여보다 클 수 없습니다.";
    private static final String DEADLINE_RANGE_MESSAGE =
            "시작일은 마감일보다 뒤의 날짜를 선택할 수 없습니다.";

    private static ValidatorFactory validatorFactory;
    private static Validator validator;

    @BeforeAll
    static void setUpValidator() {
        validatorFactory = Validation.buildDefaultValidatorFactory();
        validator = validatorFactory.getValidator();
    }

    @AfterAll
    static void closeValidatorFactory() {
        if (validatorFactory != null) {
            validatorFactory.close();
        }
    }

    @ParameterizedTest(name = "{0}: reversed salary range")
    @EnumSource(SalaryDto.class)
    void reversedSalaryRangeProducesOnlyOneSalaryMaxViolation(SalaryDto dto) {
        var violations = validator.validate(salaryRequest(dto, 500000, 300000));

        assertThat(violations).singleElement().satisfies(violation -> {
            assertThat(violation.getPropertyPath().toString()).isEqualTo("salaryMax");
            assertThat(violation.getMessage()).isEqualTo(SALARY_RANGE_MESSAGE);
            assertThat(violation.getConstraintDescriptor().getAnnotation().annotationType())
                    .isEqualTo(ValidSalaryRange.class);
        });
    }

    @Test
    void reversedDeadlineRangeProducesOnlyOneDeadlineToViolation() {
        var request = new JobPostingDeadlineFilterRequest(
                LocalDate.of(2026, 11, 1), LocalDate.of(2026, 10, 1));

        var violations = validator.validate(request);

        assertThat(violations).singleElement().satisfies(violation -> {
            assertThat(violation.getPropertyPath().toString()).isEqualTo("deadlineTo");
            assertThat(violation.getMessage()).isEqualTo(DEADLINE_RANGE_MESSAGE);
            assertThat(violation.getConstraintDescriptor().getAnnotation().annotationType())
                    .isEqualTo(ValidDeadlineRange.class);
        });
    }

    @ParameterizedTest(name = "{0}: salaryMin={1}, salaryMax={2}")
    @MethodSource("negativeSalaryCases")
    void negativeSalaryProducesOnlyFieldConstraintViolations(
            SalaryDto dto,
            Integer salaryMin,
            Integer salaryMax,
            List<String> expectedFields) {
        var violations = validator.validate(salaryRequest(dto, salaryMin, salaryMax));

        assertThat(violations)
                .extracting(violation -> violation.getPropertyPath().toString())
                .containsExactlyInAnyOrderElementsOf(expectedFields);
        assertThat(violations).allSatisfy(violation ->
                assertThat(violation.getConstraintDescriptor().getAnnotation().annotationType())
                        .isEqualTo(PositiveOrZero.class));
    }

    static Stream<Arguments> negativeSalaryCases() {
        return Stream.of(SalaryDto.values()).flatMap(dto -> Stream.of(
                Arguments.of(dto, -1, 300000, List.of("salaryMin")),
                Arguments.of(dto, 300000, -1, List.of("salaryMax")),
                Arguments.of(dto, -1, -2, List.of("salaryMin", "salaryMax"))));
    }

    @ParameterizedTest(name = "{0}: blank title and reversed salary range")
    @EnumSource(value = SalaryDto.class, names = {"CREATE", "UPDATE"})
    void blankTitleAndReversedSalaryRangeKeepBothViolations(SalaryDto dto) {
        var violations = validator.validate(salaryRequest(dto, "", 500000, 300000));

        assertThat(violations)
                .extracting(
                        violation -> violation.getPropertyPath().toString(),
                        violation -> violation.getConstraintDescriptor().getAnnotation().annotationType())
                .containsExactlyInAnyOrder(
                        tuple("title", NotBlank.class),
                        tuple("salaryMax", ValidSalaryRange.class));
        assertThat(violations)
                .filteredOn(violation -> violation.getPropertyPath().toString().equals("salaryMax"))
                .singleElement()
                .satisfies(violation ->
                        assertThat(violation.getMessage()).isEqualTo(SALARY_RANGE_MESSAGE));
    }

    @ParameterizedTest(name = "{0}: salaryMin={1}, salaryMax={2}")
    @MethodSource("validSalaryCases")
    void acceptsValidSalaryRanges(SalaryDto dto, Integer salaryMin, Integer salaryMax) {
        assertThat(validator.validate(salaryRequest(dto, salaryMin, salaryMax))).isEmpty();
    }

    static Stream<Arguments> validSalaryCases() {
        return Stream.of(SalaryDto.values()).flatMap(dto -> Stream.of(
                Arguments.of(dto, null, null),
                Arguments.of(dto, 300000, null),
                Arguments.of(dto, null, 500000),
                Arguments.of(dto, 300000, 500000),
                Arguments.of(dto, 300000, 300000),
                Arguments.of(dto, 0, 0),
                Arguments.of(dto, 0, 500000)));
    }

    @ParameterizedTest(name = "deadlineFrom={0}, deadlineTo={1}")
    @MethodSource("validDeadlineCases")
    void acceptsValidDeadlineRanges(LocalDate deadlineFrom, LocalDate deadlineTo) {
        assertThat(validator.validate(
                new JobPostingDeadlineFilterRequest(deadlineFrom, deadlineTo))).isEmpty();
    }

    static Stream<Arguments> validDeadlineCases() {
        LocalDate start = LocalDate.of(2026, 10, 1);
        LocalDate end = LocalDate.of(2026, 10, 31);

        return Stream.of(
                Arguments.of(null, null),
                Arguments.of(start, null),
                Arguments.of(null, end),
                Arguments.of(start, end),
                Arguments.of(start, start));
    }

    private static SalaryRangeTarget salaryRequest(SalaryDto dto, Integer salaryMin, Integer salaryMax) {
        return salaryRequest(dto, "テスト求人", salaryMin, salaryMax);
    }

    private static SalaryRangeTarget salaryRequest(
            SalaryDto dto, String title, Integer salaryMin, Integer salaryMax) {
        return switch (dto) {
            case CREATE -> new CreateJobPostingRequest(
                    "テスト会社", title, null, "Javaの開発経験", salaryMin, salaryMax, null);
            case UPDATE -> new UpdateJobPostingRequest(
                    "テスト会社", title, null, "Javaの開発経験", salaryMin, salaryMax, null);
            case SEARCH -> new JobPostingSalaryFilterRequest(salaryMin, salaryMax);
        };
    }

    private enum SalaryDto {
        CREATE,
        UPDATE,
        SEARCH
    }
}
