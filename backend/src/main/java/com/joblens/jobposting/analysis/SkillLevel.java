package com.joblens.jobposting.analysis;

/**
 * 技術の判定。必須・歓迎は求人票にその表示があるときだけ使う。
 */
public enum SkillLevel {
    /** 「必須」の表示がある。 */
    REQUIRED,
    /** 「歓迎」「尚可」「優遇」などの表示がある。 */
    PREFERRED,
    /** 応募資格に書かれているが、必須・歓迎の表示がない。 */
    IN_REQUIREMENTS,
    /** 必須と「不問」などの表示が矛盾している。 */
    UNDETERMINED,
    /** 仕事内容・開発環境・研修など、応募の要件の外に書かれている。「不問」などの否定もここに含める。 */
    MENTIONED
}
