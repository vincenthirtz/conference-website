// lib/i18n/locales/fr/partnerRequest.ts
//
// Traductions FRANCAISES du namespace `partnerRequest` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('partnerRequest', {
  backToPartners: 'Retour aux partenaires',
  pageTitle: 'Devenir partenaire',
  intro:
    'Remplissez ce formulaire pour nous présenter votre projet de partenariat. Notre équipe vous recontactera rapidement pour construire ensemble une collaboration sur-mesure.',
  successTitle: 'Demande envoyée !',
  successMessage:
    'Merci pour votre intérêt ! Notre équipe examinera votre demande et vous recontactera dans les plus brefs délais.',
  labelCompany: "Nom de l'entreprise / organisation *",
  phCompany: 'Votre entreprise',
  labelContact: 'Nom du contact *',
  phContact: 'Prénom Nom',
  labelEmail: 'Email *',
  phEmail: 'contact@entreprise.com',
  labelPhone: 'Téléphone',
  phPhone: '+33 6 00 00 00 00',
  labelWebsite: 'Site web',
  phWebsite: 'https://www.exemple.com',
  labelCategory: 'Type de partenariat souhaité *',
  optionCategoryPlaceholder: 'Sélectionnez une catégorie',
  categorySuper: 'Super partenaire (naming, activations principales)',
  categoryMajor: 'Partenaire majeur (production, cashprize, matériel)',
  categoryCultural: 'Partenaire culturel (médiation, talents, ateliers)',
  categoryOther: 'Autre / Je ne sais pas encore',
  labelBudget: 'Budget indicatif',
  optionBudgetPlaceholder: 'Sélectionnez une fourchette (optionnel)',
  budgetLt500: 'Moins de 500 EUR',
  budget500to1000: '500 - 1000 EUR',
  budget1000to3000: '1000 - 3000 EUR',
  budget3000to5000: '3000 - 5000 EUR',
  budgetGt5000: 'Plus de 5000 EUR',
  budgetInKind: 'Soutien en nature (matériel, services)',
  budgetToDiscuss: 'À discuter',
  labelMessage: 'Votre message *',
  phMessage:
    'Présentez votre entreprise et vos attentes pour ce partenariat...',
  submit: 'Envoyer ma demande',
  submitting: 'Envoi en cours...',
  cancel: 'Annuler',
  errorCompanyRequired: "Le nom de l'entreprise est requis.",
  errorContactRequired: 'Le nom du contact est requis.',
  errorEmailRequired: "L'email est requis.",
  errorCategoryRequired: 'Veuillez sélectionner une catégorie.',
  errorMessageRequired: 'Le message est requis.',
  errorSendGeneric: "Erreur lors de l'envoi.",
  errorSendFallback: "Une erreur est survenue lors de l'envoi.",
});
