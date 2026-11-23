package com.martinvolejnik.companykeeping;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class Items {
    private final JdbcClient jdbc;
    Items(JdbcClient jdbc) { this.jdbc = jdbc; }

    record Stored(Map<String,Object> values, Integer anchorDay) {}
    record Completion(Map<String,Object> item, Map<String,Object> nextItem) {}

    private static Stored read(ResultSet rs, int n) throws SQLException {
        var row = new HashMap<String,Object>();
        row.put("id", rs.getObject("id", UUID.class));
        row.put("title", rs.getString("title"));
        row.put("why", rs.getString("why"));
        row.put("nextAction", rs.getString("next_action"));
        row.put("status", rs.getString("status"));
        row.put("waitingFor", rs.getString("waiting_for"));
        row.put("dueDate", rs.getString("due_date"));
        row.put("followUpDate", rs.getString("follow_up_date"));
        row.put("evidenceUrl", rs.getString("evidence_url"));
        row.put("sourceUrl", rs.getString("source_url"));
        row.put("recurrence", rs.getString("recurrence"));
        row.put("seriesId", rs.getObject("series_id", UUID.class));
        row.put("period", rs.getString("period"));
        var completed = rs.getObject("completed_at", OffsetDateTime.class);
        row.put("completedAt", completed == null ? null : completed.toInstant().toString());
        return new Stored(row, rs.getObject("anchor_day", Integer.class));
    }

    List<Map<String,Object>> list(UUID workspace) {
        return jdbc.sql("SELECT * FROM items WHERE workspace_id=? ORDER BY filing_order")
                .param(workspace).query(Items::read).list().stream().map(Stored::values).toList();
    }

    Map<String,Object> get(UUID workspace, UUID id) { return find(workspace, id, false).values(); }

    private Stored find(UUID workspace, UUID id, boolean lock) {
        return jdbc.sql("SELECT * FROM items WHERE workspace_id=? AND id=?" + (lock ? " FOR UPDATE" : ""))
                .params(workspace, id).query(Items::read).optional()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Item not found."));
    }

    private Map<String,Object> draft(Map<String,Object> changes, Stored existing) {
        var input = existing == null ? new HashMap<String,Object>() : new HashMap<>(existing.values());
        input.putAll(changes);
        var values = new HashMap<String,Object>();
        String status = Fields.choice(input, "status", "ready", "ready", "waiting");
        String recurrence = Fields.choice(input, "recurrence", "none", "none", "monthly");
        boolean waiting = status.equals("waiting");
        LocalDate due = Fields.date(input, "dueDate");
        values.put("title", Fields.text(input, "title", 200, true));
        values.put("why", Fields.text(input, "why", 5000, false));
        values.put("nextAction", Fields.text(input, "nextAction", 5000, false));
        values.put("waitingFor", waiting ? Fields.text(input, "waitingFor", 500, true) : "");
        values.put("status", status);
        values.put("recurrence", recurrence);
        values.put("dueDate", due);
        values.put("followUpDate", Fields.date(input, "followUpDate"));
        values.put("evidenceUrl", Fields.link(input, "evidenceUrl"));
        values.put("sourceUrl", Fields.link(input, "sourceUrl"));
        UUID series = null;
        Integer anchor = null;
        String period = null;
        if (recurrence.equals("monthly")) {
            Object previousSeries = existing == null ? null : existing.values().get("seriesId");
            series = previousSeries == null ? UUID.randomUUID() : (UUID)previousSeries;
            if (due != null) {
                anchor = existing != null && existing.anchorDay() != null && due.toString().equals(existing.values().get("dueDate"))
                        ? existing.anchorDay() : due.getDayOfMonth();
            }
            period = Fields.text(input,"period",7,false);
            if (period.isEmpty()) period = YearMonth.from(due == null ? LocalDate.now() : due).toString();
            try {
                if (YearMonth.parse(period).getYear() < 1) throw Fields.invalid("Enter a valid record month.");
            } catch (DateTimeParseException e) { throw Fields.invalid("Enter a valid record month."); }
        }
        values.put("seriesId", series);
        values.put("period", period);
        values.put("anchorDay", anchor);
        return values;
    }

    private Map<String,Object> insert(UUID workspace, Map<String,Object> values) {
        UUID id = UUID.randomUUID();
        var params = new HashMap<>(values);
        params.put("id", id);
        params.put("workspaceId", workspace);
        return jdbc.sql("""
                INSERT INTO items(id,workspace_id,title,why,next_action,status,waiting_for,due_date,follow_up_date,evidence_url,source_url,recurrence,series_id,period,anchor_day)
                VALUES(:id,:workspaceId,:title,:why,:nextAction,:status,:waitingFor,:dueDate,:followUpDate,:evidenceUrl,:sourceUrl,:recurrence,:seriesId,:period,:anchorDay)
                RETURNING *
                """).params(params).query(Items::read).single().values();
    }

    Map<String,Object> add(UUID workspace, Map<String,Object> input) { return insert(workspace, draft(input,null)); }

    private Map<String,Object> update(UUID workspace, UUID id, Map<String,Object> values, boolean complete) {
        var params = new HashMap<>(values);
        params.put("id",id);
        params.put("workspaceId",workspace);
        params.put("completedAt",complete ? OffsetDateTime.now() : null);
        if (complete) params.put("status","done");
        return jdbc.sql("""
                UPDATE items SET title=:title, why=:why, next_action=:nextAction, status=:status, waiting_for=:waitingFor,
                due_date=:dueDate, follow_up_date=:followUpDate, evidence_url=:evidenceUrl, source_url=:sourceUrl,
                recurrence=:recurrence, series_id=:seriesId, period=:period, anchor_day=:anchorDay, completed_at=:completedAt
                WHERE workspace_id=:workspaceId AND id=:id RETURNING *
                """).params(params).query(Items::read).single().values();
    }

    @Transactional
    public Map<String,Object> edit(UUID workspace, UUID id, Map<String,Object> changes) {
        Stored existing = find(workspace,id,true);
        if (existing.values().get("completedAt") != null) throw new ResponseStatusException(HttpStatus.CONFLICT,"Completed records are read-only.");
        return update(workspace,id,draft(changes,existing),false);
    }

    private static String nextPeriod(String current) {
        var next = YearMonth.parse(current).plusMonths(1);
        if (next.getYear() > 9999) throw Fields.invalid("The next occurrence is outside the supported date range.");
        return next.toString();
    }

    @Transactional
    public Completion complete(UUID workspace, UUID id, Map<String,Object> changes) {
        Stored existing = find(workspace,id,true);
        Map<String,Object> row = existing.values();
        if (row.get("completedAt") != null) {
            var next = row.get("seriesId") == null ? null : jdbc.sql("SELECT * FROM items WHERE workspace_id=? AND series_id=? AND period=?")
                    .params(workspace, row.get("seriesId"), nextPeriod((String)row.get("period")))
                    .query(Items::read).optional().map(Stored::values).orElse(null);
            return new Completion(row,next);
        }
        var values = draft(changes,existing);
        var completed = update(workspace,id,values,true);
        if (!"monthly".equals(values.get("recurrence"))) return new Completion(completed,null);
        values.put("period",nextPeriod((String)values.get("period")));
        LocalDate due = (LocalDate)values.get("dueDate");
        if (due != null) {
            YearMonth month = YearMonth.from(due).plusMonths(1);
            if (month.getYear() > 9999) throw Fields.invalid("The next due date is outside the supported range.");
            values.put("dueDate",month.atDay(Math.min((int)values.get("anchorDay"),month.lengthOfMonth())));
        }
        values.put("status","ready");
        values.put("evidenceUrl","");
        values.put("waitingFor","");
        values.put("followUpDate",null);
        return new Completion(completed,insert(workspace,values));
    }
}
