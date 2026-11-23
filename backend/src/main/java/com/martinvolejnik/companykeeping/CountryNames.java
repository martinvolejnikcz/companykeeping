package com.martinvolejnik.companykeeping;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.text.Normalizer;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

@Component
class CountryNames {
    private record Catalog(List<List<String>> countries, Map<String,String> aliases) {}
    private final Map<String,String> codes = new HashMap<>();

    CountryNames(ObjectMapper mapper) throws IOException {
        try (var stream = new ClassPathResource("countries.json").getInputStream()) {
            var catalog = mapper.readValue(stream, Catalog.class);
            for (var country : catalog.countries()) {
                String code = country.get(0);
                codes.put(lookupKey(code), code);
                codes.put(lookupKey(country.get(1)), code);
            }
            catalog.aliases().forEach((alias, code) -> codes.put(lookupKey(alias), code));
        }
    }

    private static String lookupKey(String name) {
        return Normalizer.normalize(name.strip(), Normalizer.Form.NFKD).toLowerCase(Locale.ROOT)
                .replaceAll("\\p{M}", "").replaceAll("[^a-z0-9]", "");
    }

    boolean sameCountry(String first, String second) {
        String firstCode = codes.get(lookupKey(first));
        String secondCode = codes.get(lookupKey(second));
        if (firstCode != null || secondCode != null) return firstCode != null && firstCode.equals(secondCode);
        // The original free-text field accepted regions in any script. Preserve distinctions
        // between unrecognized names even if neither has an ASCII lookup key.
        return first.strip().replaceAll("(?U)\\s+", " ").equalsIgnoreCase(second.strip().replaceAll("(?U)\\s+", " "));
    }
}
