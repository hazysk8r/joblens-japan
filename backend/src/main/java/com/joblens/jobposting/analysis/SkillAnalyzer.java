package com.joblens.jobposting.analysis;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 求人票の区間から、技術ごとに必須・歓迎を判定する。
 *
 * <p>判定を誤らないことを最優先にする。「必須」「歓迎」は求人票にその表示があるときだけ付け、
 * 表示がなければ、応募資格に書かれているか、それ以外に書かれているかだけを示す。
 * 表示どうしが矛盾する(必須と不問など)ときは判定できずとする。
 *
 * <p>手順:
 * <ol>
 *   <li>区間の見出しで既定の判定を決める(必須・歓迎・応募資格・それ以外)。</li>
 *   <li>「■必須」「＜歓迎＞」のような表示だけの行は、同じ区間の中で次の表示の行まで判定を切り替える。</li>
 *   <li>1行の中は「。」や技術を含む括弧などで文のまとまりに分け、表示の位置で技術ごとに判定する。
 *       「必須：」のような前の表示は後ろの技術に、「必須」「尚可」のような後ろの表示は前の技術に付く。
 *       否定(必須ではない・不問など)は表示より先に確かめる。</li>
 *   <li>研修の行は、表示があっても要件にしない(研修で学ぶ技術は応募の要件ではないため)。</li>
 * </ol>
 */
public final class SkillAnalyzer {

    private SkillAnalyzer() {
    }

    // ---- 技術名

    private record Skill(String name, Pattern pattern) {
    }

    /** 英数字の途中から始まる語(JavaScriptの中のScriptなど)にしない。 */
    private static final String BEFORE = "(?<![a-z0-9+#.])";
    /**
     * 英数字が続く語やドットでつないだ識別子(Java.utilなど)にしない。文末のピリオドは許す。
     * 数字が続く書き方のうち、「Java3年以上」「Docker6ヶ月」のような経験年数は技術名とみなし、
     * 「Java8」のような版の番号や別の語は技術名にしない。
     */
    private static final String AFTER =
            "(?![a-z+#]|\\.+[a-z0-9_+$#]|[0-9](?![0-9.]*(?:年|ヶ月|か月|カ月|ヵ月)))";

    private static Skill word(String name, String regex) {
        return new Skill(name, Pattern.compile(BEFORE + "(?:" + regex + ")" + AFTER));
    }

    private static Skill pattern(String name, String regex) {
        return new Skill(name, Pattern.compile(regex));
    }

    /**
     * 技術名の辞書。小文字にしてNFKCで正規化した文に当てる。
     * 一文字や英単語と同じ名前(C・Go)は、取り違えないよう決まった書き方だけを技術名とみなす。
     * 名前が重なるとき(React NativeとReactなど)は、長いほうだけを使う。
     */
    private static final List<Skill> SKILLS = List.of(
            word("Java", "java"),
            word("JavaScript", "javascript"),
            word("TypeScript", "typescript"),
            word("Python", "python"),
            word("Ruby on Rails", "ruby on rails|rails"),
            word("Ruby", "ruby"),
            word("PHP", "php"),
            word("Laravel", "laravel"),
            word("Kotlin", "kotlin"),
            word("Swift", "swift"),
            word("Scala", "scala"),
            word("Rust", "rust"),
            // 英単語のgoと取り違えないよう、Go言語・Golangだけにする。
            pattern("Go", BEFORE + "go言語|" + BEFORE + "golang" + AFTER),
            // C社・Cランクと取り違えないよう、C言語と、C++と並べた書き方(C/C++、CとC++など)だけにする。
            pattern("C", BEFORE + "c言語|" + BEFORE + "c(?=\\s*(?:/|と|、|,|・|および|及び)\\s*c\\+\\+)"),
            pattern("C++", BEFORE + "c\\+\\+(?![a-z0-9+#])"),
            pattern("C#", BEFORE + "c#(?![a-z0-9+#])"),
            pattern(".NET", "(?<![a-z0-9])\\.net" + AFTER),
            word("Spring Boot", "spring\\s?boot"),
            word("Spring", "spring\\s?framework"),
            word("React Native", "react\\s?native"),
            word("React", "react"),
            word("Vue.js", "vue(?:\\.js)?"),
            word("Next.js", "next\\.js"),
            word("Node.js", "node\\.js|nodejs"),
            word("Angular", "angular"),
            word("Flutter", "flutter"),
            word("Django", "django"),
            word("AWS", "aws"),
            word("GCP", "gcp|google cloud"),
            word("Azure", "azure"),
            word("Docker", "docker"),
            word("Kubernetes", "kubernetes|k8s"),
            word("Terraform", "terraform"),
            word("Linux", "linux"),
            word("MySQL", "mysql"),
            word("PostgreSQL", "postgresql|postgres"),
            word("Oracle", "oracle"),
            word("Redis", "redis"),
            word("MongoDB", "mongodb"),
            word("Git", "git(?!hub|lab)"));

