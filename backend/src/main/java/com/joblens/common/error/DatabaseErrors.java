package com.joblens.common.error;

import java.sql.SQLException;

import org.hibernate.exception.ConstraintViolationException;

/**
 * Spring・Hibernateが包んだ例外から、DBのエラー情報を取り出す。
 * ドライバーのメッセージの文言ではなく、標準のSQLStateと制約名で判定するために使う。
 */
public final class DatabaseErrors {

    // 例外の原因が循環していても止まるようにする。
    private static final int MAX_CAUSE_DEPTH = 20;

    private DatabaseErrors() {
    }

    public static String sqlStateOf(Throwable exception) {
        Throwable current = exception;
        for (int depth = 0; current != null && depth < MAX_CAUSE_DEPTH; depth++) {
            if (current instanceof SQLException sqlException && sqlException.getSQLState() != null) {
                return sqlException.getSQLState();
            }
            current = current.getCause();
        }
        return null;
    }

    public static boolean violatesConstraint(Throwable exception, String constraintName) {
        Throwable current = exception;
        for (int depth = 0; current != null && depth < MAX_CAUSE_DEPTH; depth++) {
            if (current instanceof ConstraintViolationException violation) {
                return constraintName.equals(violation.getConstraintName());
            }
            current = current.getCause();
        }
        return false;
    }
}
