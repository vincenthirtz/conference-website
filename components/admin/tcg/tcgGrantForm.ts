// components/admin/tcg/tcgGrantForm.ts
//
// Logique PURE de la carte « Ajuster un solde » (`TcgGrantCard.tsx`) :
// validation du formulaire, lecture des erreurs de `POST /api/admin/tcg/grant`,
// et durée de vie de la clé d'idempotence.
//
// POURQUOI UN MODULE À PART. Rendre le composant demanderait une bibliothèque de
// test DOM que la politique zéro dépendance interdit ; ce qui peut mal tourner
// sans bruit — un montant `0` accepté, une clé réutilisée pour une autre
// intention, un 409 lu comme une panne réseau — vit donc ici, testable seul
// (`tests/unit/adminTcgGrantForm.test.ts`).
//
// AUCUN IMPORT DE CODE SERVEUR, NI MÊME DU HOOK `useAdminFetch`. Les erreurs
// sont lues par leur FORME (`status`, `payload.code`, `isBgSyncQueued`) plutôt
// que par `instanceof` : importer la classe ferait entrer le client Supabase
// dans le test, et un util serveur dans ce fichier gonflerait le bundle admin
// sans la moindre erreur de compilation.
//
// UNE CORRECTION TRACÉE, PAS UNE BOUTIQUE. Rien ici ne connaît de prix : la
// monnaie se gagne, et ce formulaire ne sert qu'à réparer un solde faux.

/** Bornes du contrat de `POST /api/admin/tcg/grant` — à garder en phase. */
export const GRANT_MAX_ABS_AMOUNT = 10_000;
export const GRANT_REASON_MIN = 3;
export const GRANT_REASON_MAX = 500;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

/* ---------------------------------------------------------------------------
 * Validation
 * ------------------------------------------------------------------------- */

export type GrantAmountError = 'required' | 'notInteger' | 'zero' | 'tooLarge';
export type GrantReasonError = 'required' | 'tooShort' | 'tooLong';
export type GrantUserError = 'required' | 'invalid';

export type GrantFormInput = {
  userId: string | null;
  /** Valeur BRUTE du champ : la conversion en nombre est le travail d'ici. */
  amount: string;
  reason: string;
};

export type GrantFormValue = {
  userId: string;
  amount: number;
  reason: string;
};

export type GrantFormErrors = {
  userId?: GrantUserError;
  amount?: GrantAmountError;
  reason?: GrantReasonError;
};

export type GrantFormResult =
  | { ok: true; value: GrantFormValue }
  | { ok: false; errors: GrantFormErrors };

/**
 * Lit un montant signé.
 *
 * Une expression régulière et non `Number()` : `Number('1e3')`, `Number(' ')`
 * ou `Number('0x10')` rendent un entier, et un champ `type="number"` laisse
 * passer `1e3`. Un ajustement de solde doit être ce qu'on a tapé, chiffre par
 * chiffre — pas ce que JavaScript a bien voulu en comprendre.
 */
export function parseGrantAmount(
  raw: string
): { ok: true; amount: number } | { ok: false; error: GrantAmountError } {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '-' || trimmed === '+') {
    return { ok: false, error: 'required' };
  }
  if (!/^[+-]?\d+$/.test(trimmed)) return { ok: false, error: 'notInteger' };
  const amount = Number(trimmed);
  // `-0` compris : un mouvement nul n'existe pas dans le registre (le schéma
  // refuse `amount = 0`), autant le dire avant l'aller-retour.
  if (amount === 0) return { ok: false, error: 'zero' };
  if (!Number.isSafeInteger(amount) || Math.abs(amount) > GRANT_MAX_ABS_AMOUNT)
    return { ok: false, error: 'tooLarge' };
  return { ok: true, amount };
}

/**
 * Valide le formulaire entier et rend soit la valeur prête à envoyer, soit
 * TOUTES les erreurs d'un coup — corriger un champ pour découvrir l'erreur du
 * suivant au clic d'après est la façon la plus sûre d'abandonner un formulaire.
 *
 * Le motif est envoyé ÉLAGUÉ, et c'est sa longueur élaguée qui compte : trois
 * espaces ne sont pas une explication, et le journal staff doit en porter une.
 */
export function validateGrantForm(input: GrantFormInput): GrantFormResult {
  const errors: GrantFormErrors = {};

  const userId = input.userId?.trim() ?? '';
  if (userId === '') errors.userId = 'required';
  else if (!isUuid(userId)) errors.userId = 'invalid';

  const parsed = parseGrantAmount(input.amount);
  if (!parsed.ok) errors.amount = parsed.error;

  const reason = input.reason.trim();
  if (reason === '') errors.reason = 'required';
  else if (reason.length < GRANT_REASON_MIN) errors.reason = 'tooShort';
  else if (reason.length > GRANT_REASON_MAX) errors.reason = 'tooLong';

  if (errors.userId || errors.amount || errors.reason || !parsed.ok) {
    return { ok: false, errors };
  }
  return { ok: true, value: { userId, amount: parsed.amount, reason } };
}

/* ---------------------------------------------------------------------------
 * Erreurs de l'endpoint
 * ------------------------------------------------------------------------- */

/**
 * Ce que l'interface sait formuler. Les trois premiers sont les `code` stables
 * du contrat ; les suivants se déduisent du statut ou de la nature de l'échec.
 */