    // ---- 区間と表示の行

    private static final Set<String> REQUIRED_LABELS =
            Set.of("必須", "必須条件", "必須要件", "必須スキル", "必須スキル・条件");
    private static final Set<String> PREFERRED_LABELS =
            Set.of("歓迎", "歓迎条件", "歓迎要件", "歓迎スキル", "歓迎スキル・条件", "歓迎する経験", "尚可");
    private static final Set<String> REQUIREMENT_LABELS =
            Set.of("応募資格", "対象となる方", "応募条件", "必要なスキル", "求めるスキル", "求める経験");

    /** 「■必須」「＜歓迎＞」「・必須条件:」のような、表示の前後に付く記号。 */
    private static final Pattern LABEL_DECORATION =
            Pattern.compile("^[\\s■◆●○◇□・*\\-<>\\[\\]〈〉《》【】「」]+|[\\s:<>\\[\\]〉》】」]+$");

    // ---- 1行の中の表示(小文字にしてNFKCで正規化した文に当てる)

    private enum MarkerType { NEGATION, PREFIX_REQUIRED, PREFIX_PREFERRED, SUFFIX_PREFERRED, SUFFIX_REQUIRED, CHOICE }

    /** 先に見つけた種類が優先する。否定(「必須ではない」「未経験歓迎」)は、中の「必須」「歓迎」より先に見つける。 */
    private static final Map<MarkerType, Pattern> MARKERS = new LinkedHashMap<>();

    static {
        MARKERS.put(MarkerType.NEGATION, Pattern.compile(
                "必須ではない|必須ではありません|必須ではございません|不問|問いません|問わない|不要"
                        + "|なくても(?:可|ok|構いません|大丈夫)|未経験(?:可|ok|歓迎|でも|の方)"));
        MARKERS.put(MarkerType.PREFIX_REQUIRED, Pattern.compile("必須(?:条件|要件|スキル|経験)?\\s*:"));
        MARKERS.put(MarkerType.PREFIX_PREFERRED, Pattern.compile("(?:歓迎|尚可)(?:条件|要件|スキル|経験)?\\s*:"));
        MARKERS.put(MarkerType.SUFFIX_PREFERRED, Pattern.compile(
                "あると(?:嬉しい|うれしい|尚可|望ましい)|歓迎|尚可|優遇|望ましい|あれば|加点|プラス"));
        MARKERS.put(MarkerType.SUFFIX_REQUIRED, Pattern.compile("必須"));
        MARKERS.put(MarkerType.CHOICE, Pattern.compile("いずれか|どれか|または|もしくは|又は"));
    }

    /** 文のまとまりの区切り。読点「、」と中黒「・」は技術の一覧に使われるため区切りにしない。 */
    private static final String CLAUSE_SEPARATORS = "。;/";

