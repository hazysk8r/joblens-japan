package com.joblens.jobposting.service;

import com.joblens.jobposting.domain.ApplicationStatus;
import com.joblens.jobposting.dto.ApplicationStatusSummaryResponse;
import com.joblens.jobposting.repository.JobPostingRepository;
import com.joblens.jobposting.repository.JobPostingRepository.ApplicationStatusCount;
import com.joblens.jobposting.repository.JobPostingStatusHistoryRepository;
import com.joblens.jobposting.validation.JobPostingSortValidator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class JobPostingStatusSummaryServiceTest {

    @Mock
    private JobPostingRepository repository;

    @Mock
    private JobPostingSortValidator sortValidator;

    @Mock
    private JobPostingStatusHistoryRepository historyRepository;

    @InjectMocks
    private JobPostingService service;

    @Test
    void returnsZeroForEveryStatusWhenTheAggregateIsEmpty() {
        when(repository.countGroupedByApplicationStatus()).thenReturn(List.of());

        var response = service.getApplicationStatusSummary();

        assertThat(response).isEqualTo(new ApplicationStatusSummaryResponse(0L, 0L, 0L, 0L, 0L));
        verifySingleAggregateQuery();
    }

    @Test
    void returnsZeroForStatusesMissingFromTheAggregate() {
        when(repository.countGroupedByApplicationStatus()).thenReturn(List.of(
                countRow(ApplicationStatus.REJECTED, 7L)));

        var response = service.getApplicationStatusSummary();

        assertThat(response).isEqualTo(new ApplicationStatusSummaryResponse(0L, 0L, 0L, 0L, 7L));
        verifySingleAggregateQuery();
    }

    @Test
    void mapsCountsByStatusRegardlessOfAggregateRowOrder() {
        when(repository.countGroupedByApplicationStatus()).thenReturn(List.of(
                countRow(ApplicationStatus.OFFERED, 13L),
                countRow(ApplicationStatus.APPLIED, 5L),
                countRow(ApplicationStatus.REJECTED, 17L),
                countRow(ApplicationStatus.SAVED, 2L),
                countRow(ApplicationStatus.INTERVIEWING, 11L)));

        var response = service.getApplicationStatusSummary();

        assertThat(response).isEqualTo(new ApplicationStatusSummaryResponse(2L, 5L, 11L, 13L, 17L));
        verifySingleAggregateQuery();
    }

    @Test
    void preservesCountsLargerThanTheIntegerMaximum() {
        long count = (long) Integer.MAX_VALUE + 1L;
        when(repository.countGroupedByApplicationStatus()).thenReturn(List.of(
                countRow(ApplicationStatus.APPLIED, count)));

        var response = service.getApplicationStatusSummary();

        assertThat(response).isEqualTo(new ApplicationStatusSummaryResponse(0L, count, 0L, 0L, 0L));
        verifySingleAggregateQuery();
    }

    private void verifySingleAggregateQuery() {
        verify(repository).countGroupedByApplicationStatus();
        verifyNoMoreInteractions(repository);
    }

    private static ApplicationStatusCount countRow(ApplicationStatus status, long count) {
        return new ApplicationStatusCount() {
            @Override
            public ApplicationStatus getApplicationStatus() {
                return status;
            }

            @Override
            public long getPostingCount() {
                return count;
            }
        };
    }
}
