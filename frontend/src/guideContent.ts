import { getCountryCode } from './countries';
import type { WorkspaceInfo } from './shared';

type Route = 'company' | 'individual' | 'undecided';
type Source = { label: string; url: string };
export type GuideStep = {
  key: string;
  title: string;
  summary: string;
  question: string;
  example: string;
  points: string[];
  sources: Source[];
  routes?: { value: Route; label: string }[];
  followUp: { title: string; nextAction: string };
};

const czechFormation = {
  label: 'Gov.cz · How a company comes into existence',
  url: 'https://portal.gov.cz/en/informace/the-process-of-incorporation-and-setting-up-a-business-corporation-INF-221'
};
const czechTrade = {
  label: 'Gov.cz · Getting a trade licence',
  url: 'https://portal.gov.cz/en/sluzby-vs/vznik-zivnostenskeho-opravneni-S757'
};
const czechFounders = {
  label: 'Gov.cz · What goes in the founding documents',
  url: 'https://portal.gov.cz/en/informace/requirements-for-legal-acts-associated-with-incorporation-INF-219'
};

const countrySources: Record<string, Source[]> = {
  CZ: [czechFormation, czechTrade],
  GB: [{label:'GOV.UK · Compare business structures',url:'https://www.gov.uk/set-up-business'}],
  US: [{label:'U.S. Small Business Administration · Choose a structure and register',url:'https://www.sba.gov/counseling/launch-your-business/'}],
  IE: [
    {label:'Revenue · Setting up your own business',url:'https://www.revenue.ie/en/starting-a-business/starting-a-business/index.aspx'},
    {label:'Companies Registration Office · Steps to form a company',url:'https://cro.ie/Registration/Company/Required-Steps/'}
  ],
  CA: [{label:'Government of Canada · Register your business',url:'https://www.canada.ca/en/services/business/start/register-with-gov.html'}],
  AU: [{label:'Australian Government · Choose your business structure',url:'https://business.gov.au/planning/business-structures-and-types/business-structures/choose-your-business-structure'}]
};
const euCountries = new Set('AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(' '));
const euRegistration = {
  label:'Your Europe · Find your national registration contact',
  url:'https://europa.eu/youreurope/business/lifecycle/starting/registration-permits-licences/index_en.htm'
};

function localSources(code?: string): Source[] {
  if (!code) return [];
  return countrySources[code] ?? (euCountries.has(code) ? [euRegistration] : []);
}

function firstSaleExample(description: string) {
  if (/\b(software|apps?|coding|saas|developer|programming)\b/i.test(description)) {
    return 'A shop wants a booking tool. I’ll quote for one working booking flow. The owner will test it with a real appointment and approve it before I invoice.';
  }
  if (/\b(shop|bakery|food|retail|jewell?ery|craft|goods|ceramics|furniture)\b/i.test(description)) {
    return 'A local shop wants a first batch. We’ll agree on quantity, delivery and how it will confirm receipt before I buy the materials.';
  }
  return 'My first client wants a small paid trial. We’ll agree what I’ll deliver, who will accept it and what triggers payment before I begin.';
}

function registration(workspace: WorkspaceInfo, countryCode: string | undefined, route?: Route | null): GuideStep {
  const base = { key:'forming-registration', sources:localSources(countryCode) };

  if (countryCode === 'CZ' && route === 'company') return {
    ...base, title:'Prepare for the notary',
    summary:'For a Czech s.r.o., founding documents and entry in the Commercial Register are separate milestones. The company comes into legal existence on registration.',
    points:[
      'Bring a proposed name and registered office, a description of the activity, and the names and roles of the founders and intended directors.',
      'Ask the notary which documents and authorisations fit your activity, who will submit the registration, and what confirmation you will receive.',
      'If a customer wants to sign before registration, tell the notary. Ask who would be bound by that agreement before you promise a start date.'
    ],
    sources:[czechFounders,czechFormation,czechTrade],
    question:'What will you bring to the notary, and what do you need them to confirm?',
    example:'I have a working name and a proposed director. I’ll ask what evidence is needed for the registered office and who will file the registration.',
    followUp:{title:'Arrange the founding meeting',nextAction:'Send the notary the proposed name, founders and activity. Ask for a document list and the next available meeting.'}
  };

  if (countryCode === 'CZ' && route === 'individual') return {
    ...base, title:'Check your activity with the trade office',
    summary:'For a Czech self-employed founder, the activity you actually perform determines which trade or other authorisation to look into.',
    points:[
      'Describe what a customer pays you to do. For example, delivering a custom application and reselling equipment describe different work.',
      'Use the trade licensing guide to check whether that work falls under a free, craft, tied or licensed trade. Ask the trade office if it falls outside those categories.',
      'Ask which evidence applies to your situation. Record the office’s answer and keep its confirmation with the work item.'
    ],
    sources:[czechTrade],
    question:'What activity will you describe to the trade office, and what answer do you need?',
    example:'I’ll send a description of my first paid project and ask which activity to declare and what proof to bring.',
    followUp:{title:'Confirm the activity with the trade office',nextAction:'Describe the work a customer will pay for and ask the trade office to confirm the appropriate procedure.'}
  };

  if (!route || route === 'undecided') return {
    ...base, title:'Resolve the question holding you back',
    summary:'Use a real customer or co-founder scenario to compare your options. A local adviser can give a more useful answer when they know what you plan to sign.',
    points:[
      'Describe a contract you expect in the next few months and who else may own or run the business.',
      'Ask how each route changes who signs, who is responsible if the promise cannot be met, and which records you would keep.',
      'Write down the answer you still need and the person or authority that can confirm it. You can change your route in the first chapter.'
    ],
    question:'Which question will settle your choice, and whom will you ask?',
    example:'A colleague may join as an owner. I’ll ask a local adviser how we would record ownership and who could sign for us.',
    followUp:{title:'Compare the two setup routes with an adviser',nextAction:'Send the adviser a description of the first customer contract and the founders who may share ownership.'}
  };

  const company = route === 'company';
  return {
    ...base, title:company ? 'Prepare your company registration' : 'Prepare to trade in your own name',
    summary:company
      ? 'Work out who will own the company and who can act for it. Those are two different decisions, even if one founder does both jobs.'
      : 'Describe the activity you will sell and where you will carry it out. Use those details to check the local process for an individual business.',
    points:[
      company ? 'Gather proposed owners, the working name and the address you plan to use. Agree who will handle the filing and who will approve customer contracts.'
        : 'List the services or goods on your first invoice. Include where the work takes place and whether you will use a trading name.',
      'Ask the relevant business authority in ' + workspace.country + ' what applies to your activity and location. Check the documents, sequence, current fees and any dates directly with that authority.',
      'Choose the confirmation you will keep and where it belongs in your records.'
    ],
    question:'Who will confirm the registration steps, and what will you take to them?',
    example:'I’ll send my business description to the registration office and ask for the checklist for my chosen structure and location.',
    followUp:{title:'Confirm the registration process',nextAction:'Contact the relevant authority with the activity and chosen structure. Save the reply and any confirmed dates.'}
  };
}

function formation(workspace: WorkspaceInfo, code: string | undefined, route?: Route | null): GuideStep[] {
  const czech = code === 'CZ';
  const company = czech ? 'A limited company (s.r.o.)' : 'A separate company';
  const individual = czech ? 'Self-employment (OSVČ)' : 'Trading as an individual';
  return [
    {
      key:'forming-model',title:'Who will sign your first contract?',
      summary:czech ? 'In Czechia you can explore trading in your own name as an OSVČ or setting up a company such as an s.r.o. Start with the customer you expect and who should make that promise.'
        : 'Picture a customer accepting your first quote. Decide whether you want to make that agreement in your own name or through a separate company.',
      points:[
        'If you trade in your own name, you are the person the customer contracts with. Consider what you would personally be promising to deliver.',
        czech ? 'An s.r.o. can enter agreements in its own name once registered. Think about who would own it and who would have authority to sign.'
          : 'If you form a company, think about who will own it, who will run it and who will have authority to sign. Ask a local adviser about your responsibilities.',
        'Compare the routes against one real event: taking on a co-owner, paying a supplier before a customer pays, or accepting a contract with a warranty.'
      ],
      routes:[{value:'company',label:company},{value:'individual',label:individual},{value:'undecided',label:'Still comparing options'}],
      sources:localSources(code),
      question:'What makes one route fit your business, or what would help you decide?',
      example:czech ? 'I’m starting alone, but a second founder may join. I want to compare how we could share ownership before I sign the first client contract.'
        : 'I’ll handle the first job myself. Before choosing a structure I want to understand who would carry the cost of replacing a failed delivery.',
      followUp:{title:'Discuss the business structure',nextAction:'Take one expected customer agreement and your ownership plans to a local adviser. Record the implications of each route.'}
    },
    registration(workspace,code,route),
    {
      key:'forming-first-sale',title:'Walk through your first sale',
      summary:'Imagine the first customer saying yes. Work backwards from the money reaching your account to the agreement, delivery and evidence that make payment possible.',
      points:[
        'Pick one customer and one thing they could buy. Write the deliverable in terms they could check.',
        'Agree who approves delivery, what will trigger the invoice or payment request, and how you will handle a change in scope.',
        'Keep the accepted quote, approval and payment record together. This gives you the example you can take to your bookkeeper.'
      ],
      sources:[],question:'What will the customer receive, and what will tell you it is time to ask for payment?',
      example:firstSaleExample(workspace.description),
      followUp:{title:'Agree the scope of the first sale',nextAction:'Send the customer a short description of the deliverable, acceptance and payment arrangements. Ask them to confirm.'}
    }
  ];
}

const operating: GuideStep[] = [
  {
    key:'operating-money',title:'Trace one payment from sale to bank',
    summary:'Choose one recent sale. Follow it from the customer’s agreement to the money arriving, and look for the point where someone could lose track.',
    points:[
      'Open the order or accepted quote. Identify the amount agreed, what was delivered and who approved it.',
      'Find the invoice or payment request, then match it to a bank or payment-provider entry. For a part-payment, note the balance still open.',
      'If the money has not arrived, choose who will contact the customer and when. If it has, keep the evidence with the sale.'
    ],
    question:'Where did the payment trail end, and who owns the next move?',
    example:'The customer approved delivery. The invoice is in their accounts inbox, but I have no payment reference yet. I’ll check with the buyer on Thursday.',
    sources:[],followUp:{title:'Close the loop on a customer payment',nextAction:'Match the agreed amount to the payment record or ask the customer to confirm its status.'}
  },
  {
    key:'operating-handover',title:'Agree a monthly bookkeeping handover',
    summary:'A good handover lets someone else understand a month’s activity without asking you to reconstruct it. Agree on a small repeatable routine with the person who keeps your books.',
    points:[
      'Pick a recent month and ask which invoices, receipts, statements and explanations your bookkeeper needs.',
      'Agree where documents should go, who will send them and what counts as receipt. Ask your bookkeeper for the actual date.',
      'Use a monthly record for the handover. Save that month’s confirmation when you complete it so the next month has its own evidence.'
    ],
    question:'Who sends what, where does it go, and how will you know it was received?',
    example:'I’ll put receipts and the bank statement in our monthly folder. My bookkeeper will reply when the set is complete. I’ll keep their reply with that month.',
    sources:[],followUp:{title:'Confirm the monthly handover with the bookkeeper',nextAction:'Ask which records to send, where to send them, and which date and confirmation to use.'}
  },
  {
    key:'operating-review',title:'Set your next owner review',
    summary:'Reserve time for one decision that only the owner can make. A short review works best when you know which evidence will change your mind.',
    points:[
      'Look at one incoming payment, one outgoing commitment and one decision waiting for someone else.',
      'Pick the issue with the nearest consequence. Name the person responsible and the evidence you need from them.',
      'Agree a review date. Enter dates and their sources on individual records so you can see what is coming due.'
    ],
    question:'What decision will you revisit, when, and with what evidence?',
    example:'Before renewing our supplier agreement I’ll compare the last two bills with expected orders. I’ll review it with the person placing orders next Friday.',
    sources:[],followUp:{title:'Prepare the next owner review',nextAction:'Collect the evidence for one open decision and agree a review date with the person responsible.'}
  }
];

export function getGuide(workspace: WorkspaceInfo, answers: Record<string, {route?: Route | null}> = {}): GuideStep[] {
  const countryCode = getCountryCode(workspace.country);
  if (workspace.stage === 'forming') return formation(workspace,countryCode,answers['forming-model']?.route);
  if (countryCode !== 'CZ') return operating;
  return operating.map(step => {
    if (step.key === 'operating-handover') return {
      ...step,
      sources:[{label:'Gov.cz · Keeping accounting records in Czechia',url:'https://portal.gov.cz/en/informace/information-on-keeping-accounting-records-INF-328'}]
    };
    if (step.key === 'operating-review') return {
      ...step,
      points:[...step.points, 'If your business has a Czech data box (datová schránka), agree who checks official messages and who acts on them when that person is away.'],
      sources:[{label:'Czech Digital and Information Agency · Using a data box',url:'https://chcidatovku.gov.cz/en'}]
    };
    return step;
  });
}
