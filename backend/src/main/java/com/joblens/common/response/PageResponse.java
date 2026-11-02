package com.joblens.common.response;

import org.springframework.data.domain.Page;

import java.util.List;

/**
 * ページ取得の結果を、一定の形式でフロントエンドに渡すDTO。
 *
 * SpringのPageオブジェクトをそのまま返さず必要な情報だけを公開すると、
 * 内部の実装が変わってもAPI応答の形式を安定して保てる。
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
     * Spring DataのPageオブジェクトをAPI専用の応答に変換する。
     *
     * <T>はJobPostingResponseなどの複数のDTOに
     * 共通で使えるようにするためのジェネリック型。
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
 * 応答は今後、配列ではなく次の構造になる。
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