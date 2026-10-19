package com.joblens.jobposting.service;

import com.joblens.jobposting.domain.JobPosting;
import com.joblens.jobposting.repository.JobPostingRepository;
import com.joblens.jobposting.repository.JobPostingStatusHistoryRepository;
import com.joblens.jobposting.validation.JobPostingSortValidator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class JobPostingSkillExtractionTest {

    @Mock
    private JobPostingRepository repository;

    @Mock
    private JobPostingSortValidator sortValidator;

    @Mock
    private JobPostingStatusHistoryRepository historyRepository;

    @Mock
    private JobPosting jobPosting;

    @InjectMocks
    private JobPostingService service;

    @BeforeEach
    void 求人情報を取得できるようにする() {
        when(repository.findById(1L)).thenReturn(Optional.of(jobPosting));
    }

    @ParameterizedTest
    @MethodSource("句読点を含む原文")
    void 句読点が付いた技術名を正確に抽出する(String originalText, List<String> expectedSkills) {
        when(jobPosting.getOriginalText()).thenReturn(originalText);

        assertThat(service.extractSkills(1L)).containsExactlyElementsOf(expectedSkills);
    }

    private static Stream<Arguments> 句読点を含む原文() {
        return Stream.of(
                Arguments.of("Java.", List.of("Java")),
                Arguments.of("AWS.", List.of("AWS")),
                Arguments.of("Java, AWS, Docker.", List.of("Java", "AWS", "Docker")),
                Arguments.of("C++.", List.of("C++")),
                Arguments.of("Java... AWS...", List.of("Java", "AWS")),
                Arguments.of("Java, AWS; Docker!", List.of("Java", "AWS", "Docker")),
                Arguments.of("Java、AWS。Docker！", List.of("Java", "AWS", "Docker")),
                Arguments.of("(Java) [AWS] {Docker}", List.of("Java", "AWS", "Docker")),
                Arguments.of("Java. AWS. Docker.", List.of("Java", "AWS", "Docker")),
                Arguments.of("JavaとSpring Bootを使用する", List.of("Java", "Spring Boot")),
                Arguments.of("C++", List.of("C++")),
                Arguments.of("C / C++", List.of("C", "C++")));
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "JavaScript",
            "C#",
            "Java.util",
            "AWS.Lambda",
            "Java._internal",
            "AWS.$internal",
            "Java..util",
            "foo.Java",
            "Java.util.",
            "AWS.Lambda.",
            "foo.Java.",
            "Node.js .NET JavaScript C#",
            "Java8 AWS2 C2",
            "MyJava CustomAWS"
    })
    void 別の技術名やドットで接続された識別子の一部を抽出しない(String originalText) {
        when(jobPosting.getOriginalText()).thenReturn(originalText);

        assertThat(service.extractSkills(1L)).isEmpty();
    }

    @Test
    void 大文字小文字を無視し重複を除いて既存の技術順に返す() {
        when(jobPosting.getOriginalText()).thenReturn(
                "c++ c typescript react postgresql docker aws spring boot java JAVA AWS c++");

        assertThat(service.extractSkills(1L)).containsExactly(
                "Java", "Spring Boot", "AWS", "Docker", "PostgreSQL", "React", "TypeScript", "C", "C++");
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "\t\r\n", "技術の記載なし"})
    void 原文が未設定か技術名を含まない場合は空配列を返す(String originalText) {
        when(jobPosting.getOriginalText()).thenReturn(originalText);

        assertThat(service.extractSkills(1L)).isEmpty();
    }
}
