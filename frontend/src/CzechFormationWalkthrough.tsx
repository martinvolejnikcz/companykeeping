import { useId, useState, type ReactNode } from 'react';
import './czechFormation.css';

const corporationsAct = 'https://e-sbirka.gov.cz/eli/cz/sb/2012/90';
const kbCapitalAccount = 'https://www.kb.cz/cs/podnikatele-a-firmy/ucty/specializovane-ucty/ucet-pro-slozeni-zakladniho-kapitalu';
const formatAmount = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });

function Source({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
}

function CapitalExample() {
  const [input, setInput] = useState('50000');
  const hintId = useId();
  // Keep the worked example in haléře so rounding never understates 30%.
  const halere = Math.round(Number(input) * 100);
  const valid = /^\d+(\.\d{1,2})?$/.test(input) && halere >= 100 && halere <= 999_999_999_999_00;
  const transferRequired = halere > 2_000_000;
  const minimum = Math.ceil(halere * 3 / 10) / 100;
  return <section className="formation-money" aria-label="Where the money goes">
    <h3>Where the money goes</h3>
    <p>If CZK 50,000 is your startup budget, first decide how much you will promise as registered capital in the deed.
      Extra money you lend the company later has its own agreement and bookkeeping entry.</p>
    <label>Total monetary contributions (CZK)
      <input type="number" inputMode="decimal" min="1" max="999999999999" step=".01"
        value={input} aria-describedby={hintId} onChange={event => setInput(event.target.value)}/>
    </label>
    <p id={hintId} className="formation-hint">Try an amount. This example assumes one founder paying in money, with no share premium.</p>
    <div className="formation-calculation" aria-live="polite" aria-atomic="true">
      {valid ? <>
        <strong>{transferRequired ? 'Use a special capital account before registration.' : 'The contribution administrator may receive the money directly.'}</strong>
        <p>{transferRequired
          ? 'The total pledged exceeds CZK 20,000. The administrator opens the account after signing the deed. Transfer the amount due to that account using the bank’s instructions. A smaller first instalment still uses this account.'
          : 'At or below CZK 20,000 in total across all founders, Czech law also permits another payment method. Agree the method with the notary. If paying in cash to the administrator, keep a dated receipt.'}</p>
        <p>For a single contribution of <b>CZK {formatAmount.format(halere / 100)}</b>, the legal minimum before filing is <b>CZK {formatAmount.format(minimum)}</b>.
          {' '}If your deed calls for payment in full, pay <b>CZK {formatAmount.format(halere / 100)}</b> before filing.</p>
      </> : <p>Enter an amount between CZK 1 and CZK 999,999,999,999, with up to two decimal places.</p>}
    </div>
    <details><summary>Several founders, part payments or a cash deposit?</summary>
      <p>Add up all agreed monetary contributions to decide whether a special account is required. Each founder must pay at least 30% of their own monetary contribution before filing, plus any agreed premium in full. The deed sets when the balance is due, within the statutory five-year limit from registration.</p>
      <p>For a payment into the special account, bank transfer is straightforward. A bank may also accept banknotes paid into that account at a branch. For example, Komerční banka accepts both and asks the administrator for ID and the notarial deed.</p>
    </details>
    <Source href={corporationsAct}>Business Corporations Act · §§ 18, 23–27, 148 and 150</Source>
  </section>;
}

function CzechBankAccounts() {
  const headingId = useId();
  return <section className="formation-banks" aria-labelledby={headingId}>
    <h4 id={headingId}>Bank accounts for a Czech s.r.o.</h4>
    <p>For a CZK 50,000 share-capital commitment, the contribution administrator can open a special capital account at Fio or Komerční banka after signing the deed. A registered company can then apply to Revolut Business for everyday banking.</p>
    <dl>
      <div>
        <dt>Fio banka</dt>
        <dd>
          <p>A practical main account for a small software company. Fio offers free CZK, EUR and USD accounts, free domestic CZK and standard SEPA payments, and a free API for pulling transactions into accounting software.</p>
          <p>For the founding deposit, take the signed deed to a branch and ask for an <i lang="cs">účet pro složení základního kapitálu</i>. The confirmation costs CZK 120.</p>
          <div className="formation-sources"><Source href="https://www.fio.cz/podnikatele">Fio business accounts</Source>
            <Source href="https://www.fio.cz/o-nas/faq/bankovni-sluzby/3-ucty-a-produkty">Fio capital deposit and confirmation</Source></div>
        </dd>
      </div>
      <div>
        <dt>Komerční banka</dt>
        <dd>
          <p>A good choice if you want to keep the same account number from formation into operation. KB issues the capital deposit confirmation for free. Once the company appears in the Commercial Register, contact KB to convert the account to a business current account.</p>
          <Source href={kbCapitalAccount}>KB capital account and conversion</Source>
        </dd>
      </div>
      <div>
        <dt>Revolut Business</dt>
        <dd>
          <p>A Czech s.r.o. can apply once it is registered and active. Basic costs CZK 250 a month. It can hold CZK, uses a Lithuanian IBAN for EUR payments, and provides SWIFT details for receiving CZK.</p>
          <p>Use a domestic account for Czech customer invoices. Consider adding Revolut if you regularly exchange currencies or want virtual cards for software subscriptions.</p>
          <div className="formation-sources"><Source href="https://help.revolut.com/en-CZ/business/help/setting-up-an-account/is-my-business-eligible/what-types-of-business-entities-are-supported/">Revolut eligibility</Source>
            <Source href="https://help.revolut.com/en-CZ/help/setting-up-an-account/onboarding/incorporation-details/business/">Registration requirements</Source>
            <Source href="https://help.revolut.com/en-CZ/business/help/receiving-payments/transfers-info/where-can-i-find-my-account-details/">Revolut account details</Source>
            <Source href="https://www.revolut.com/cs-CZ/business/business-account-plans/">Revolut pricing</Source></div>
        </dd>
      </div>
    </dl>
    <p className="formation-hint">Fees checked on 23 November 2026.</p>
  </section>;
}

export function CzechFormationWalkthrough() {
  return <section className="formation-walkthrough" aria-label="Czech incorporation process">
    <h2>From draft to registered company</h2>
    <ol className="formation-sequence">
      <li><h3>Put the terms on paper</h3>
        <p>One founder prepares a <i lang="cs">zakladatelská listina</i>. Two or more prepare a <i lang="cs">společenská smlouva</i>.
          Use your working draft to agree the name, office, activity, owners, contributions and who can sign. The notary turns those terms into the official deed.</p>
        <Source href="https://or.justice.cz/ias/ui/vzorsmlouvy">See the Ministry of Justice model in Czech and English</Source>
      </li>
      <li><h3>Choose a notary and sign the deed</h3>
        <p>You can do this by video. Open the Chamber’s request form, sign in with a supported Bank iD or electronic ID, choose a notary and enter the company details. You sign electronically at the appointment. Some notaries can issue the required signing certificate during the process.</p>
        <div className="formation-sources"><Source href="https://www.nkcr.cz/sro-online">Start the online notary request</Source>
          <Source href="https://www.nkcr.cz/zalozeni-sro-online">Check equipment and identity requirements</Source>
          <Source href="https://www.nkcr.cz/seznam-notaru">Find a notary for an in-person appointment</Source></div>
        <details><summary>What should I have ready?</summary>
          <p>Have your proposed address, the owners’ and directors’ details, and each owner’s contribution to hand. If someone else owns the office, ask the notary how to provide the owner’s consent. Ask what licence your activity needs and who will handle that application.</p>
          <p>Put a name in the deed for the person who will receive and document the contributions. This is the <i lang="cs">správce vkladů</i>. You can do it yourself.</p>
        </details>
      </li>
      <li><h3>Pay the amount agreed in the deed</h3>
        <p>Ask your bank for an <i lang="cs">účet pro složení základního kapitálu</i> if the special account is required.
          The bank gives the account details to the named administrator. Keep its deposit confirmation.
          The administrator signs a declaration of what each founder actually paid and gives it to the notary.</p>
        <CapitalExample/>
        <CzechBankAccounts/>
      </li>
      <li><h3>Get the register extract and activate everyday banking</h3>
        <p>Ask the notary for direct entry in the Commercial Register once the documents and contribution declaration are ready.
          The entry date is the company’s legal start. Save the extract with the company number (<span lang="cs">IČO</span>).</p>
        <p>The administrator hands the contributions to the company. Contact the bank about converting the capital account or moving the balance to the company’s operating account. The money can then pay company expenses. Give the deed, deposit proof and opening statement to your bookkeeper.</p>
        <div className="formation-sources"><Source href="https://portal.gov.cz/sluzby-vs/zapis-do-obchodniho-rejstriku-S15721">Gov.cz · Commercial Register entry</Source>
          <Source href="https://or.justice.cz/ias/ui/rejstrik">Find the company and its extract</Source></div>
      </li>
    </ol>
  </section>;
}