    // ---- 判定

    /** 1行の中の判定。NOT_REQUIREDは否定(必須ではない・不問など)で、結果ではその他の記載になる。 */
    private enum Found { REQUIRED, PREFERRED, IN_REQUIREMENTS, MENTIONED, NOT_REQUIRED }

    private record Occurrence(String name, Found level, List<String> alternatives, AnalysisEvidence evidence) {
    }

    private record Token(int start, int end, String skill, MarkerType marker) {
    }

    public static List<SkillAnalysis> analyze(List<PostingSection> sections) {
        List<Occurrence> occurrences = new ArrayList<>();
        for (PostingSection section : sections) {
            // 見出しの中の技術(【Java経験者歓迎】など)は見出しの表示で判定し、下の行には引き継がない。
            if (section.headingLine() != null) {
                analyzeLine(section.headingLine(), Found.MENTIONED, section.heading(), occurrences);
            }
            Found context = labelOf(section.heading());
            if (context == null) {
                context = Found.MENTIONED;
            }
            for (SourceLine line : section.lines()) {
                Found marker = labelOf(normalize(line.text()));
                if (marker != null) {
                    context = marker;
                    continue;
                }
                analyzeLine(line, context, section.heading(), occurrences);
            }
        }
        return summarize(occurrences);
    }

    /** 見出しや表示だけの行の判定。表示でなければnull。 */
    private static Found labelOf(String text) {
        if (text == null) {
            return null;
        }
        String label = LABEL_DECORATION.matcher(text).replaceAll("");
        if (REQUIRED_LABELS.contains(label)) {
            return Found.REQUIRED;
        }
        if (PREFERRED_LABELS.contains(label)) {
            return Found.PREFERRED;
        }
        if (REQUIREMENT_LABELS.contains(label)) {
            return Found.IN_REQUIREMENTS;
        }
        return null;
    }

    private static String normalize(String text) {
        return PostingSectionSplitter.normalize(text).toLowerCase(Locale.ROOT);
    }

    private static void analyzeLine(SourceLine line, Found context, String section, List<Occurrence> out) {
        String text = normalize(line.text());
        List<Token> skills = findSkills(text);
        if (skills.isEmpty()) {
            return;
        }
        AnalysisEvidence evidence = AnalysisEvidence.of(section, line);

        // 研修で学ぶ技術は応募の要件ではないため、表示があっても要件にしない。
        if (text.contains("研修")) {
            for (Token skill : skills) {
                out.add(new Occurrence(skill.skill(), Found.MENTIONED, List.of(), evidence));
            }
            return;
        }

        List<Token> tokens = new ArrayList<>(skills);
        tokens.addAll(findMarkers(text, skills));
        tokens.sort(Comparator.comparingInt(Token::start));

        Found forward = context;
        for (int[] clause : clauses(text, skills)) {
            List<Token> pending = new ArrayList<>();
            List<Token> clauseSkills = new ArrayList<>();
            Map<Token, Found> assigned = new LinkedHashMap<>();
            boolean choice = false;
            for (Token token : tokens) {
                if (token.start() < clause[0] || token.start() >= clause[1]) {
                    continue;
                }
                if (token.skill() != null) {
                    pending.add(token);
                    clauseSkills.add(token);
                    continue;
                }
                switch (token.marker()) {
                    case PREFIX_REQUIRED -> {
                        assign(pending, forward, assigned);
                        forward = Found.REQUIRED;
                    }
                    case PREFIX_PREFERRED -> {
                        assign(pending, forward, assigned);
                        forward = Found.PREFERRED;
                    }
                    case SUFFIX_REQUIRED -> assign(pending, Found.REQUIRED, assigned);
                    case SUFFIX_PREFERRED -> assign(pending, Found.PREFERRED, assigned);
                    case NEGATION -> assign(pending, Found.NOT_REQUIRED, assigned);
                    case CHOICE -> choice = true;
                }
            }
            assign(pending, forward, assigned);

            // 「JavaまたはPython」「いずれか」のまとまりは、ほかの技術と一緒に示す。全部が必要だと受け取られないため。
            List<String> names = clauseSkills.stream().map(Token::skill).distinct().toList();
            boolean grouped = choice && names.size() > 1;
            for (Map.Entry<Token, Found> entry : assigned.entrySet()) {
                String name = entry.getKey().skill();
                List<String> alternatives = grouped
                        ? names.stream().filter(other -> !other.equals(name)).toList()
                        : List.of();
                out.add(new Occurrence(name, entry.getValue(), alternatives, evidence));
            }
        }
    }

