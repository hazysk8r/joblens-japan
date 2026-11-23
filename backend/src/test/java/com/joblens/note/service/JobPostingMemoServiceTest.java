package com.joblens.note.service;

import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;

import com.joblens.auth.repository.UserRepository;
import com.joblens.common.limit.UsageLimits;
import com.joblens.jobposting.repository.JobPostingRepository;
import com.joblens.note.domain.JobPostingMemo;
import com.joblens.note.dto.UpdateJobPostingMemoRequest;
import com.joblens.note.exception.JobPostingMemoVersionConflictException;
import com.joblens.note.repository.JobPostingMemoRepository;

@ExtendWith(MockitoExtension.class)
class JobPostingMemoServiceTest {

  private static final Long USER_ID = 10L;
  private static final Long POSTING_ID = 1L;
  private static final Long MEMO_ID = 2L;

  @Mock
  private JobPostingMemoRepository jobPostingMemoRepository;

  @Mock
  private JobPostingRepository jobPostingRepository;

  @Mock
  private UserRepository userRepository;

  @Mock
  private UsageLimits usageLimits;

  @Mock
  private JobPostingMemo memo;

  @InjectMocks
  private JobPostingMemoService service;

  @BeforeEach
  void setUp() {
    when(jobPostingRepository.existsByIdAndUserId(POSTING_ID, USER_ID)).thenReturn(true);
    when(jobPostingMemoRepository.findByIdAndJobPosting_Id(MEMO_ID, POSTING_ID)).thenReturn(Optional.of(memo));
    when(memo.getVersion()).thenReturn(0L);
  }

  @Test
  void 保存のときに別の保存と競合したら_バージョンの競合として扱う() {
    // 確認と保存の間に、別のリクエストが同じメモを保存した場合。
    var cause = new ObjectOptimisticLockingFailureException(JobPostingMemo.class, MEMO_ID);
    doThrow(cause).when(jobPostingMemoRepository).flush();

    var exception = assertThrows(
        JobPostingMemoVersionConflictException.class,
        () -> service.update(USER_ID, POSTING_ID, MEMO_ID, 0L, new UpdateJobPostingMemoRequest("変更後")));

    assertSame(cause, exception.getCause());
  }

  @Test
  void 楽観的ロック以外のDBの例外は_競合に変えない() {
    var cause = new DataIntegrityViolationException("constraint failure");
    doThrow(cause).when(jobPostingMemoRepository).flush();

    var exception = assertThrows(
        DataIntegrityViolationException.class,
        () -> service.update(USER_ID, POSTING_ID, MEMO_ID, 0L, new UpdateJobPostingMemoRequest("変更後")));

    assertSame(cause, exception);
  }
}
