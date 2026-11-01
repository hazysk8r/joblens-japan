package com.joblens.jobposting.validation;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 画面でリンクとして開くURLが、http・httpsのWebページを指すことを検証する。
 *
 * 宛先の安全性は確かめない。内部ネットワークのアドレスも通るため、SSRFの対策にはならない。
 * サーバーからこのURLへ要求を送る機能を作るときは、別に対策が必要になる。
 */
@Target(ElementType.FIELD)
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = HttpUrlValidator.class)
public @interface ValidHttpUrl {

    String message() default "http://またはhttps://で始まるURLを、空白を含めずに入力してください。";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
