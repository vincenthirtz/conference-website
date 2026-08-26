// lib/i18n/locales/en/partnerRequest.ts
//
// Traductions ANGLAISES du namespace `partnerRequest`.
//
// La SOURCE DE VERITE est le francais (`../fr/partnerRequest.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  backToPartners: 'Back to partners',
  pageTitle: 'Become a partner',
  intro:
    'Fill in this form to tell us about your partnership project. Our team will get back to you quickly to build a tailor-made collaboration together.',
  successTitle: 'Request sent!',
  successMessage:
    'Thanks for your interest! Our team will review your request and get back to you as soon as possible.',
  labelCompany: 'Company / organisation name *',
  phCompany: 'Your company',
  labelContact: 'Contact name *',
  phContact: 'First and last name',
  labelEmail: 'Email *',
  phEmail: 'contact@company.com',
  labelPhone: 'Phone',
  phPhone: '+33 6 00 00 00 00',
  labelWebsite: 'Website',
  phWebsite: 'https://www.example.com',
  labelCategory: 'Desired partnership type *',
  optionCategoryPlaceholder: 'Select a category',
  categorySuper: 'Super partner (naming, main activations)',
  categoryMajor: 'Major partner (production, cash prize, equipment)',
  categoryCultural: 'Cultural partner (outreach, talents, workshops)',
  categoryOther: 'Other / Not sure yet',
  labelBudget: 'Indicative budget',
  optionBudgetPlaceholder: 'Select a range (optional)',
  budgetLt500: 'Under 500 EUR',
  budget500to1000: '500 - 1000 EUR',
  budget1000to3000: '1000 - 3000 EUR',
  budget3000to5000: '3000 - 5000 EUR',
  budgetGt5000: 'Over 5000 EUR',
  budgetInKind: 'In-kind support (equipment, services)',
  budgetToDiscuss: 'To be discussed',
  labelMessage: 'Your message *',
  phMessage:
    'Introduce your company and what you expect from this partnership...',
  submit: 'Send my request',
  submitting: 'Sending...',
  cancel: 'Cancel',
  errorCompanyRequired: 'The company name is required.',
  errorContactRequired: 'The contact name is required.',
  errorEmailRequired: 'The email is required.',
  errorCategoryRequired: 'Please select a category.',
  errorMessageRequired: 'The message is required.',
  errorSendGeneric: 'Error while sending.',
  errorSendFallback: 'Something went wrong while sending.',
};
