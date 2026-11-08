package com.joblens.jobposting.analysis;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.function.Predicate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 求人票の区間から固定残業代(みなし残業・定額残業)の有無を判定する。
 *
 * <p>判定の順序:
 * <ol>
 *   <li>ありの記載となしの明記が両方ある → 矛盾として判定できず</li>
 *   <li>ありの記載がある → あり</li>
 *   <li>なしの明記、または残業代の全額支給の明記がある → なし</li>
 *   <li>残業代に触れているが上のどれでもない → 判定できず</li>
 *   <li>どれもない → 記載なし</li>
 * </ol>
 * 「固定残業代は全額支給」のように、ありの記載と全額支給が並ぶことがあるため、全額支給はありより弱い扱いにする。
 */
public final class FixedOvertimeAnalyzer {

    private static final String KEYWORD = "(?:固定残業|みなし残業|定額残業|固定時間外)";

    /**
     * 「固定残業代なし」「固定残業代の支給はありません」のような否定。
     * 「みなし」の「なし」と区別するため、キーワードの後ろだけを見る。
     * 間に挟める語は10文字までとし、文や読点の区切り(「。」「、」)、括弧、「含」は越えない。
     * 「固定残業代を含むため住宅手当はありません」「みなし残業手当あり（無理な残業なし）」のように、
     * 別の物の否定を拾わないため。
     */
    private static final Pattern NEGATED_KEYWORD = Pattern.compile(
            KEYWORD + "(?:代|手当|時間)?(?:制度|制)?[^。、,含()]{0,10}?(?:は|では|:)?[、,]?\\s*"
                    + "(?:なし|無し|ナシ|ありません|ございません|していません|しておりません|含まない|含みません"
                    + "|無(?=$|[\\s()、。,/]))");
    private static final Pattern POSITIVE_KEYWORD = Pattern.compile(KEYWORD);
    private static final Pattern OVERTIME_PAY = Pattern.compile("(?:残業|時間外(?:労働|勤務)?)(?:代|手当)");
    /** 「時間外手当30時間分」のように、「固定」の語がなくても時間数の「分」が付いた残業代は固定残業代。 */
    private static final Pattern HOURS_PORTION = Pattern.compile("(?<![\\d.,])\\d{1,3}\\s*(?:時間|h)\\s*(?:相当)?分",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern FULL_PAY = Pattern.compile("全額(?:支給|支払)|1分単位|100%支給");
    /** 「超過分は別途支給」「超過分は全額支給」のように、固定残業時間を超えた分の支給の明記。 */
    private static final Pattern EXCESS_PAY = Pattern.compile(
            "(?:超過|超え)[^。]{0,30}?(?:別途|追加|全額)[^。]{0,20}?(?:支給|支払)");
    private static final Pattern HOURS = Pattern.compile("(?<![\\d.,])(\\d{1,3})\\s*(?:時間|h)(?![a-z])",
            Pattern.CASE_INSENSITIVE);
    /** 時間数の直前にこれらの語があれば、固定残業ではなく所定労働時間や1日の勤務時間などの数字とみなす。 */
    private static final Pattern NON_OVERTIME_HOURS_CONTEXT = Pattern.compile("所定|実働|平均|日\\s*$");
    private static final int HOURS_CONTEXT_LENGTH = 8;

    private static final int MAX_EVIDENCE = 3;
    private static final int MAX_EVIDENCE_LENGTH = 200;

    private FixedOvertimeAnalyzer() {
    }

    public static FixedOvertimeAnalysis analyze(List<PostingSection> sections) {
        List<Line> lines = new ArrayList<>();
        for (PostingSection section : sections) {
            for (String text : section.lines()) {
                lines.add(Line.of(section.heading(), text));
            }
        }

        boolean present = lines.stream().anyMatch(Line::positive);
        boolean negated = lines.stream().anyMatch(Line::negated);
        boolean fullPay = lines.stream().anyMatch(Line::fullPay);
        boolean mentioned = lines.stream().anyMatch(Line::mentionsOvertimePay);

        if (present && negated) {
            return result(FixedOvertimeStatus.UNDETERMINED, null, null,
                    evidence(lines, line -> line.positive() || line.negated()));
        }
        if (present) {
            return result(FixedOvertimeStatus.PRESENT, hours(lines),
                    lines.stream().anyMatch(Line::excessPay),
                    evidence(lines, line -> line.positive() || line.excessPay()));
        }
        if (negated || fullPay) {
            return result(FixedOvertimeStatus.ABSENT, null, null,
                    evidence(lines, line -> line.negated() || line.fullPay()));
        }
        if (mentioned) {
            return result(FixedOvertimeStatus.UNDETERMINED, null, null,
                    evidence(lines, Line::mentionsOvertimePay));
        }
        return result(FixedOvertimeStatus.NOT_MENTIONED, null, null, List.of());
    }

    private static FixedOvertimeAnalysis result(
            FixedOvertimeStatus status, Integer hours, Boolean excessPayStated, List<AnalysisEvidence> evidence) {
        return new FixedOvertimeAnalysis(status, hours, excessPayStated, evidence);
    }

    /** ありの記載がある行の時間数が一つに特定できるときだけ返す。 */
    private static Integer hours(List<Line> lines) {
        Set<Integer> values = new LinkedHashSet<>();
        for (Line line : lines) {
            if (!line.positive()) {
                continue;
            }
            Matcher matcher = HOURS.matcher(line.normalized());
            while (matcher.find()) {
                int contextStart = Math.max(0, matcher.start() - HOURS_CONTEXT_LENGTH);
                String context = line.normalized().substring(contextStart, matcher.start());
                if (!NON_OVERTIME_HOURS_CONTEXT.matcher(context).find()) {
                    values.add(Integer.parseInt(matcher.group(1)));
                }
            }
        }
        return values.size() == 1 ? values.iterator().next() : null;
    }

    private static List<AnalysisEvidence> evidence(List<Line> lines, Predicate<Line> relevant) {
        Set<AnalysisEvidence> evidence = new LinkedHashSet<>();
        for (Line line : lines) {
            if (evidence.size() >= MAX_EVIDENCE) {
                break;
            }
            if (relevant.test(line)) {
                evidence.add(new AnalysisEvidence(line.section(), truncate(line.original())));
            }
        }
        return List.copyOf(evidence);
    }

    private static String truncate(String text) {
        if (text.length() <= MAX_EVIDENCE_LENGTH) {
            return text;
        }
        return text.substring(0, MAX_EVIDENCE_LENGTH) + "…";
    }

    /** 1行分の判定材料。 */
    private record Line(
            String section,
            String original,
            String normalized,
            boolean positive,
            boolean negated,
            boolean fullPay,
            boolean mentionsOvertimePay,
            boolean excessPay) {

        static Line of(String section, String original) {
            String normalized = PostingSectionSplitter.normalize(original);
            boolean negated = NEGATED_KEYWORD.matcher(normalized).find();
            boolean mentionsOvertimePay = OVERTIME_PAY.matcher(normalized).find();
            // 否定された箇所を取り除いても残るキーワードだけを「あり」の記載とみなす。
            boolean positive = POSITIVE_KEYWORD.matcher(
                    NEGATED_KEYWORD.matcher(normalized).replaceAll("")).find()
                    || (mentionsOvertimePay && HOURS_PORTION.matcher(normalized).find());
            boolean fullPay = mentionsOvertimePay && FULL_PAY.matcher(normalized).find();
            boolean excessPay = EXCESS_PAY.matcher(normalized).find();
            return new Line(section, original, normalized, positive, negated, fullPay, mentionsOvertimePay,
                    excessPay);
        }
    }
}