    private static void assign(List<Token> pending, Found level, Map<Token, Found> assigned) {
        for (Token token : pending) {
            assigned.put(token, level);
        }
        pending.clear();
    }

    /** 技術名を探す。重なるときは長いほうを使う(React NativeとReactなど)。 */
    private static List<Token> findSkills(String text) {
        List<Token> found = new ArrayList<>();
        for (Skill skill : SKILLS) {
            Matcher matcher = skill.pattern().matcher(text);
            while (matcher.find()) {
                found.add(new Token(matcher.start(), matcher.end(), skill.name(), null));
            }
        }
        found.sort(Comparator.comparingInt(Token::start)
                .thenComparing(Comparator.comparingInt((Token token) -> token.end() - token.start()).reversed()));
        List<Token> kept = new ArrayList<>();
        int keptEnd = -1;
        for (Token token : found) {
            if (token.start() >= keptEnd) {
                kept.add(token);
                keptEnd = token.end();
            }
        }
        return kept;
    }

    /** 表示を探す。技術名や、先に見つけた表示と重なるものは使わない。 */
    private static List<Token> findMarkers(String text, List<Token> skills) {
        List<Token> taken = new ArrayList<>(skills);
        List<Token> markers = new ArrayList<>();
        for (Map.Entry<MarkerType, Pattern> entry : MARKERS.entrySet()) {
            Matcher matcher = entry.getValue().matcher(text);
            while (matcher.find()) {
                int start = matcher.start();
                int end = matcher.end();
                boolean overlaps = taken.stream().anyMatch(token -> start < token.end() && token.start() < end);
                if (!overlaps) {
                    Token marker = new Token(start, end, null, entry.getKey());
                    taken.add(marker);
                    markers.add(marker);
                }
            }
        }
        return markers;
    }

    /**
     * 文のまとまり([開始, 終了))に分ける。「。」「;」「/」と、技術を含む括弧で区切る。
     * 「(必須)」「(3年以上)」のように技術を含まない括弧は、前の技術への補足なので区切らない。
     */
    private static List<int[]> clauses(String text, List<Token> skills) {
        Set<Integer> boundaries = new TreeSet<>();
        for (int i = 0; i < text.length(); i++) {
            if (CLAUSE_SEPARATORS.indexOf(text.charAt(i)) >= 0 && !insideSkill(i, skills)) {
                boundaries.add(i);
            }
            if (text.charAt(i) == '(') {
                int close = text.indexOf(')', i);
                int end = close < 0 ? text.length() : close;
                int open = i;
                boolean hasSkill = skills.stream().anyMatch(skill -> skill.start() > open && skill.start() < end);
                if (hasSkill) {
                    boundaries.add(i);
                    if (close >= 0) {
                        boundaries.add(close);
                    }
                }
            }
        }
        List<int[]> clauses = new ArrayList<>();
        int start = 0;
        for (int boundary : boundaries) {
            clauses.add(new int[]{start, boundary});
            start = boundary + 1;
        }
        clauses.add(new int[]{start, text.length()});
        return clauses;
    }

    private static boolean insideSkill(int position, List<Token> skills) {
        return skills.stream().anyMatch(skill -> position >= skill.start() && position < skill.end());
    }

