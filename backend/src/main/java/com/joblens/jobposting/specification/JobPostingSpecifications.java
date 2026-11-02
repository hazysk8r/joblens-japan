package com.joblens.jobposting.specification;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

import org.springframework.data.jpa.domain.Specification;

import com.joblens.jobposting.domain.ApplicationStatus;
import com.joblens.jobposting.domain.JobPosting;

import jakarta.persistence.criteria.Predicate;

public class JobPostingSpecifications {
  // 所有者で絞り込む。他の条件と違い省略できないため、nullは受け付けない。
  public static Specification<JobPosting> ownedBy(Long userId) {
    Objects.requireNonNull(userId, "userId must not be null");
    return (root, query, cb) -> cb.equal(root.get("userId"), userId);
  }

  // statusの絞り込み
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

  // keywordの絞り込み
  public static Specification<JobPosting> hasKeyword(String keyword) {
    if (keyword == null) {
      return Specification.unrestricted();
    }

    return (root, query, cb) -> {
      String escapedKeyword = escapeLikeKeyword(keyword.toLowerCase(Locale.ROOT));
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

      // 月給フィルターを使わない場合は、
      // WHERE条件を追加せずに求人を表示する
      if (salaryMin == null && salaryMax == null) {
        return cb.conjunction();
      }

      // ユーザーが入力した月給の条件に応じて、
      // 必要なPredicateを動的に追加する。
      List<Predicate> predicates = new ArrayList<>();

      /*
       * 月給フィルターを使う場合は、
       * salaryMinとsalaryMaxがどちらもNULLの求人を除外する。
       */
      Predicate hasSalary = cb.or(
          cb.isNotNull(
              root.get("salaryMin")),
          cb.isNotNull(
              root.get("salaryMax")));

      predicates.add(hasSalary);

      /*
       * 検索の最低月給が指定されている場合
       *
       * 例:
       * filterMin = 250000
       *
       * 求人の最高月給が250000以上であれば、
       * 検索範囲と重なる可能性がある。
       *
       * salaryMaxがNULLの求人は、
       * 上限が決まっていないものとして許可する。
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
       * 検索の最高月給が指定されている場合
       *
       * 例:
       * filterMax = 400000
       *
       * 求人の最低月給が400000以下であれば、
       * 検索範囲と重なる可能性がある。
       *
       * salaryMinがNULLの求人は、
       * 下限が決まっていないものとして許可する。
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
       * ここまでに追加したすべての条件をANDで結合する。
       */
      return cb.and(
          predicates.toArray(new Predicate[0]));
    };
  }

  public static Specification<JobPosting> hasDeadlineBetween(
    LocalDate deadlineFrom,
    LocalDate deadlineTo
  ) {
    return (root, query, cb) -> {

      if (deadlineFrom == null && deadlineTo == null) {
        return cb.conjunction();
      }

      if (deadlineFrom != null && deadlineTo != null) {
        return cb.between(
                root.get("applicationDeadline"),
                deadlineFrom,
                deadlineTo
        );
      }

      if (deadlineFrom != null) {
        return cb.greaterThanOrEqualTo(
                root.get("applicationDeadline"),
                deadlineFrom
        );
      }

      return cb.lessThanOrEqualTo(
              root.get("applicationDeadline"),
              deadlineTo
      );
    };
  }
}
