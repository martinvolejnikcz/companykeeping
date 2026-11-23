package com.martinvolejnik.companykeeping;

import java.net.URI;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

final class Fields {
    private Fields() {}

    static ResponseStatusException invalid(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    static String text(Map<String, ?> input, String key, int max, boolean required) {
        Object raw = input.get(key);
        if (raw != null && !(raw instanceof String)) throw invalid("Enter text for " + key + ".");
        String value = raw == null ? "" : ((String) raw).strip();
        if ((required && value.isEmpty()) || value.length() > max || value.indexOf(0) >= 0) {
            throw invalid("Enter a valid value for " + key + " (up to " + max + " characters).");
        }
        return value;
    }

    static String choice(Map<String, ?> input, String key, String fallback, String... allowed) {
        Object value = input.get(key);
        if (value == null) value = fallback;
        if (!(value instanceof String s) || !Set.of(allowed).contains(s)) throw invalid("Choose a valid " + key + ".");
        return s;
    }

    static LocalDate date(Map<String, ?> input, String key) {
        String value = text(input, key, 10, false);
        if (value.isEmpty()) return null;
        try {
            LocalDate date = LocalDate.parse(value);
            if (date.getYear() <= 0 || date.getYear() > 9999) throw invalid("Enter a valid date.");
            return date;
        } catch (DateTimeParseException e) {
            throw invalid("Enter a valid date.");
        }
    }

    static String link(Map<String, ?> input, String key) {
        String value = text(input, key, 2048, false);
        if (value.isEmpty()) return value;
        try {
            URI uri = URI.create(value);
            if (uri.getHost() != null && ("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme()))) return value;
        } catch (IllegalArgumentException ignored) {}
        throw invalid("Enter an http or https address for the link.");
    }
}
