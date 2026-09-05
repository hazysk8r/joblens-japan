package com.joblens.jobposting.service;

import com.joblens.common.response.PageResponse;
import com.joblens.jobposting.domain.ApplicationStatus;
import com.joblens.jobposting.domain.JobPosting;
import com.joblens.jobposting.dto.ApplicationStatusSummaryResponse;
import com.joblens.jobposting.dto.CreateJobPostingRequest;
import com.joblens.jobposting.dto.JobPostingResponse;
import com.joblens.jobposting.dto.UpdateJobPostingRequest;
import com.joblens.jobposting.dto.UpdateApplicationStatusRequest;
import com.joblens.jobposting.repository.JobPostingRepository;
import com.joblens.jobposting.specification.JobPostingSpecifications;
import com.joblens.jobposting.exception.JobPostingNotFoundException;
import com.joblens.jobposting.validation.JobPostingSortValidator;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.*;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;


@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class JobPostingService {

    private final JobPostingSortValidator jobPostingSortValidator;
    private final JobPostingRepository jobPostingRepository;
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
    public JobPostingResponse create(CreateJobPostingRequest request) {
        JobPosting jobPosting = new JobPosting(
                request.companyName(),
                request.title(),
                request.sourceUrl(),
                request.originalText(),
                request.salaryMin(),
                request.salaryMax()
        );

        JobPosting savedJobPosting = jobPostingRepository.save(jobPosting);

        return JobPostingResponse.from(savedJobPosting);
    }
    
    /**
     * 기존 채용공고를 수정한다.
     *
     * @Transactional이 적용된 상태에서 조회한 엔티티를 변경하면
     * JPA의 변경 감지(Dirty Checking)가 동작하여 UPDATE SQL을 실행한다.
     *
     * 따라서 별도로 repository.save(jobPosting)를 호출하지 않아도 된다.
     */
    @Transactional
    public JobPostingResponse update(
            Long id,
            UpdateJobPostingRequest request
    ) {
        JobPosting jobPosting = findEntityById(id);

        jobPosting.update(
                request.companyName(),
                request.title(),
                request.sourceUrl(),
                request.originalText(),
                request.salaryMin(),
                request.salaryMax()
        );

        return JobPostingResponse.from(jobPosting);
    }

    /**
     * 채용공고를 삭제한다.
     *
     * 먼저 조회하는 이유는 존재하지 않는 ID를 삭제했을 때
     * 조용히 성공 처리하지 않고 404를 반환하기 위해서다.
     */
    @Transactional
    public void delete(Long id) {
        JobPosting jobPosting = findEntityById(id);
        jobPostingRepository.delete(jobPosting);
    }

    /**
     * ID 조회와 예외 처리를 한곳에 모은 내부 메서드다.
     *
     * 수정, 삭제, 단건 조회에서 같은 조회 코드를 반복하지 않도록 한다.
     */
    private JobPosting findEntityById(Long id) {
        return jobPostingRepository.findById(id)
                .orElseThrow(() -> new JobPostingNotFoundException(id));
    }

    /**
     * 채용공고를 페이지 단위로 조회한다.
     *
     * keyword가 없으면 전체 공고를 조회하고,
     * keyword가 있으면 제목·회사명·원문에서 검색한다.
     */
    public PageResponse<JobPostingResponse> findAll(
            String keyword,
            Pageable pageable,
            ApplicationStatus applicationStatus,
            Integer salaryMin,
            Integer salaryMax
    ) {
        // pageable에서 sort만 꺼냄
        Sort requestedSort = pageable.getSort();
        // validator에서 검증
        jobPostingSortValidator.validate(requestedSort);
        // 사용자가 요청한 정렬 뒤에 id 정렬 추가
        Sort finalSort = requestedSort.and(
            Sort.by(
                requestedSort.iterator().next().getDirection(),
                "id"
            )
        );
        // 기존 pageable의 page 및 size는 유지, sort만 finalsort로 바꾼 새로운 pageable 생성
        Pageable finalPageable = PageRequest.of(
            pageable.getPageNumber(),
            pageable.getPageSize(),
            finalSort
        );

        String normalizedKeyword = (keyword == null || keyword.isBlank()) ? null : keyword.strip();

        Specification<JobPosting> spec = Specification.allOf(
            JobPostingSpecifications.hasKeyword(normalizedKeyword),
            JobPostingSpecifications.hasStatus(applicationStatus),
            JobPostingSpecifications.salaryOverlaps(
                salaryMin,
                salaryMax
            )
        );

        Page<JobPosting> jobPostingPage = jobPostingRepository.findAll(spec, finalPageable);

        /*
        * Page<JobPosting>을 Page<JobPostingResponse>로 변환한다.
        * 페이지 번호와 전체 개수 같은 정보는 그대로 유지된다.
        */
        Page<JobPostingResponse> responsePage =
                jobPostingPage.map(JobPostingResponse::from);

        return PageResponse.from(responsePage);
    }
    /**
     * orElseThrow()
     * 데이터 있음 → JobPosting 반환
     * 데이터 없음 → JobPostingNotFoundException 발생
     * 공통 메서드 사용하도록 수정함
     */
    public JobPostingResponse findById(Long id) {
        JobPosting jobPosting = findEntityById(id);
        return JobPostingResponse.from(jobPosting);
    }


    @Transactional
    public JobPostingResponse updateApplicationStatus(
        Long id,
        UpdateApplicationStatusRequest request
    ) {
        // 1. 기존 공고 조회
        JobPosting jobPosting = findEntityById(id);
        // 2. 요청받은 상태로 엔티티 변경
        jobPosting.changeApplicationStatus(
            request.status()
        );
        // 3. 변경된 엔티티를 DTO로 변환
        return JobPostingResponse.from(jobPosting);
    }

    public ApplicationStatusSummaryResponse getApplicationStatusSummary() {
        long saved = jobPostingRepository
                .countByApplicationStatus(ApplicationStatus.SAVED);
        long applied = jobPostingRepository
                .countByApplicationStatus(ApplicationStatus.APPLIED);
        long interviewing = jobPostingRepository
                .countByApplicationStatus(ApplicationStatus.INTERVIEWING);
        long offered = jobPostingRepository
                .countByApplicationStatus(ApplicationStatus.OFFERED);
        long rejected = jobPostingRepository
                .countByApplicationStatus(ApplicationStatus.REJECTED);
        
        return new ApplicationStatusSummaryResponse(
            saved,
            applied,
            interviewing,
            offered,
            rejected
        );
    }

    public List<String> extractSkills(Long id) {
        // 
        JobPosting jobPosting = findEntityById(id);
        String originalText = jobPosting.getOriginalText();
        
        if (originalText == null || originalText.isBlank()) {
            return List.of();
        }
        String normalizedOriginalText = originalText.toLowerCase(Locale.ROOT);
        List<String> extractedSkills = new ArrayList<>();
        String lookbehind = "(?<![a-zA-Z0-9+#.])";
        String lookahead = "(?![a-zA-Z0-9+#.])";
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


}