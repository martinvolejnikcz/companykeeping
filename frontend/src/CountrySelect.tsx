import { useId, type ChangeEvent } from 'react';
import { countries, getCountryCode } from './countries';

type Props = {
  country: string;
  onChange?: (country: string) => void;
  className?: string;
};

export function CountrySelect({country, onChange, className}: Props) {
  const id = useId();
  const code = getCountryCode(country);
  const selected = countries.find(([candidate]) => candidate === code)?.[1] ?? country;
  const selection = onChange ? {
    value: selected,
    onChange: (event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value),
  } : {defaultValue: selected};

  return <label className={className} htmlFor={id}>Country or region
    <select id={id} name="country" autoComplete="country-name" required {...selection}>
      <option value="" disabled>Select a country or region</option>
      {country && !code && <option value={country}>{country}</option>}
      {countries.map(([key, name]) => <option key={key} value={name}>{name}</option>)}
    </select>
  </label>;
}
