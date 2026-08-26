// lib/i18n/locales/en/donPage.ts
//
// Traductions ANGLAISES du namespace `donPage`.
//
// La SOURCE DE VERITE est le francais (`../fr/donPage.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  heroBadge: 'Support the association',
  heroTitle: "Donate to help women's esport grow",
  heroSubtitle:
    "Every contribution helps us open more spots for players, keep events safe, and show that women's performance deserves an ambitious setting.",
  comingSoonBtn: 'Online payment coming soon',
  donateOnline: 'Donate online',
  discoverProject: 'Discover the project',
  usesTitle: 'What your donation makes possible',
  use1Title: 'Inclusion & support',
  use1Detail:
    'Travel costs, solidarity accommodation and loaned equipment so every player can take part in good conditions.',
  use2Title: 'Production & broadcast',
  use2Detail:
    'Studio rentals, filming, live graphics and moderation to deliver an accessible and safe show.',
  use3Title: 'Local actions',
  use3Detail:
    "Discovery workshops, school interventions and mentoring with role models from women's esport.",
  transparencyLabel: 'Transparency',
  transparencyTitle: 'Every euro is earmarked and documented.',
  transparency1: 'Impact reports sent to donors',
  transparency2: 'Budget tracked by the staff team',
  transparency3: 'Priority given to inclusive actions',
  thanksTitle: 'Thank you for your donation!',
  thanksBody:
    'Your payment has been received. You will get a confirmation email from HelloAsso.',
  errorTitle: "The payment didn't go through.",
  errorBody: 'You can try again below or contact us if the problem persists.',
  chooseAmountLabel: 'Choose an amount',
  chooseAmountTitle: 'One gesture, a concrete impact',
  chooseAmountHint: 'The amounts below are indicative: every donation counts.',
  tier1Label: 'Helping hand',
  tier1Impact: 'Helps pay for the website (domain name, server) or bank fees.',
  tier2Label: 'Supporter',
  tier2Impact:
    'Covers the creation of dedicated live visuals and moderation for a stream evening.',
  tier3Label: 'Ally',
  tier3Impact:
    "Contributes to the next tournament's cash prize and goodies for all players.",
  tier4Label: 'Patron',
  tier4Impact:
    'Helps launch a live event (equipment + supervision) in a venue or secure a full recording.',
  comingSoonEyebrow: 'Coming soon',
  comingSoonTitle: 'Online payment coming soon',
  comingSoonBody:
    'Card donations via HelloAsso will be available very soon. In the meantime, you can contact us to donate by bank transfer.',
  formEyebrow: 'Donate online',
  formTitle: 'Secure payment',
  formDesc:
    'Pay by card via HelloAsso, the leading platform for French associations. No commission is taken on your donation.',
  qrAlt: 'QR code to donate',
  qrHint: 'Or scan this QR code',
  amountLabel: 'Donation amount',
  customAmountPlaceholder: 'Other (€)',
  firstNameLabel: 'First name',
  lastNameLabel: 'Last name',
  emailLabel: 'Email',
  submitRedirecting: 'Redirecting...',
  submitDonate: 'Donate {amount} via HelloAsso',
  redirectNote:
    'You will be redirected to HelloAsso to complete the payment securely.',
  otherMeansLabel: 'Other ways',
  otherMeansTitle: 'Bank transfer or patronage',
  transferTitle: 'Bank transfer',
  transferDesc:
    "Get the association's bank details and a confirmation as soon as your donation is received.",
  transferBtn: 'Request bank details',
  companiesTitle: 'Companies',
  companiesDescBefore:
    "Want to support or sponsor us? Let's talk visibility, workshops and patronage — see also our",
  companiesLink: 'current partners',
  companiesDescAfter: '.',
  sponsorBtn: 'Talk sponsoring',
  questionLabel: 'A question?',
  questionTitle: "We're here to help",
  questionBody:
    'Need a receipt, want to understand how donations are used, or know about upcoming actions? Write to us — we reply quickly.',
  minAmountError: 'The minimum amount is 1 €.',
  genericError: 'Something went wrong.',
  serverError: 'Unable to reach the server. Please try again later.',
};
