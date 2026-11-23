package com.martinvolejnik.companykeeping;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class FounderGuide {
    private static final Set<String> STEPS = Set.of(
            "forming-model", "forming-registration", "forming-first-sale",
            "operating-money", "operating-handover", "operating-review");
    private static final Set<String> EDITABLE = Set.of("answer", "completed", "route", "softwareModel");
    private static final Set<String> ROUTES = Set.of("company", "individual", "undecided");
    private static final Set<String> SOFTWARE_MODELS = Set.of("product", "client", "exploring");
    private final JdbcClient jdbc;

    FounderGuide(JdbcClient jdbc) { this.jdbc = jdbc; }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record Step(String answer, boolean completed, String route, String softwareModel) {}

    private static Step readStep(ResultSet rs) throws SQLException {
        return new Step(rs.getString("answer"), rs.getBoolean("completed"), rs.getString("route"), rs.getString("software_model"));
    }

    Map<String,Step> list(UUID workspace) {
        return jdbc.sql("SELECT step_key, answer, completed, route, software_model FROM guide_steps WHERE workspace_id=?")
                .param(workspace).query(rs -> {
                    var guide = new HashMap<String,Step>();
                    while (rs.next()) guide.put(rs.getString("step_key"), readStep(rs));
                    return guide;
                });
    }

    @Transactional
    public Step save(UUID owner, String key, Map<String,Object> changes) {
        if (!STEPS.contains(key)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Guide step not found.");
        if (changes.isEmpty() || !EDITABLE.containsAll(changes.keySet())) {
            throw Fields.invalid("Send an answer, a choice, or a completion status for this step.");
        }
        if (changes.containsKey("answer") && !(changes.get("answer") instanceof String)) {
            throw Fields.invalid("Enter text for your answer.");
        }
        if (changes.containsKey("completed") && !(changes.get("completed") instanceof Boolean)) {
            throw Fields.invalid("Choose a valid completion status.");
        }
        if (changes.containsKey("route")) {
            if (!key.equals("forming-model")) throw Fields.invalid("A business route belongs on the first formation step.");
            Object route = changes.get("route");
            if (route != null && !(route instanceof String value && ROUTES.contains(value))) {
                throw Fields.invalid("Choose a valid business route.");
            }
        }
        if (changes.containsKey("softwareModel")) {
            if (!key.equals("forming-first-sale")) throw Fields.invalid("A software business model belongs on the first-sale step.");
            Object model = changes.get("softwareModel");
            if (model != null && !(model instanceof String value && SOFTWARE_MODELS.contains(value))) {
                throw Fields.invalid("Choose a valid software business model.");
            }
        }
        // Profile edits take this same lock. Country changes, route changes and completions
        // must agree on which saved answers need another review.
        UUID workspace = jdbc.sql("SELECT id FROM workspaces WHERE owner_id=? FOR UPDATE").param(owner)
                .query(UUID.class).optional()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Create your company workspace first."));
        var previous = jdbc.sql("SELECT answer, completed, route, software_model FROM guide_steps WHERE workspace_id=? AND step_key=?")
                .params(workspace, key).query((rs, n) -> readStep(rs)).optional().orElse(new Step("", false, null, null));
        String answer = changes.containsKey("answer") ? Fields.text(changes, "answer", 3000, false) : previous.answer();
        boolean completed = (boolean) changes.getOrDefault("completed", previous.completed());
        if (completed && answer.codePoints().allMatch(c -> Character.isWhitespace(c) || Character.isSpaceChar(c))) {
            throw Fields.invalid("Write an answer before completing this step.");
        }
        String route = (String) changes.getOrDefault("route", previous.route());
        String model = (String) changes.getOrDefault("softwareModel", previous.softwareModel());
        jdbc.sql("""
                INSERT INTO guide_steps (workspace_id,step_key,answer,completed,route,software_model) VALUES (?,?,?,?,?,?)
                ON CONFLICT (workspace_id,step_key) DO UPDATE SET
                answer=EXCLUDED.answer, completed=EXCLUDED.completed, route=EXCLUDED.route, software_model=EXCLUDED.software_model
                """).params(workspace, key, answer, completed, route, model).update();
        if (key.equals("forming-model") && !Objects.equals(route, previous.route())) {
            reopen(workspace, List.of("forming-registration"));
        }
        return new Step(answer, completed, route, model);
    }

    void reopen(UUID workspace, List<String> keys) {
        jdbc.sql("UPDATE guide_steps SET completed=false WHERE workspace_id=:workspace AND completed AND step_key IN (:keys)")
                .param("workspace", workspace).param("keys", keys).update();
    }
}
