package com.joblens.jobposting.analysis;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 求人票の原文を見出しごとの区間に分ける。
 *
 * <p>NFKCで文字の数が変わることがあるため、原文全体の位置ではなく行単位で扱う。
 * 判定には正規化した文字列を使い、区間には元の行を保持する。
 */
public final class PostingSectionSplitter {

    /** 行全体がこの語と一致するときだけ見出しとみなす(NFKC正規化後、末尾のコロンを除いた形)。 */
    private static final Set<String> HEADINGS = Set.of(
            "給与", "給与・待遇", "給与詳細", "想定年収", "入社時の想定年収", "年収", "賞与", "昇給",
            "諸手当", "手当", "待遇", "待遇・福利厚生", "福利厚生", "各種制度",
            "仕事内容", "具体的な仕事内容", "職務内容", "職務内容詳細", "業務内容",
            "応募資格", "対象となる方", "必須", "必須条件", "必須要件", "必須スキル", "必須スキル・条件",
            "歓迎", "歓迎条件", "歓迎要件", "歓迎スキル", "歓迎スキル・条件", "求める人物像",
            "勤務地", "勤務時間", "平均残業時間", "残業", "雇用形態", "契約形態", "試用期間",
            "休日・休暇", "休日休暇", "休暇", "年間休日", "選考プロセス", "選考の流れ",
            "会社概要", "事業概要", "その他");

    /**
     * 求人サイトのページをまとめてコピーしたときに、本文の後ろに付く部分の目印。
     * この行から後ろは他社の求人や記事の一覧なので分析に使わない。
     * サイトの文言が変わったら、回帰テストと一緒にここへ追加する。
     */
    private static final Set<String> SITE_APPENDIX_MARKERS = Set.of(
            // doda
            "この企業が募集中のほかの求人",
            "閲覧・気になる・応募した求人に近い求人のうちまだ見ていない求人",
            "この求人に似た求人を探す",
            // Indeed
            "企業情報と給与情報",
            "類似の職種カテゴリー",
            "近くの類似の求人",
            "キャリアガイドの記事");

    private static final Pattern BRACKET_HEADING = Pattern.compile("^【([^】]{1,30})】(.*)$");
    private static final Pattern TRAILING_COLON = Pattern.compile("\\s*:$");
    private static final Pattern LINE_BREAK = Pattern.compile("\\R");

    private PostingSectionSplitter() {
    }

    public static List<PostingSection> split(String originalText) {
        List<PostingSection> sections = new ArrayList<>();
        if (originalText == null) {
            return sections;
        }

        String heading = null;
        List<String> lines = new ArrayList<>();
        boolean started = false;

        for (String rawLine : LINE_BREAK.split(originalText)) {
            String line = rawLine.strip();
            if (line.isEmpty()) {
                continue;
            }
            String normalized = normalize(line);
            if (SITE_APPENDIX_MARKERS.contains(normalized)) {
                break;
            }

            String newHeading = null;
            String rest = "";
            Matcher bracket = BRACKET_HEADING.matcher(line);
            if (bracket.matches()) {
                newHeading = normalize(bracket.group(1));
                rest = bracket.group(2).strip();
            } else {
                String candidate = TRAILING_COLON.matcher(normalized).replaceFirst("");
                if (HEADINGS.contains(candidate)) {
                    newHeading = candidate;
                }
            }

            if (newHeading != null) {
                if (started) {
                    sections.add(new PostingSection(heading, lines));
                }
                heading = newHeading;
                lines = new ArrayList<>();
                started = true;
                if (!rest.isEmpty()) {
                    lines.add(rest);
                }
                continue;
            }

            lines.add(line);
            started = true;
        }

        if (started) {
            sections.add(new PostingSection(heading, lines));
        }
        return sections;
    }

    /** 全角英数字・全角記号・全角空白を半角にそろえる。 */
    static String normalize(String text) {
        return Normalizer.normalize(text, Normalizer.Form.NFKC).strip();
    }
}
