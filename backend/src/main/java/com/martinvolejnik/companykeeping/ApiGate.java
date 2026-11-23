package com.martinvolejnik.companykeeping;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URI;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
class ApiGate extends OncePerRequestFilter {
    private final Accounts accounts;
    private final String publicOrigin;

    ApiGate(Accounts accounts, @Value("${companykeeping.public-origin}") String origin) {
        this.accounts = accounts;
        this.publicOrigin = origin.isBlank() ? "" : validateOrigin(origin);
    }

    private static String validateOrigin(String origin) {
        var uri = URI.create(origin);
        if (!("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) || uri.getHost() == null ||
                uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null ||
                !(uri.getPath().isEmpty() || uri.getPath().equals("/"))) throw new IllegalArgumentException("PUBLIC_ORIGIN must be an HTTP(S) origin.");
        return uri.getScheme() + "://" + uri.getAuthority();
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        res.setHeader("X-Content-Type-Options","nosniff");
        res.setHeader("Referrer-Policy","no-referrer");
        res.setHeader("X-Frame-Options","DENY");
        res.setHeader("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
        String path = req.getRequestURI();
        if (path.startsWith("/api/")) {
            res.setHeader("Cache-Control", "no-store");
            String method = req.getMethod();
            boolean unsafe = !("GET".equals(method) || "HEAD".equals(method));
            String expected = publicOrigin.isEmpty() ? req.getScheme() + "://" + req.getHeader("Host") : publicOrigin;
            if (unsafe && (!expected.equals(req.getHeader("Origin")) || "cross-site".equals(req.getHeader("Sec-Fetch-Site")))) {
                reject(res, 403, "Open this company workspace to make changes.");
                return;
            }
            if (unsafe && (req.getContentType() == null || !req.getContentType().split(";")[0].strip().equalsIgnoreCase("application/json"))) {
                reject(res, 415, "Send the request as JSON.");
                return;
            }
            if (req.getContentLengthLong() > JsonBodyLimit.BYTES) {
                reject(res, 413, "The request is too large.");
                return;
            }
            boolean publicPath = unsafe ? Set.of("/api/signup", "/api/login", "/api/logout").contains(path)
                    : Set.of("/api/state", "/api/example").contains(path);
            if (!publicPath || path.equals("/api/state")) {
                Accounts.Account account = accounts.current(req);
                if (account == null && !publicPath) {
                    reject(res, 401, "Sign in to open your company workspace.");
                    return;
                }
                req.setAttribute("account", account);
            }
        }
        chain.doFilter(req, res);
    }

    private static void reject(HttpServletResponse res, int code, String message) throws IOException {
        res.setStatus(code);
        res.setContentType("application/json");
        res.getWriter().write("{\"error\":\"" + message + "\"}");
    }
}