export type GrantErrorKind =
  | 'invalidBody'
  | 'userNotFound'
  | 'insufficientBalance'
  /**
   * Hors du contrat initial mais rendu par l'endpoint : un achat a débité le
   * même porte-monnaie pendant le retrait. Rien n'a été écrit ; relancer suffit.
   */
  | 'balanceChanged'
  | 'forbidden'
  | 'rateLimited'
  /** Mise en file de synchronisation différée : partira à la reconnexion. */
  | 'queued'
  /** La requête n'a peut-être jamais atteint le serveur. */
  | 'network'
  /** 5xx ou forme inattendue : l'écriture a PU avoir lieu. */
  | 'unknown';

function readProp(value: unknown, key: string): unknown {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

/**
 * Classe une erreur levée par `mutateJson`.
 *
 * LE `code` PRIME SUR LE STATUT : c'est lui que le contrat déclare stable, le
 * message n'est qu'un repli et le statut peut être partagé par plusieurs causes.
 * Le statut ne sert qu'aux cas que le contrat ne nomme pas (droits, limite de
 * fréquence).
 */
export function classifyGrantError(err: unknown): GrantErrorKind {
  if (readProp(err, 'isBgSyncQueued') === true) return 'queued';

  const code = readProp(readProp(err, 'payload'), 'code');
  if (code === 'INVALID_BODY') return 'invalidBody';
  if (code === 'USER_NOT_FOUND') return 'userNotFound';
  if (code === 'INSUFFICIENT_BALANCE') return 'insufficientBalance';
  if (code === 'BALANCE_CHANGED') return 'balanceChanged';

  const status = readProp(err, 'status');
  if (typeof status === 'number') {
    if (status === 400) return 'invalidBody';
    // PAS de 404 → `userNotFound` sans le code : une route absente (déploiement
    // incomplet) répond aussi 404, et accuser le compte enverrait chercher la
    // panne au mauvais endroit.
    if (status === 401 || status === 403) return 'forbidden';
    if (status === 429) return 'rateLimited';
    return 'unknown';
  }
  // `fetch` rejette en `TypeError` quand la requête ne part pas.
  if (err instanceof TypeError) return 'network';
  return 'unknown';
}

/**
 * Le solde DISPONIBLE que l'endpoint joint à un refus `INSUFFICIENT_BALANCE`,
 * ou `null`. Dire « il reste 120 pièces » vaut mieux que « solde insuffisant » :
 * c'est le chiffre dont on a besoin pour corriger le montant.
 */
export function grantErrorAvailableBalance(err: unknown): number | null {
  const balance = readProp(readProp(err, 'payload'), 'balance');
  return typeof balance === 'number' && Number.isFinite(balance)
    ? balance
    : null;
}

/**
 * Faut-il GARDER la clé d'idempotence pour un nouvel essai de la même
 * intention ?
 *
 * OUI quand on ignore si le serveur a écrit — coupure réseau, 5xx, mise en
 * file : renvoyer avec la même clé fait rejouer la première réponse au lieu de
 * créditer deux fois. C'est tout l'intérêt de la clé.
 *
 * NON quand le serveur a répondu un refus explicite : rien n'a été écrit, et
 * garder la clé risquerait de rejouer ce refus mis en cache alors que la
 * situation a changé entre-temps (le solde a été recrédité, le compte existe
 * finalement).
 */
export function shouldKeepIdempotencyKey(kind: GrantErrorKind): boolean {
  return kind === 'network' || kind === 'queued' || kind === 'unknown';
}

/**
 * Empreinte d'une intention. Deux envois de même empreinte sont « le même
 * envoi » et partagent leur clé ; changer la joueuse, le montant ou le motif en
 * fait une nouvelle intention, donc une nouvelle clé — sinon le serveur rejouerait
 * l'ancienne réponse pour une correction différente.
 */
export function grantIntentSignature(value: GrantFormValue): string {
  return JSON.stringify([value.userId, value.amount, value.reason]);
}

/* ---------------------------------------------------------------------------
 * Lecture de la réponse
 * ------------------------------------------------------------------------- */

export type GrantSuccess = {
  entryId: string | null;
  balance: number | null;
  replayed: boolean;
};

/**
 * Revalide la réponse 200. Un solde absent reste `null` et s'affiche comme tel :
 * inventer un `0` ferait lire « compte vidé » là où l'on ne sait rien.
 */
export function normalizeGrantSuccess(raw: unknown): GrantSuccess {
  const entryId = readProp(raw, 'entryId');
  const balance = readProp(raw, 'balance');
  return {
    entryId: typeof entryId === 'string' ? entryId : null,
    balance:
      typeof balance === 'number' && Number.isFinite(balance) ? balance : null,
    replayed: readProp(raw, 'replayed') === true,
  };
}

/* ---------------------------------------------------------------------------
 * Nom lisible d'un compte
 * ------------------------------------------------------------------------- */

/** Les huit premiers caractères d'un uuid, pour qu'il reste repérable. */
export function shortUserId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

/**
 * Le nom sous lequel l'écran désigne un compte : pseudo, puis BattleTag, puis
 * email, puis identifiant tronqué. Partagé par la carte d'ajustement et la file
 * de photos, pour qu'une même joueuse ne porte pas deux noms d'un écran à
 * l'autre.
 *
 * Une chaîne vide ou faite d'espaces compte comme absente : le profil vit dans
 * `raw_user_meta_data`, où un pseudo effacé laisse souvent `""` plutôt que rien.
 */
export function adminUserLabel(user: {
  id: string;
  displayName?: string | null;
  battleTag?: string | null;
  email?: string | null;
}): string {
  for (const candidate of [user.displayName, user.battleTag, user.email]) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return shortUserId(user.id);
}
