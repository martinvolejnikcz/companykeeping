package com.martinvolejnik.companykeeping;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;

@RestController
class ApiController {
    private final Accounts accounts;
    private final Workspaces workspaces;
    private final Items items;
    private final JdbcClient jdbc;

    ApiController(Accounts accounts, Workspaces workspaces, Items items, JdbcClient jdbc) {
        this.accounts = accounts;
        this.workspaces = workspaces;
        this.items = items;
        this.jdbc = jdbc;
    }

    @GetMapping("/healthz")
    Map<String,Boolean> health() {
        jdbc.sql("SELECT 1").query(Integer.class).single();
        return Map.of("ok",true);
    }

    @GetMapping("/api/example")
    Object example() { return Suggestions.example(); }

    @GetMapping("/api/state")
    Object state(@RequestAttribute(value="account",required=false) Accounts.Account account) {
        return workspaces.state(account);
    }

    @PostMapping({"/api/signup","/api/login"})
    ResponseEntity<Object> login(@RequestBody Map<String,Object> body, HttpServletRequest request) {
        boolean signup = request.getRequestURI().equals("/api/signup");
        var cookie = accounts.authenticate(body, request, signup);
        return ResponseEntity.status(signup ? HttpStatus.CREATED : HttpStatus.OK)
                .header(HttpHeaders.SET_COOKIE,cookie).body(Map.of("ok",true));
    }

    @PostMapping("/api/logout")
    Object logout(@RequestBody Map<String,Object> body, HttpServletRequest request, HttpServletResponse response) {
        response.setHeader(HttpHeaders.SET_COOKIE,accounts.revoke(request));
        return Map.of("ok",true);
    }

    @PostMapping("/api/workspace")
    @ResponseStatus(HttpStatus.CREATED)
    Object create(@RequestAttribute Accounts.Account account, @RequestBody Map<String,Object> body) {
        workspaces.create(account.id(),body);
        return Map.of("ok",true);
    }

    @PatchMapping("/api/workspace")
    Object editWorkspace(@RequestAttribute Accounts.Account account, @RequestBody Map<String,Object> body) {
        workspaces.edit(account.id(),body);
        return Map.of("ok",true);
    }

    record Checklist(List<Map<String,Object>> items) {}

    @PostMapping("/api/checklist")
    Object accept(@RequestAttribute Accounts.Account account, @RequestBody Checklist body) {
        workspaces.accept(account.id(),body.items());
        return Map.of("ok",true);
    }

    @PostMapping("/api/items")
    @ResponseStatus(HttpStatus.CREATED)
    Object add(@RequestAttribute Accounts.Account account, @RequestBody Map<String,Object> body) {
        return Map.of("item",items.add(workspaces.id(account),body));
    }

    @GetMapping("/api/items/{id}")
    Object get(@RequestAttribute Accounts.Account account, @PathVariable UUID id) {
        return Map.of("item",items.get(workspaces.id(account),id));
    }

    @PatchMapping("/api/items/{id}")
    Object edit(@RequestAttribute Accounts.Account account, @PathVariable UUID id, @RequestBody Map<String,Object> body) {
        return Map.of("item",items.edit(workspaces.id(account),id,body));
    }

    @PostMapping("/api/items/{id}/complete")
    Object complete(@RequestAttribute Accounts.Account account, @PathVariable UUID id, @RequestBody Map<String,Object> body) {
        return items.complete(workspaces.id(account),id,body);
    }
}

@RestControllerAdvice
class ApiErrors {
    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<Object> rejected(ResponseStatusException error) {
        return ResponseEntity.status(error.getStatusCode()).body(Map.of("error",error.getReason() == null ? "Request rejected." : error.getReason()));
    }
    @ExceptionHandler({MethodArgumentTypeMismatchException.class, HttpMessageNotReadableException.class})
    ResponseEntity<Object> malformed() {
        return ResponseEntity.badRequest().body(Map.of("error","Enter valid request values."));
    }
    @ExceptionHandler(DuplicateKeyException.class)
    ResponseEntity<Object> duplicate() {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error","This record already exists for this occurrence."));
    }
}
