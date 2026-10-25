package com.joblens.auth.validation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

/**
 * 文字列をUTF-8に変換したときのバイト数が上限以下かを検証する。
 *
 * @Sizeは文字数で数えるため、ハングルや日本語(1文字3バイト)を含むと
 * 文字数の上限内でもバイト数の上限を超えることがある。
 */
@Target(ElementType.FIELD)
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = MaxUtf8BytesValidator.class)
public @interface MaxUtf8Bytes {

    int value();

    String message() default "입력값이 너무 깁니다.";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
