package com.joblens.common.error;

import java.time.Instant;
import java.util.Map;

/**
 * APIでエラーが発生したときに、一定の形式で返すための応答DTO。
 *
 * recordを使うと、DTOに必要なコンストラクタとgetterに相当するメソッドが
 * 自動で作られ、不要な繰り返しのコードを減らせる。
 */
public record ApiErrorResponse(
        Instant timestamp,
        int status,
        String code,
        String message,
        String path,
        Map<String, String> fieldErrors
) {
}
/**
 * codeを別に持つ理由は、フロントエンドがメッセージの文字列ではなくコードで処理できるようにするため。
 * つまり、messageはユーザーに見せるもので、codeはフロントエンドのプログラムが判断に使うもの。
*/