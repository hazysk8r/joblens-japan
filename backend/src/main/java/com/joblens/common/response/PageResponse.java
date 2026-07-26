package com.joblens.common.response;

import org.springframework.data.domain.Page;

import java.util.List;

/**
 * 페이지 조회 결과를 프런트엔드에 일정한 형식으로 전달하는 DTO다.
 *
 * Spring의 Page 객체를 그대로 반환하지 않고 필요한 정보만 노출하면,
 * 내부 구현이 변경되어도 API 응답 형식을 안정적으로 유지할 수 있다.
 */

public record PageResponse<T>(
        List<T> content,
        int page,
        int size,
        long totalElements,
        int totalPages,
        boolean first,
        boolean last
) {
    /**
     * Spring Data의 Page 객체를 API 전용 응답으로 변환한다.
     *
     * <T>는 JobPostingResponse 등 여러 DTO에
     * 공통으로 사용할 수 있게 해주는 제네릭 타입이다.
     */
    public static <T> PageResponse<T> from(Page<T> page) {
        return new PageResponse<>(
                page.getContent(),
                page.getNumber(),
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages(),
                page.isFirst(),
                page.isLast()
        );
    }
}

/**
 * 응답은 앞으로 배열이 아니라 다음 구조로 바뀜.
 * {
  "content": [],
  "page": 0,
  "size": 10,
  "totalElements": 0,
  "totalPages": 0,
  "first": true,
  "last": true
   }
 */