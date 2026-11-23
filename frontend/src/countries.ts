// ISO 3166-1 alpha-2 codes from IANA tzdb iso3166.tab. English display names
// come from Unicode CLDR and are kept stable because workspaces store names.
import catalogue from '../../shared/countries.json';

export const countries = catalogue.countries.map(([code, name]) => [code, name] as const);

function normalize(value: string) {
  return value.trim().normalize('NFKD').toLowerCase()
    .replace(/\p{Mark}/gu, '').replace(/[^a-z0-9]/g, '');
}

const codesByName = new Map<string, string>();
for (const [code, name] of countries) {
  codesByName.set(normalize(name), code);
  codesByName.set(normalize(code), code);
}

// Common spellings from the original free-text country field.
for (const [name, code] of Object.entries(catalogue.aliases)) codesByName.set(normalize(name), code);

export function getCountryCode(country: string): string | undefined {
  return codesByName.get(normalize(country));
}
