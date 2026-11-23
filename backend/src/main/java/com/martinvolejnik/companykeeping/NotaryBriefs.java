package com.martinvolejnik.companykeeping;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

@Service
class NotaryBriefs {
    record Founder(String name, String contributionCzk) {}
    record Draft(String companyName, String registeredOffice, String activity, List<Founder> founders,
                 List<String> directors, String signing, String registeredCapitalCzk,
                 String contributionAdministrator, String paymentSchedule, String otherFunding,
                 String notes, String questions) {}

    private static final Set<String> REQUIRED = Set.of("companyName", "registeredOffice", "activity",
            "founders", "directors", "signing", "registeredCapitalCzk", "otherFunding", "notes", "questions");
    private static final Set<String> OPTIONAL = Set.of("contributionAdministrator", "paymentSchedule");
    private static final Set<String> FOUNDER_FIELDS = Set.of("name", "contributionCzk");
    private static final Pattern AMOUNT = Pattern.compile("[0-9]{1,15}([.,][0-9]{1,2})?");
    private final JdbcClient jdbc;
    private final ObjectMapper mapper;

    NotaryBriefs(JdbcClient jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    Draft find(UUID workspace) {
        String json = jdbc.sql("SELECT draft::text FROM notary_briefs WHERE workspace_id=?")
                .param(workspace).query(String.class).optional().orElse(null);
        try {
            return json == null ? null : mapper.readValue(json, Draft.class);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Could not read the saved notary brief.", e);
        }
    }

    Draft replace(UUID workspace, Map<String,Object> input) {
        if (!input.keySet().containsAll(REQUIRED) ||
                input.keySet().stream().anyMatch(key -> !REQUIRED.contains(key) && !OPTIONAL.contains(key))) {
            throw Fields.invalid("Send the full notary brief with its company, people, funding and notes fields.");
        }
        var founders = people(input.get("founders"), "founders").stream().map(NotaryBriefs::founder).toList();
        var directors = people(input.get("directors"), "directors").stream()
                .map(value -> text(value, "director name", 200)).toList();
        Draft draft = new Draft(text(input.get("companyName"), "company name", 200),
                text(input.get("registeredOffice"), "registered office", 500),
                text(input.get("activity"), "business activity", 1500), founders, directors,
                text(input.get("signing"), "signing arrangements", 1500),
                amount(input.get("registeredCapitalCzk"), "registered capital"),
                text(input.getOrDefault("contributionAdministrator", ""), "contribution administrator", 200),
                text(input.getOrDefault("paymentSchedule", ""), "contribution payment schedule", 1500),
                text(input.get("otherFunding"), "other funding", 3000),
                text(input.get("notes"), "notes", 3000), text(input.get("questions"), "questions", 3000));
        try {
            jdbc.sql("""
                    INSERT INTO notary_briefs (workspace_id, draft) VALUES (?, CAST(? AS JSONB))
                    ON CONFLICT (workspace_id) DO UPDATE SET draft=EXCLUDED.draft
                    """).params(workspace, mapper.writeValueAsString(draft)).update();
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Could not store the notary brief.", e);
        }
        return draft;
    }

    private static List<?> people(Object value, String label) {
        if (!(value instanceof List<?> people) || people.size() > 50) {
            throw Fields.invalid("Use a list with up to 50 " + label + ".");
        }
        return people;
    }

    private static Founder founder(Object value) {
        if (!(value instanceof Map<?,?> fields) || !fields.keySet().equals(FOUNDER_FIELDS)) {
            throw Fields.invalid("Include a name and contribution field for each founder.");
        }
        return new Founder(text(fields.get("name"), "founder name", 200),
                amount(fields.get("contributionCzk"), "founder contribution"));
    }

    private static String text(Object value, String label, int limit) {
        if (!(value instanceof String s) || s.indexOf(0) >= 0 || s.length() > limit) {
            throw Fields.invalid("Enter text of up to " + limit + " characters for " + label + ".");
        }
        return s.strip();
    }

    private static String amount(Object value, String label) {
        String amount = text(value, label, 18);
        if (!amount.isEmpty() && !AMOUNT.matcher(amount).matches()) {
            throw Fields.invalid("Enter a nonnegative CZK amount with up to 15 digits and two decimal places for " + label + ".");
        }
        return amount.replace(',', '.');
    }
}
