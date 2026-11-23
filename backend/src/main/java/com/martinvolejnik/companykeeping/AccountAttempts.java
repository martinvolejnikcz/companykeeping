package com.martinvolejnik.companykeeping;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/** Bounds expensive password checks per process and repeated failures for an address/account pair. */
@Component
class AccountAttempts {
    private static final long WINDOW = Duration.ofMinutes(10).toMillis();
    private static final int MAX_KEYS = 4096;
    private final Map<Key, Window> attempts = new HashMap<>();
    private int active;
    private long nextCleanup;

    private record Key(String address, String email) {}
    private static final class Window {
        final long expires;
        int attempts;
        Window(long now) { expires = now + WINDOW; }
    }

    synchronized void begin(String address, String email) {
        long now = System.currentTimeMillis();
        if (now >= nextCleanup) {
            attempts.values().removeIf(window -> window.expires <= now);
            nextCleanup = now + 60_000;
        }
        if (active >= 6) throw limited();
        var key = new Key(address,email);
        Window window = attempts.get(key);
        if (window == null || window.expires <= now) {
            if (window == null && attempts.size() >= MAX_KEYS) throw limited();
            window = new Window(now);
            attempts.put(key,window);
        }
        if (window.attempts >= 12) throw limited();
        window.attempts++;
        active++;
    }

    synchronized void end(String address, String email, boolean success) {
        active--;
        if (success) attempts.remove(new Key(address,email));
    }

    private static ResponseStatusException limited() {
        return new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many account requests. Try again later.");
    }
}
