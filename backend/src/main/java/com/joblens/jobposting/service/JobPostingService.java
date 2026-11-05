package com.joblens.jobposting.service;

import com.joblens.auth.exception.UserNoLongerExistsException;
import com.joblens.auth.repository.UserRepository;
import com.joblens.common.limit.UsageLimits;
import com.joblens.common.response.PageResponse;
import com.joblens.jobposting.domain.ApplicationStatus;
import com.joblens.jobposting.domain.JobPosting;
import com.joblens.jobposting.domain.JobPostingStatusHistory;
import com.joblens.jobposting.dto.ApplicationStatusSummaryResponse;
import com.joblens.jobposting.dto.CreateJobPostingRequest;
import com.joblens.jobposting.dto.JobPostingResponse;
import com.joblens.jobposting.dto.JobPostingStatusHistoryResponse;
import com.joblens.jobposting.dto.UpdateJobPostingRequest;
import com.joblens.jobposting.dto.UpdateApplicationStatusRequest;
import com.joblens.jobposting.repository.JobPostingRepository;
import com.joblens.jobposting.repository.JobPostingStatusHistoryRepository;
import com.joblens.jobposting.specification.JobPostingSpecifications;
import com.joblens.jobposting.exception.InvalidPageException;
import com.joblens.jobposting.exception.JobPostingLimitReachedException;
import com.joblens.jobposting.exception.JobPostingNotFoundException;
import com.joblens.jobposting.exception.JobPostingVersionConflictException;
import com.joblens.jobposting.validation.JobPostingSortValidator;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.regex.*;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.dao.OptimisticLockingFailureException;


