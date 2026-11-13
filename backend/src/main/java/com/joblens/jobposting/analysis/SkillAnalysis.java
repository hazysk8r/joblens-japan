package com.joblens.jobposting.analysis;

import java.util.List;

/**
 * 技術ごとの必須・歓迎の判定。
 *
 * @param name         技術名(辞書の表記)。
 * @param level        判定。
 * @param alternatives 「JavaまたはPython」「いずれか」のように一緒に書かれた、ほかの技術。全部が必要と受け取られないよう示す。
 * @param evidence     判定の根拠となった行。判定できずのときは、必須の行と否定の行の2つ。
 */
public record SkillAnalysis(String name, SkillLevel level, List<String> alternatives, List<AnalysisEvidence> evidence) {

    public SkillAnalysis {
        alternatives = List.copyOf(alternatives);
        evidence = List.copyOf(evidence);
    }
}