    // ---- 技術ごとのまとめ

    private static final List<SkillLevel> ORDER = List.of(
            SkillLevel.REQUIRED, SkillLevel.PREFERRED, SkillLevel.IN_REQUIREMENTS,
            SkillLevel.UNDETERMINED, SkillLevel.MENTIONED);

    /**
     * 同じ技術が複数の場所にあるときの判定。
     * 必須と否定が両方あれば判定できず。それ以外は 必須(単独) > 必須(いずれか) > 応募資格 > 歓迎 > その他。
     * 応募資格を歓迎より先にするのは、応募資格(表示なし)に書かれた技術を「歓迎」と示すと、
     * 必要な技術を不要と受け取らせてしまうため(「応募資格: Java経験」「歓迎: Java5年以上」など)。
     * そのときは応募資格の行と歓迎の行を両方根拠にし、利用者が確かめられるようにする。
     */
    private static List<SkillAnalysis> summarize(List<Occurrence> occurrences) {
        Map<String, List<Occurrence>> bySkill = new LinkedHashMap<>();
        for (Occurrence occurrence : occurrences) {
            bySkill.computeIfAbsent(occurrence.name(), name -> new ArrayList<>()).add(occurrence);
        }

        List<SkillAnalysis> result = new ArrayList<>();
        for (Map.Entry<String, List<Occurrence>> entry : bySkill.entrySet()) {
            List<Occurrence> found = entry.getValue();
            Occurrence required = first(found, Found.REQUIRED, false);
            Occurrence requiredChoice = first(found, Found.REQUIRED, true);
            Occurrence notRequired = first(found, Found.NOT_REQUIRED, null);

            SkillAnalysis analysis;
            Occurrence anyRequired = required != null ? required : requiredChoice;
            if (anyRequired != null && notRequired != null) {
                analysis = new SkillAnalysis(entry.getKey(), SkillLevel.UNDETERMINED, List.of(),
                        List.of(anyRequired.evidence(), notRequired.evidence()));
            } else if (anyRequired != null) {
                analysis = of(anyRequired, SkillLevel.REQUIRED);
            } else if (first(found, Found.IN_REQUIREMENTS, null) != null) {
                Occurrence inRequirements = first(found, Found.IN_REQUIREMENTS, null);
                Occurrence preferred = first(found, Found.PREFERRED, null);
                analysis = new SkillAnalysis(entry.getKey(), SkillLevel.IN_REQUIREMENTS, inRequirements.alternatives(),
                        preferred == null
                                ? List.of(inRequirements.evidence())
                                : List.of(inRequirements.evidence(), preferred.evidence()));
            } else if (first(found, Found.PREFERRED, null) != null) {
                analysis = of(first(found, Found.PREFERRED, null), SkillLevel.PREFERRED);
            } else {
                analysis = new SkillAnalysis(entry.getKey(), SkillLevel.MENTIONED, List.of(),
                        List.of(found.get(0).evidence()));
            }
            result.add(analysis);
        }

        // 判定の順に並べ、同じ判定の中では求人票に現れた順にする(安定ソート)。
        result.sort(Comparator.comparingInt(analysis -> ORDER.indexOf(analysis.level())));
        return List.copyOf(result);
    }

    private static SkillAnalysis of(Occurrence occurrence, SkillLevel level) {
        return new SkillAnalysis(occurrence.name(), level, occurrence.alternatives(), List.of(occurrence.evidence()));
    }

    /** choiceがtrueなら「いずれか」のもの、falseなら単独のもの、nullならどちらでも。 */
    private static Occurrence first(List<Occurrence> found, Found level, Boolean choice) {
        return found.stream()
                .filter(occurrence -> occurrence.level() == level)
                .filter(occurrence -> choice == null || occurrence.alternatives().isEmpty() != choice)
                .findFirst()
                .orElse(null);
    }
}