@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class JobPostingService {

    private final JobPostingSortValidator jobPostingSortValidator;
    private final JobPostingRepository jobPostingRepository;
    private final JobPostingStatusHistoryRepository jobPostingStatusHistoryRepository;
    private final UserRepository userRepository;
    private final UsageLimits usageLimits;
    private static final List<String> SUPPORTED_SKILLS = List.of(
            "Java",
            "Spring Boot",
            "AWS",
            "Docker",
            "PostgreSQL",
            "React",
            "TypeScript",
            "C",
            "C++");


    @Transactional
    public JobPostingResponse create(Long userId, CreateJobPostingRequest request) {
        // 件数の確認と保存の間に同じユーザーの別の登録が入ると、上限を超えてしまう。
        userRepository.findLockedById(userId).orElseThrow(UserNoLongerExistsException::new);

        if (jobPostingRepository.countByUserId(userId) >= usageLimits.maxPostingsPerUser()) {
            throw new JobPostingLimitReachedException(usageLimits.maxPostingsPerUser());
        }

        // 所有者は必ずログイン中のユーザーにする。リクエスト本文からは受け取らない。
        JobPosting jobPosting = new JobPosting(
                userId,
                request.companyName(),
                request.title(),
                request.sourceUrl(),
                request.originalText(),
                request.salaryMin(),
                request.salaryMax(),
                request.applicationDeadline()
        );

        JobPosting savedJobPosting = jobPostingRepository.save(jobPosting);

        return JobPostingResponse.from(savedJobPosting);
    }

    /**
     * 更新後のversionをレスポンスに含めるため、変更内容をflushする。
     * 保存時の楽観的ロック競合は、原因となった例外を保持して、共通の競合例外へ変換する。
     */
    private void flushConditionalUpdate(Long id) {
        try {
            jobPostingRepository.flush();
        } catch (OptimisticLockingFailureException exception) {
            throw new JobPostingVersionConflictException(id, exception);
        }
    }
    
    /**
     * 既存の求人を編集する。
     *
     * @Transactionalが適用された状態で取得したエンティティを変更すると、
     * JPAの変更検知(Dirty Checking)が働いてUPDATE SQLを実行する。
     *
     * そのため、別途repository.save(jobPosting)を呼び出さなくてもよい。
     */
    @Transactional
    public JobPostingResponse update(
            Long userId,
            Long id,
            Long expectedVersion,
            UpdateJobPostingRequest request
    ) {
        // 所有者の確認(404)をversionの確認(412)より先に行い、他人の求人の存在やversionを漏らさない。
        JobPosting jobPosting = findEntityById(userId, id);
        validateVersion(jobPosting, expectedVersion);

        jobPosting.update(
                request.companyName(),
                request.title(),
                request.sourceUrl(),
                request.originalText(),
                request.salaryMin(),
                request.salaryMax(),
                request.applicationDeadline()
        );

        // 保存時の競合を検出し、更新後のversionをレスポンスに反映する。
        flushConditionalUpdate(id);

        return JobPostingResponse.from(jobPosting);
    }

    /**
     * 求人を削除する。
     *
     * 先に取得する理由は、存在しないIDを削除したときに
     * 黙って成功扱いにせず、404を返すため。
     */
    @Transactional
    public void delete(Long userId, Long id) {
        JobPosting jobPosting = findEntityById(userId, id);
        jobPostingRepository.delete(jobPosting);
    }

    /**
     * ID検索と例外処理を一か所にまとめた内部メソッド。
     *
     * 編集、削除、単件取得で同じ検索コードを繰り返さないようにする。
     */
    /*
     * 他のユーザーの求人は、存在しない求人と同じ404にする。
     * 403にすると、そのIDの求人が存在することが分かってしまうため。
     */
    private JobPosting findEntityById(Long userId, Long id) {
        return jobPostingRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new JobPostingNotFoundException(id));
    }

    /**
     * If-Matchのversionと、取得した求人情報のversionを比較する。
     * 不一致の場合は、変更前に競合例外を送出する。
     */
    private void validateVersion(JobPosting jobPosting, Long expectedVersion) {
        if (!Objects.equals(expectedVersion, jobPosting.getVersion())) {
            throw new JobPostingVersionConflictException(
                jobPosting.getId(),
                expectedVersion,
                jobPosting.getVersion()
            );
        }
    }

    /**
     * 求人をページ単位で取得する。
     *
     * keywordがない場合は全件を取得し、
     * keywordがある場合はタイトル・会社名・原文から検索する。
     */
    public PageResponse<JobPostingResponse> findAll(
            Long userId,
            String keyword,
            Pageable pageable,
            ApplicationStatus applicationStatus,
            Integer salaryMin,
            Integer salaryMax,
            LocalDate deadlineFrom,
            LocalDate deadlineTo
    ) {
        // Hibernateはオフセットをintで扱うため、超えると検索の実行時に例外になる。
        if (pageable.getOffset() > Integer.MAX_VALUE) {
            throw new InvalidPageException();
        }

        // pageableからsortだけを取り出す
        Sort requestedSort = pageable.getSort();
        // validatorで検証する
        jobPostingSortValidator.validate(requestedSort);
        // ユーザーが指定した並び順の後ろにidの並び順を追加する
        Sort finalSort = requestedSort.and(
            Sort.by(
                requestedSort.iterator().next().getDirection(),
                "id"
            )
        );
        // 既存のpageableのpageとsizeは維持し、sortだけをfinalsortに変えた新しいpageableを作る
        Pageable finalPageable = PageRequest.of(
            pageable.getPageNumber(),
            pageable.getPageSize(),
            finalSort
        );

        String normalizedKeyword = (keyword == null || keyword.isBlank()) ? null : keyword.strip();

        Specification<JobPosting> spec = Specification.allOf(
            JobPostingSpecifications.ownedBy(userId),
            JobPostingSpecifications.hasKeyword(normalizedKeyword),
            JobPostingSpecifications.hasStatus(applicationStatus),
            JobPostingSpecifications.salaryOverlaps(
                salaryMin,
                salaryMax
            ),
            JobPostingSpecifications.hasDeadlineBetween(deadlineFrom, deadlineTo)
        );

        Page<JobPosting> jobPostingPage = jobPostingRepository.findAll(spec, finalPageable);

        /*
        * Page<JobPosting>をPage<JobPostingResponse>に変換する。
        * ページ番号や全件数などの情報はそのまま維持される。
        */
        Page<JobPostingResponse> responsePage =
                jobPostingPage.map(JobPostingResponse::from);

        return PageResponse.from(responsePage);
    }
    /**
     * orElseThrow()
     * データあり → JobPostingを返す
     * データなし → JobPostingNotFoundExceptionが発生
     * 共通メソッドを使うように修正
     */
    public JobPostingResponse findById(Long userId, Long id) {
        JobPosting jobPosting = findEntityById(userId, id);
        return JobPostingResponse.from(jobPosting);
    }


    @Transactional
    public JobPostingResponse updateApplicationStatus(
        Long userId,
        Long id,
        Long expectedVersion,
        UpdateApplicationStatusRequest request
    ) {
        // 1. 既存の求人情報を取得し、共有versionを検証する。
        JobPosting jobPosting = findEntityById(userId, id);
        validateVersion(jobPosting, expectedVersion);

        // 2. 履歴保存のため、変更前後の応募状態を取得する。
        ApplicationStatus fromStatus =
            jobPosting.getApplicationStatus();
        
        ApplicationStatus toStatus = 
            request.status();
        
        // 3. 要求された応募状態に変更する。
        jobPosting.changeApplicationStatus(toStatus);

        // 保存時の競合を検出し、更新後のversionをレスポンスに反映する。
        flushConditionalUpdate(id);

        /*
         * 実際に応募状態が変更された場合のみ、
         * 変更前後の状態を履歴として保存する。
         */
        if (fromStatus != toStatus) {
            jobPostingStatusHistoryRepository.save(
                new JobPostingStatusHistory(
                    jobPosting, 
                    fromStatus, 
                    toStatus
                )
            );
        }

        return JobPostingResponse.from(jobPosting);
    }

    public ApplicationStatusSummaryResponse getApplicationStatusSummary(Long userId) {
        // 集計結果の行順に依存せず参照できるよう、応募状況をキーに件数を保持する。
        EnumMap<ApplicationStatus, Long> counts = new EnumMap<>(ApplicationStatus.class);
        for (var result : jobPostingRepository.countGroupedByApplicationStatus(userId)) {
            counts.put(result.getApplicationStatus(), result.getPostingCount());
        }
        
        // 集計結果に含まれない応募状況は0件として返す。求人が0件の場合も全項目を0件とする。
        return new ApplicationStatusSummaryResponse(
            counts.getOrDefault(ApplicationStatus.SAVED, 0L),
            counts.getOrDefault(ApplicationStatus.APPLIED, 0L),
            counts.getOrDefault(ApplicationStatus.INTERVIEWING, 0L),
            counts.getOrDefault(ApplicationStatus.OFFERED, 0L),
            counts.getOrDefault(ApplicationStatus.REJECTED, 0L)
        );
    }

    public List<String> extractSkills(Long userId, Long id) {
        JobPosting jobPosting = findEntityById(userId, id);
        String originalText = jobPosting.getOriginalText();
        
        if (originalText == null || originalText.isBlank()) {
            return List.of();
        }
        String normalizedOriginalText = originalText.toLowerCase(Locale.ROOT);
        List<String> extractedSkills = new ArrayList<>();
        String lookbehind = "(?<![a-zA-Z0-9+#.])";
        // 文末のピリオドは許可し、ドットで接続された識別子は除外する。
        String lookahead = "(?![a-zA-Z0-9+#]|\\.+[a-zA-Z0-9_+$#])";
        for (String skill : SUPPORTED_SKILLS) {
            String normalizedSkill = skill.toLowerCase(Locale.ROOT);
            String escapedSkill = Pattern.quote(normalizedSkill);
            String finalRegex = lookbehind + escapedSkill + lookahead;
            Pattern pattern = Pattern.compile(finalRegex);
            Matcher matcher = pattern.matcher(normalizedOriginalText);
            
            if (matcher.find()) {
                extractedSkills.add(skill);
            }
        }
        return extractedSkills;
    }   

    public List<JobPostingStatusHistoryResponse>
        getApplicationStatusHistory(Long userId, Long jobPostingId) {
    
    findEntityById(userId, jobPostingId);

    List<JobPostingStatusHistory> histories = jobPostingStatusHistoryRepository.findByJobPosting_IdOrderByChangedAtDescIdDesc(jobPostingId);

    return histories.stream()
        .map(JobPostingStatusHistoryResponse::from)
        .toList();
    }


}
