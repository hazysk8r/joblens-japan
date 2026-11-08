package com.joblens.jobposting.analysis;

/** 固定残業代の判定結果。「記載なし」と「判定できず」を「なし」と混同しないよう分けて扱う。 */
public enum FixedOvertimeStatus {
    /** 固定残業代(みなし残業・定額残業)の記載がある。 */
    PRESENT,
    /** 固定残業代がないこと、または残業代を全額支給することが明記されている。 */
    ABSENT,
    /** 固定残業代にも残業代の支払い方にも触れていない。 */
    NOT_MENTIONED,
    /** 残業代に触れているが解釈できない、または記載が矛盾している。 */
    UNDETERMINED
}
