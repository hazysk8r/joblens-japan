package com.joblens.common.error;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.boot.web.error.ErrorAttributeOptions;
import org.springframework.boot.webmvc.error.DefaultErrorAttributes;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.WebRequest;

/**
 * /errorに転送された応答(未処理の例外、フィルターの例外、404・405・415など)をApiErrorResponseと同じ形式にする。
 *
 * すべての例外を受ける@ExceptionHandlerにはしない。405のAllowヘッダーや
 * セキュリティの例外など、Springの処理に任せるべきものまで奪ってしまううえ、フィルターの例外は受けられないため。
 *
 * 例外の内容にはSQLやテーブル名が含まれることがあるため、応答には固定の文言だけを入れる。
 */
@Component
public class ApiErrorAttributes extends DefaultErrorAttributes {

    static final String SERVER_ERROR_MESSAGE = "サーバーで問題が発生しました。しばらくしてから再度お試しください。";
    private static final String CLIENT_ERROR_MESSAGE = "リクエストを処理できませんでした。";

    @Override
    public Map<String, Object> getErrorAttributes(WebRequest webRequest, ErrorAttributeOptions options) {
        Map<String, Object> defaults = super.getErrorAttributes(webRequest, ErrorAttributeOptions.defaults());
        HttpStatus status = statusOf(defaults);
        Object path = defaults.get("path");

        Map<String, Object> attributes = new LinkedHashMap<>();
        attributes.put("timestamp", Instant.now());
        attributes.put("status", status.value());
        attributes.put("code", status.name());
        attributes.put("message", status.is5xxServerError() ? SERVER_ERROR_MESSAGE : CLIENT_ERROR_MESSAGE);
        attributes.put("path", path == null ? "" : path);
        attributes.put("fieldErrors", Map.of());
        return attributes;
    }

    // /errorを直接開いた場合など、ステータスがない(999)ときは応答のステータスと同じ500にする。
    private static HttpStatus statusOf(Map<String, Object> defaults) {
        HttpStatus status = defaults.get("status") instanceof Integer value ? HttpStatus.resolve(value) : null;
        return status == null ? HttpStatus.INTERNAL_SERVER_ERROR : status;
    }
}
