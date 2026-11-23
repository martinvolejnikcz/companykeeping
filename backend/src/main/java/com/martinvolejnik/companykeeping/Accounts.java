package com.martinvolejnik.companykeeping;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.DelegatingPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.crypto.password.Pbkdf2PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

@Service
public class Accounts {
    record Account(UUID id, String email) {}
    private record Credential(UUID id, String hash) {}
    private static final Pattern EMAIL = Pattern.compile("[^\\s@]+@[^\\s@]+\\.[^\\s@]+");
    private static final SecureRandom RANDOM = new SecureRandom();
    private final JdbcClient jdbc;
    private final AccountAttempts attempts;
    private final TransactionTemplate transaction;
    private final PasswordEncoder encoder;
    private final String dummy;
    private final boolean secure;
    private final String cookieName;

    Accounts(JdbcClient jdbc, AccountAttempts attempts, PlatformTransactionManager manager, @Value("${companykeeping.public-origin}") String origin) {
        this.jdbc = jdbc;
        this.attempts = attempts;
        this.transaction = new TransactionTemplate(manager);
        this.secure = origin.startsWith("https://");
        this.cookieName = secure ? "__Host-companykeeping" : "companykeeping";
        var pbkdf = new Pbkdf2PasswordEncoder("", 16, 600000, Pbkdf2PasswordEncoder.SecretKeyFactoryAlgorithm.PBKDF2WithHmacSHA256);
        this.encoder = new DelegatingPasswordEncoder("pbkdf2-sha256-600k", Map.of("pbkdf2-sha256-600k", pbkdf));
        this.dummy = encoder.encode(UUID.randomUUID().toString());
    }

    private String token(HttpServletRequest request) {
        if (request.getCookies() == null) return null;
        String found = null;
        for (Cookie cookie : request.getCookies()) {
            if (!cookieName.equals(cookie.getName())) continue;
            if (found != null || !cookie.getValue().matches("[a-f0-9]{64}")) return null;
            found = cookie.getValue();
        }
        return found;
    }

    private static byte[] digest(String token) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.US_ASCII));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    Account current(HttpServletRequest request) {
        String token = token(request);
        if (token == null) return null;
        return jdbc.sql("""
                SELECT a.id, a.email FROM accounts a JOIN sessions s ON a.id=s.account_id
                WHERE s.token_hash=? AND s.expires_at > CURRENT_TIMESTAMP
                """).param(digest(token)).query((rs, n) -> new Account(rs.getObject(1, UUID.class), rs.getString(2))).optional().orElse(null);
    }

    public String authenticate(Map<String, Object> input, HttpServletRequest request, boolean signup) {
        String email = Fields.text(input, "email", 254, true).toLowerCase(Locale.ROOT);
        if (!EMAIL.matcher(email).matches()) throw Fields.invalid("Enter a valid email address.");
        if (!(input.get("password") instanceof String password) || password.length() > 256 || (signup && password.length() < 8)) {
            throw Fields.invalid("Use a password between 8 and 256 characters.");
        }
        String address = request.getRemoteAddr();
        attempts.begin(address, email);
        boolean success = false;
        try {
            // Derive passwords outside a transaction, leaving DB connections available to active owners.
            String hash = signup ? encoder.encode(password) : null;
            UUID verified = signup ? null : verify(email, password);
            String cookie = transaction.execute(status -> {
                UUID id = signup ? register(email, hash) : verified;
                return startSession(id, request);
            });
            success = true;
            return cookie;
        } finally {
            attempts.end(address, email, success);
        }
    }

    private UUID register(String email, String hash) {
        UUID id = UUID.randomUUID();
        if (jdbc.sql("INSERT INTO accounts (id,email,password_hash) VALUES (?,?,?) ON CONFLICT(email) DO NOTHING")
                .params(id, email, hash).update() == 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "An account already uses this email. Sign in to continue.");
        }
        return id;
    }

    private UUID verify(String email, String password) {
        Optional<Credential> match = jdbc.sql("SELECT id,password_hash FROM accounts WHERE email=?")
                .param(email).query((rs, n) -> new Credential(rs.getObject(1, UUID.class), rs.getString(2))).optional();
        if (!encoder.matches(password, match.map(Credential::hash).orElse(dummy)) || match.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Email or password is incorrect.");
        }
        return match.get().id();
    }

    private String startSession(UUID id, HttpServletRequest request) {
        revoke(request);
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String token = HexFormat.of().formatHex(bytes);
        jdbc.sql("DELETE FROM sessions WHERE expires_at<=CURRENT_TIMESTAMP").update();
        jdbc.sql("INSERT INTO sessions (account_id,token_hash,expires_at) VALUES (?,?,CURRENT_TIMESTAMP + INTERVAL '30 days')")
                .params(id, digest(token)).update();
        return cookie(token, Duration.ofDays(30));
    }

    public String revoke(HttpServletRequest request) {
        String old = token(request);
        if (old != null) jdbc.sql("DELETE FROM sessions WHERE token_hash=?").param(digest(old)).update();
        return cookie("", Duration.ZERO);
    }

    private String cookie(String token, Duration ttl) {
        return ResponseCookie.from(cookieName, token).httpOnly(true).secure(secure)
                .sameSite("Lax").path("/").maxAge(ttl).build().toString();
    }
}
