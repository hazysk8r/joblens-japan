package com.joblens.jobposting.service;

import com.joblens.jobposting.domain.ApplicationStatus;
import com.joblens.jobposting.domain.JobPosting;
import com.joblens.jobposting.domain.JobPostingStatusHistory;
import com.joblens.jobposting.dto.UpdateApplicationStatusRequest;
import com.joblens.jobposting.dto.UpdateJobPostingRequest;
import com.joblens.jobposting.exception.JobPostingVersionConflictException;
import com.joblens.jobposting.repository.JobPostingRepository;
import com.joblens.jobposting.repository.JobPostingStatusHistoryRepository;
import com.joblens.jobposting.validation.JobPostingSortValidator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;

import java.util.Optional;
import static org.assertj.core.api.Assertions.assertThat;

import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class JobPostingServiceTest {

  @Mock
  private JobPostingRepository repository;

  @Mock
  private JobPostingSortValidator sortValidator;

  @Mock
  private JobPosting jobPosting;

  @Mock 
  private JobPostingStatusHistory jobPostingStatusHistory;

  @Mock 
  private JobPostingStatusHistoryRepository jobPostingStatusHistoryRepository;

  @InjectMocks
  private JobPostingService service;

  @BeforeEach
  void setUp() {
    when(repository.findById(1L)).thenReturn(Optional.of(jobPosting));
    when(jobPosting.getVersion()).thenReturn(0L);
  }

  @Test
  void 一般更新の保存時競合を共通例外へ変換する() {
    var cause = new ObjectOptimisticLockingFailureException(JobPosting.class, 1L);
    doThrow(cause).when(repository).flush();

    var exception = assertThrows(
        JobPostingVersionConflictException.class,
        () -> service.update(1L, 0L, updateRequest()));

    assertSame(cause, exception.getCause());
    verify(repository).flush();
  }

  @Test
  void 応募状況更新の保存時競合を共通例外へ変換しHistoryを保存しない() {
    var cause = new ObjectOptimisticLockingFailureException(JobPosting.class, 1L);
    doThrow(cause).when(repository).flush();

    var exception = assertThrows(
        JobPostingVersionConflictException.class,
        () -> service.updateApplicationStatus(
            1L, 0L, new UpdateApplicationStatusRequest(ApplicationStatus.APPLIED)));

    assertSame(cause, exception.getCause());
    verify(repository).flush();
    verify(
        jobPostingStatusHistoryRepository,
        never()).save(any(JobPostingStatusHistory.class));
  }

  @Test
  void 楽観的ロック以外のDB例外は競合例外へ変換しない() {
    var cause = new DataIntegrityViolationException("constraint failure");
    doThrow(cause).when(repository).flush();

    var exception = assertThrows(
        DataIntegrityViolationException.class,
        () -> service.update(1L, 0L, updateRequest()));

    assertSame(cause, exception);
  }

  private UpdateJobPostingRequest updateRequest() {
    return new UpdateJobPostingRequest(
        "テスト会社", "更新後の求人", null, "Javaの開発経験",
        300000, 500000, null);
  }

  @Test 
  void 応募状態変更成功時にHistoryを保存する() {
    when(jobPosting.getApplicationStatus())
          .thenReturn(ApplicationStatus.SAVED);
    
    UpdateApplicationStatusRequest request =
      new UpdateApplicationStatusRequest(ApplicationStatus.APPLIED);

    service.updateApplicationStatus(
      1L,
      0L, 
      request
    );

    ArgumentCaptor<JobPostingStatusHistory> captor = 
      ArgumentCaptor.forClass(
        JobPostingStatusHistory.class
      );
    
    verify(jobPostingStatusHistoryRepository)
      .save(captor.capture());

    JobPostingStatusHistory history =
      captor.getValue();

    assertThat(history.getFromStatus())
        .isEqualTo(ApplicationStatus.SAVED);

    assertThat(history.getToStatus())
        .isEqualTo(ApplicationStatus.APPLIED);
  }

  @Test 
  void 同じ応募状態の場合Historyを保存しない() {
    when(jobPosting.getApplicationStatus())
          .thenReturn(ApplicationStatus.SAVED);

    UpdateApplicationStatusRequest request =
      new UpdateApplicationStatusRequest(ApplicationStatus.SAVED);

    service.updateApplicationStatus(
      1L, 
      0L, 
      request
    );

    verify(jobPostingStatusHistoryRepository, never())
      .save(any(JobPostingStatusHistory.class));
  }
}
