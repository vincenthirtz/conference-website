// lib/i18n/locales/en/contactForm.ts
//
// Traductions ANGLAISES du namespace `contactForm`.
//
// La SOURCE DE VERITE est le francais (`../fr/contactForm.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  intro:
    "A question about the OW Women's Cup? Leave us a message, we reply fast.",
  sent: 'Message sent successfully.',
  nameLabel: 'Name',
  namePlaceholder: 'Ana Dupont',
  emailLabel: 'Email',
  emailPlaceholder: 'ana@email.com',
  subjectLabel: 'Subject',
  subjectPlaceholder: 'Choose a subject',
  subjectCast: 'Join the cast / desk',
  subjectTournament: 'Tournament info / rules',
  subjectTeams: 'Team registration',
  subjectPartner: 'Partnership / sponsor',
  subjectOther: 'Other question',
  messageLabel: 'Message',
  messagePlaceholder: 'Your message…',
  consent:
    'I agree that my information may be used to process my request. (No reselling.)',
  submitting: 'Sending…',
  submit: 'Send',
  successInline: 'Thanks! Your message has been sent 🎉',
  errorGeneric: 'An error occurred. Try again later.',
  errorNetwork: 'Unable to reach the service. Check your connection.',
};
