export function CompanyLogoLink() {
  return <a className="fgu-signature" href="https://fgu.martinvolejnik.com">
    <img src="/assets/split-ticket-paper.svg" width="206" height="73" alt="For General Use"/>
  </a>;
}

export function MakerCredit() {
  return <span className="maker-credit">by <CompanyLogoLink/></span>;
}
