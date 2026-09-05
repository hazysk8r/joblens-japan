package com.joblens.jobposting.specification;

import java.util.ArrayList;
import java.util.List;

import org.springframework.data.jpa.domain.Specification;

import com.joblens.jobposting.domain.ApplicationStatus;
import com.joblens.jobposting.domain.JobPosting;

import jakarta.persistence.criteria.Predicate;

public class JobPostingSpecifications {
  // status 필터링
  public static Specification<JobPosting> hasStatus(ApplicationStatus applicationStatus) {
    if (applicationStatus == null) {
      return Specification.unrestricted();
    }

    return (root, query, cb) -> cb.equal(root.get("applicationStatus"), applicationStatus);
  }

  private static String escapeLikeKeyword(String keyword) {
    return keyword
        .replace("!", "!!")
        .replace("%", "!%")
        .replace("_", "!_");
  }

  // keyword 필터링
  public static Specification<JobPosting> hasKeyword(String keyword) {
    if (keyword == null) {
      return Specification.unrestricted();
    }

    return (root, query, cb) -> {
      String escapedKeyword = escapeLikeKeyword(keyword.toLowerCase());
      String pattern = "%" + escapedKeyword + "%";

      Predicate titleLike = cb.like(cb.lower(root.get("title")), pattern, '!');
      Predicate companyNameLike = cb.like(cb.lower(root.get("companyName")), pattern, '!');
      Predicate originalTextLike = cb.like(cb.lower(root.get("originalText")), pattern, '!');

      return cb.or(titleLike, companyNameLike, originalTextLike);
    };
  }

  // Salary範囲設定
  public static Specification<JobPosting> salaryOverlaps(
      Integer salaryMin,
      Integer salaryMax) {
    return (root, query, cb) -> {

      // 급여 필터를 사용하지 않는 경우
      // 별도의 WHERE 조건을 추가하지 않고 공고를 보여준다
      if (salaryMin == null && salaryMax == null) {
        return cb.conjunction();
      }

      // 사용자가 입력한 급여 조건에 따라
      // 필요한 Predicate를 동적으로 추가한다.
      List<Predicate> predicates = new ArrayList<>();

      /*
       * 급여 필터를 사용하는 경우,
       * salaryMin과 salaryMax가 모두 NULL인 공고는 제외한다.
       */
      Predicate hasSalary = cb.or(
          cb.isNotNull(
              root.get("salaryMin")),
          cb.isNotNull(
              root.get("salaryMax")));

      predicates.add(hasSalary);

      /*
       * 검색 최소 월급이 존재하는 경우
       *
       * 예:
       * filterMin = 250000
       *
       * 공고의 최대 월급이 250000 이상이면
       * 검색 범위와 겹칠 가능성이 있다.
       *
       * salaryMax가 NULL인 공고는
       * 상한이 정해져 있지 않은 것으로 보고 허용한다.
       */
      if (salaryMin != null) {

        Predicate minCondition = cb.or(
            cb.isNull(
                root.get("salaryMax")),
            cb.greaterThanOrEqualTo(
                root.<Integer>get("salaryMax"),
                salaryMin));

        predicates.add(minCondition);
      }

      /*
       * 검색 최대 월급이 존재하는 경우
       *
       * 예:
       * filterMax = 400000
       *
       * 공고의 최소 월급이 400000 이하이면
       * 검색 범위와 겹칠 가능성이 있다.
       *
       * salaryMin이 NULL인 공고는
       * 하한이 정해져 있지 않은 것으로 보고 허용한다.
       */
      if (salaryMax != null) {

        Predicate maxCondition = cb.or(
            cb.isNull(
                root.get("salaryMin")),
            cb.lessThanOrEqualTo(
                root.<Integer>get("salaryMin"),
                salaryMax));

        predicates.add(maxCondition);
      }

      /*
       * 지금까지 추가한 모든 조건을 AND로 결합한다.
       */
      return cb.and(
          predicates.toArray(new Predicate[0]));
    };
  }
}
