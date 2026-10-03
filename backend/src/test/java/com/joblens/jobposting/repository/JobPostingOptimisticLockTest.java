package com.joblens.jobposting.repository;

import com.joblens.TestcontainersConfiguration;
import com.joblens.jobposting.domain.JobPosting;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.OptimisticLockException;
import jakarta.persistence.EntityTransaction;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
class JobPostingOptimisticLockTest {

  @Autowired
  private JobPostingRepository jobPostingRepository;

  @Autowired
  private EntityManagerFactory entityManagerFactory;

  @BeforeEach
  void setUp() {
    jobPostingRepository.deleteAll();
  }

  @Test
  void 동일한_version으로_조회한_두_transaction이_데이터를_수정하면_두번째_flush에서_낙관적_락_예외가_발생한다() {
    JobPosting saved = jobPostingRepository.saveAndFlush(
        new JobPosting(
            "黄猿",
            "エンジニア求人",
            null,
            "AWSエンジニア求人",
            null,
            null,
            null));

    EntityManager firstEntityManager = entityManagerFactory.createEntityManager();

    EntityManager secondEntityManager = entityManagerFactory.createEntityManager();

    try {
      EntityTransaction firstTransaction = firstEntityManager.getTransaction();

      EntityTransaction secondTransaction = secondEntityManager.getTransaction();

      firstTransaction.begin();
      secondTransaction.begin();

      JobPosting firstJobPosting = firstEntityManager.find(
          JobPosting.class,
          saved.getId());

      JobPosting secondJobPosting = secondEntityManager.find(
          JobPosting.class,
          saved.getId());

      assertEquals(
          firstJobPosting.getVersion(),
          secondJobPosting.getVersion());

      firstJobPosting.update(
          "黄猿",
          "クラウドエンジニア求人",
          null,
          "AWSエンジニア求人",
          null,
          null,
          null);

      firstTransaction.commit();

      secondJobPosting.update(
          "黄猿",
          "Javaエンジニア求人",
          null,
          "Javaエンジニア求人",
          null,
          null,
          null);

      assertThrows(
          OptimisticLockException.class,
          secondEntityManager::flush);

    } finally {
      if (firstEntityManager
          .getTransaction()
          .isActive()) {
        firstEntityManager
            .getTransaction()
            .rollback();
      }

      if (secondEntityManager
          .getTransaction()
          .isActive()) {
        secondEntityManager
            .getTransaction()
            .rollback();
      }

      firstEntityManager.close();
      secondEntityManager.close();
    }

    // 競合した変更が保存されず、先にコミットした内容が維持されることを確認する。
    JobPosting reloaded = jobPostingRepository
        .findById(saved.getId())
        .orElseThrow();

    assertEquals(
        "クラウドエンジニア求人",
        reloaded.getTitle());

    assertEquals(
        "AWSエンジニア求人",
        reloaded.getOriginalText());

    assertEquals(
        Long.valueOf(saved.getVersion() + 1),
        reloaded.getVersion());
  }
}