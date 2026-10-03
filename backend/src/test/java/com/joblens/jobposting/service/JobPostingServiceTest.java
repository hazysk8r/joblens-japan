package com.joblens.jobposting.service;

import com.joblens.jobposting.domain.ApplicationStatus;
import com.joblens.jobposting.domain.JobPosting;
import com.joblens.jobposting.dto.UpdateApplicationStatusRequest;
import com.joblens.jobposting.dto.UpdateJobPostingRequest;
import com.joblens.jobposting.exception.JobPostingVersionConflictException;
import com.joblens.jobposting.repository.JobPostingRepository;
import com.joblens.jobposting.validation.JobPostingSortValidator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.doThrow;
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
  void 応募状況更新の保存時競合を共通例外へ変換する() {
    var cause = new ObjectOptimisticLockingFailureException(JobPosting.class, 1L);
    doThrow(cause).when(repository).flush();

    var exception = assertThrows(
        JobPostingVersionConflictException.class,
        () -> service.updateApplicationStatus(
            1L, 0L, new UpdateApplicationStatusRequest(ApplicationStatus.APPLIED)));

    assertSame(cause, exception.getCause());
    verify(repository).flush();
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
}
