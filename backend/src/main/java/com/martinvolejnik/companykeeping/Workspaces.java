package com.martinvolejnik.companykeeping;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class Workspaces {
    private final JdbcClient jdbc;
    private final Items items;
    Workspaces(JdbcClient jdbc, Items items) {
        this.jdbc = jdbc;
        this.items = items;
    }

    record Workspace(UUID id, Map<String,Object> profile, boolean demo, boolean setupComplete) {}
    record State(Map<String,Object> user, Map<String,Object> workspace, List<Map<String,Object>> items, List<Map<String,Object>> suggestions) {}

    private Optional<Workspace> find(UUID owner, boolean lock) {
        return jdbc.sql("SELECT * FROM workspaces WHERE owner_id=?" + (lock ? " FOR UPDATE" : "")).param(owner)
                .query((rs,n) -> new Workspace(rs.getObject("id",UUID.class), Map.of("name",rs.getString("name"),
                                "country",rs.getString("country"),"description",rs.getString("description"),"stage",rs.getString("stage")),
                        rs.getBoolean("demo"),rs.getBoolean("setup_complete"))).optional();
    }

    private Workspace require(UUID owner, boolean lock) {
        return find(owner,lock).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,"Create your company workspace first."));
    }

    UUID id(Accounts.Account account) { return require(account.id(),false).id(); }

    @Transactional(readOnly = true, isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public State state(Accounts.Account account) {
        if (account == null) return new State(null,null,List.of(),List.of());
        Map<String,Object> user = Map.of("email",account.email());
        Workspace workspace = find(account.id(),false).orElse(null);
        if (workspace == null) return new State(user,null,List.of(),List.of());
        var details = new HashMap<>(workspace.profile());
        details.put("id",workspace.id());
        details.put("setupComplete",workspace.setupComplete());
        return new State(user,details,items.list(workspace.id()), workspace.setupComplete() ? List.of() : Suggestions.forProfile(details,workspace.demo()));
    }

    private static Map<String,Object> profile(Map<String,Object> values) {
        String name = Fields.text(values,"name",160,false);
        return Map.of("name",name.isEmpty() ? "Untitled company" : name,
                "country",Fields.text(values,"country",120,true), "description",Fields.text(values,"description",1500,true),
                "stage",Fields.choice(values,"stage",null,"forming","operating"));
    }

    void create(UUID owner, Map<String,Object> input) {
        if (input.get("demo") != null && !(input.get("demo") instanceof Boolean)) throw Fields.invalid("Choose a valid demo setting.");
        boolean demo = Boolean.TRUE.equals(input.get("demo"));
        var values = new HashMap<String,Object>();
        if (demo) values.putAll(Suggestions.EXAMPLE);
        values.putAll(input);
        var params = new HashMap<>(profile(values));
        params.put("demo",demo);
        params.put("id",UUID.randomUUID());
        params.put("owner",owner);
        int created = jdbc.sql("""
                INSERT INTO workspaces (id,owner_id,name,country,description,stage,demo)
                VALUES (:id,:owner,:name,:country,:description,:stage,:demo) ON CONFLICT(owner_id) DO NOTHING
                """).params(params).update();
        if (created == 0) throw new ResponseStatusException(HttpStatus.CONFLICT,"Your company workspace already exists.");
    }

    @Transactional
    public void edit(UUID owner, Map<String,Object> input) {
        var combined = new HashMap<>(require(owner,true).profile());
        combined.putAll(input);
        var params = new HashMap<>(profile(combined));
        params.put("owner",owner);
        jdbc.sql("UPDATE workspaces SET name=:name,country=:country,description=:description,stage=:stage WHERE owner_id=:owner").params(params).update();
    }

    @Transactional
    public void accept(UUID owner, List<Map<String,Object>> entries) {
        if (entries == null || entries.size() > 100) throw Fields.invalid("Choose up to 100 starting items.");
        Workspace workspace = require(owner,true);
        if (workspace.setupComplete()) throw new ResponseStatusException(HttpStatus.CONFLICT,"The starting checklist has already been saved.");
        for (var input : entries) {
            if (input == null) throw Fields.invalid("Choose a valid checklist item.");
            items.add(workspace.id(),input);
        }
        jdbc.sql("UPDATE workspaces SET setup_complete=true WHERE owner_id=?").param(owner).update();
    }
}
