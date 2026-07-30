import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useToast } from '@/components/Toast';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import {
  validateFieldDefinitions,
  type RegistrationField,
} from '@/utils/registrationFields';
import { ACTIVE_WOMEN_TOURNAMENT_ID } from '@/utils/activeEdition';

/** Valeur d'une réponse à un champ d'inscription personnalisé. */
type FieldValue = string | number | boolean;

// Idempotency-Key pour un POST public/anonyme (pas de session Supabase, donc
// useIdempotentMutation/useAdminFetch ne s'appliquent pas ici). On génère une
// clé stable par intention utilisateur : tant qu'une création n'a pas réussi,
// un double-submit / retry réseau renvoie la MÊME clé (dédup côté serveur si
// honorée), et le bouton est verrouillé pendant la soumission.
function genIdempotencyKey(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type CreateResponse = {
  team: {
    id: string;
    name: string;
    slug?: string | null;
  };
  members?: {
    id: string | null;
    user_id: string;
    role: string;
    captain: boolean;
    battle_tag: string;
  }[];
  tournament?: {
    tournament_name: string;
    stages_count: number;
  };
  info?: string;
  error?: string;
  // Code machine-readable renvoyé par le serveur sur les réponses d'erreur
  // (cf. contrat §1). Le client le mappe vers une chaîne localisée.
  code?: string;
  // Champ(s) mis en cause par une erreur (p.ex. INVALID_URL → 'logo_url').
  fields?: Record<string, string> | string[];
  fieldErrors?: Record<string, string>;
  // Pont magic-link : présent sur la réponse 201 quand le serveur a émis un
  // lien de connexion au capitaine. Le token n'est jamais renvoyé (preuve de
  // possession via l'email) — seule l'adresse masquée est exposée.
  accessEmail?: { sent: boolean; to: string };
};

type TournamentInfo = {
  id: string;
  name: string;
  game: string | null;
  start_date: string | null;
};

type MemberForm = {
  id: string;
  email: string;
  role: string;
  battleTag: string;
  specialty: string;
};

// Regex partagée BattleTag (Pseudo#0000). Utilisée à la fois pour la
// validation par étape (client) et la garde finale avant submit.
const BATTLE_TAG_REGEX = /^[A-Za-z0-9]{2,}#[0-9]{3,6}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** true si `v` est vide OU une URL http(s) valide. */
function isValidHttpUrl(v: string): boolean {
  if (!v.trim()) return true;
  try {
    const u = new URL(v.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Initiales (1-2 lettres) pour le logo/avatar de l'aperçu live. */
function getInitials(source: string): string {
  const s = source.trim();
  if (!s) return '';
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return s.slice(0, 2).toUpperCase();
}

// ── Petits SVG inline (0 dépendance) ───────────────────────────────────────
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function CrownIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 7l4 4 5-6 5 6 4-4v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7z" />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" />
    </svg>
  );
}

export default function PublicCreateTeamPage() {
  const t = useT('teamCreate');
  const locale = useLocale();
  const router = useRouter();
  // Source unique de vérité pour l'édition active (comme les landing pages) :
  // à défaut d'un `?tournament=<id>` explicite, on cible le tournoi féminin
  // en cours importé depuis utils/activeEdition.
  const tournamentIdParam =
    typeof router.query.tournament === 'string'
      ? router.query.tournament
      : ACTIVE_WOMEN_TOURNAMENT_ID;

  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [country, setCountry] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [website, setWebsite] = useState('');
  const [description, setDescription] = useState('');
  const [discord, setDiscord] = useState('');
  const [members, setMembers] = useState<MemberForm[]>([
    {
      id: 'm-0',
      email: '',
      role: 'player',
      battleTag: '',
      specialty: '',
    },
  ]);
  const [captainIndex, setCaptainIndex] = useState<number | null>(0);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<CreateResponse | null>(null);
  const { addToast } = useToast();
  // Clé d'idempotence courante : régénérée après chaque création réussie pour
  // qu'une nouvelle équipe soit bien une nouvelle intention (non dédupliquée).
  const idempotencyKeyRef = useRef<string>(genIdempotencyKey());
  const [tournamentInfo, setTournamentInfo] = useState<TournamentInfo | null>(
    null
  );
  // Champs d'inscription personnalisés du tournoi cible (DÉFINITIONS, pas les
  // réponses). Chargés avec le tournoi puis validés via validateFieldDefinitions.
  const [registrationFields, setRegistrationFields] = useState<
    RegistrationField[]
  >([]);
  // Réponses saisies, indexées par clé de champ. Envoyées telles quelles dans
  // `field_values` du POST — le serveur re-valide et coerce (cf.
  // validateRegistrationAnswers).
  const [fieldValues, setFieldValues] = useState<Record<string, FieldValue>>(
    {}
  );
  // Erreurs par champ renvoyées par l'API (400 { fieldErrors }), affichées
  // inline sous chaque champ.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Captcha anti-bot (endpoint public + création de comptes côté serveur).
  // On récupère un challenge HMAC depuis /api/captcha au montage et après
  // chaque soumission (le token est à usage unique / TTL 5 min).
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaQuestion, setCaptchaQuestion] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  // Honeypot : champ caché, jamais rempli par un humain.
  const [honeypot, setHoneypot] = useState('');

  // Wizard 3 étapes : 1 Identité, 2 Roster, 3 Tournoi & envoi. On valide chaque
  // étape côté client (validateStep) avant d'autoriser « Suivant » ; les erreurs
  // s'affichent inline sous chaque champ une fois celui-ci « touché » (blur).
  const TOTAL_STEPS = 3;
  const [step, setStep] = useState(1);
  // Champs « touchés » (blur) : la validation inline ne s'affiche qu'après une
  // première interaction, pour ne pas agresser dès la première frappe.
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const markTouched = (key: string) =>
    setTouched((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  // Focus déplacé sur le titre de l'étape à chaque changement (a11y).
  const stepHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const hasMountedRef = useRef(false);
  useEffect(() => {
    // On ne vole pas le focus au premier rendu (page fraîche).
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    stepHeadingRef.current?.focus();
  }, [step]);

  const refreshCaptcha = () => {
    fetch('/api/captcha')
      .then((r) => r.json())
      .then((data) => {
        if (data?.token && data?.question) {
          setCaptchaToken(data.token);
          setCaptchaQuestion(data.question);
          setCaptchaAnswer('');
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    refreshCaptcha();
  }, []);

  useEffect(() => {
    if (!tournamentIdParam) return;
    fetch(`/api/tournaments`)
      .then((r) => r.json())
      .then((data) => {
        const found = data.tournaments?.find(
          (t: any) => t.id === tournamentIdParam
        );
        if (found) {
          setTournamentInfo({
            id: found.id,
            name: found.name,
            game: found.game,
            start_date: found.start_date,
          });
          // Les définitions jsonb sont brutes : on les passe par le validateur
          // partagé pour obtenir un tableau typé et nettoyé (options select,
          // maxLength borné…). On initialise ensuite les valeurs par défaut
          // (checkbox → false, autres → chaîne vide) pour un état contrôlé.
          const defs = validateFieldDefinitions(found.registration_fields);
          const fields = defs.ok ? defs.fields : [];
          setRegistrationFields(fields);
          setFieldValues((prev) => {
            const next: Record<string, FieldValue> = {};
            for (const f of fields) {
              next[f.key] = prev[f.key] ?? (f.type === 'checkbox' ? false : '');
            }
            return next;
          });
        } else {
          setRegistrationFields([]);
        }
      })
      .catch(() => {});
  }, [tournamentIdParam]);

  function handleFieldChange(key: string, value: FieldValue) {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
    // Efface l'erreur inline du champ dès que l'utilisateur le modifie.
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function addMemberRow() {
    setMembers((prev) => {
      if (prev.length >= 5) return prev;
      return [
        ...prev,
        {
          id: `m-${Date.now().toString(36)}-${prev.length}`,
          email: '',
          role: 'player',
          battleTag: '',
          specialty: '',
        },
      ];
    });
  }

  function removeMemberRow(index: number) {
    setMembers((prev) => {
      if (prev.length === 1) return prev;
      const next = prev.filter((_, i) => i !== index);
      if (captainIndex !== null) {
        if (captainIndex === index) {
          setCaptainIndex(null);
        } else if (index < captainIndex) {
          setCaptainIndex(captainIndex - 1);
        }
      }
      return next;
    });
  }

  function handleMemberChange(
    index: number,
    field: keyof MemberForm,
    value: string
  ) {
    setMembers((prev) =>
      prev.map((m, i) => (i === index ? { ...m, [field]: value } : m))
    );
  }

  // ── Validateurs par champ (message localisé ou undefined) ────────────────
  function nameError(): string | undefined {
    const trimmed = name.trim();
    if (!trimmed) return t.validationNameRequired;
    if (trimmed.length < 2) return t.validationNameTooShort;
    if (trimmed.length > 100) return t.validationNameTooLong;
    return undefined;
  }
  function urlError(value: string, msg: string): string | undefined {
    return isValidHttpUrl(value) ? undefined : msg;
  }
  function memberEmailError(idx: number): string | undefined {
    const email = members[idx]?.email.trim() ?? '';
    if (!email) return undefined;
    return EMAIL_REGEX.test(email)
      ? undefined
      : format(t.validationEmailInvalid, { email });
  }
  function memberBattleTagError(idx: number): string | undefined {
    const m = members[idx];
    if (!m || m.email.trim().length === 0) return undefined;
    const bt = m.battleTag.trim();
    if (tournamentIdParam) {
      if (!bt || !BATTLE_TAG_REGEX.test(bt)) return t.errorBattleTagRequired;
    } else if (bt && !BATTLE_TAG_REGEX.test(bt)) {
      return t.errorBattleTagInvalid;
    }
    return undefined;
  }

  // Validation client d'une étape : renvoie la liste des messages de blocage
  // (vide = étape valide). Reproduit côté client les invariants serveur pour
  // un feedback immédiat, sans se substituer à la re-validation serveur.
  function validateStep(target: number): string[] {
    const errs: string[] = [];
    if (target === 1) {
      const n = nameError();
      if (n) errs.push(n);
      const lu = urlError(logoUrl, t.validationLogoUrl);
      if (lu) errs.push(lu);
      const w = urlError(website, t.validationWebsiteUrl);
      if (w) errs.push(w);
      const d = urlError(discord, t.validationDiscordUrl);
      if (d) errs.push(d);
    } else if (target === 2) {
      const filled = members
        .map((_, i) => i)
        .filter((i) => members[i].email.trim().length > 0);
      for (const i of filled) {
        const e = memberEmailError(i);
        if (e) errs.push(e);
      }
      if (filled.length > 0 && captainIndex === null) {
        errs.push(t.validationCaptainRequired);
      }
      for (const i of filled) {
        const bt = memberBattleTagError(i);
        if (bt && !errs.includes(bt)) errs.push(bt);
      }
    }
    return errs;
  }

  /** true si l'étape courante est valide (pilote l'état du bouton Suivant). */
  function isStepValid(target: number): boolean {
    return validateStep(target).length === 0;
  }

  function markStepTouched(target: number) {
    setTouched((prev) => {
      const next = { ...prev };
      if (target === 1) {
        next.name = true;
        next.logoUrl = true;
        next.website = true;
        next.discord = true;
      } else if (target === 2) {
        members.forEach((_, i) => {
          next[`member-${i}-email`] = true;
          next[`member-${i}-battleTag`] = true;
        });
        next.captain = true;
      }
      return next;
    });
  }

  function goToStep(target: number) {
    if (target === step) return;
    // Reculer est toujours autorisé (le stepper permet de revenir).
    if (target < step) {
      setStep(target);
      return;
    }
    // Avancer : chaque étape intermédiaire doit être valide.
    for (let s = step; s < target; s++) {
      if (!isStepValid(s)) {
        markStepTouched(s);
        setStep(s);
        return;
      }
    }
    setStep(target);
  }

  /** Map code serveur → message localisé (contrat §1). */
  function localizedCode(code?: string): string | undefined {
    if (!code) return undefined;
    const map: Record<string, string> = {
      RATE_LIMITED: t.errRateLimited,
      HONEYPOT: t.errHoneypot,
      CAPTCHA_INVALID: t.errCaptchaInvalid,
      NAME_REQUIRED: t.errNameRequired,
      NAME_TOO_SHORT: t.errNameTooShort,
      NAME_TOO_LONG: t.errNameTooLong,
      DESCRIPTION_TOO_LONG: t.errDescriptionTooLong,
      INVALID_URL: t.errInvalidUrl,
      TOO_MANY_MEMBERS: t.errTooManyMembers,
      CAPTAIN_REQUIRED: t.errCaptainRequired,
      MULTIPLE_CAPTAINS: t.errMultipleCaptains,
      BATTLETAG_REQUIRED: t.errBattletagRequired,
      BATTLETAG_INVALID: t.errBattletagInvalid,
      FIELD_ERRORS: t.errFieldErrors,
      SLUG_CONFLICT: t.errSlugConflict,
      TENANT_UNKNOWN: t.errTenantUnknown,
      SERVICE_UNAVAILABLE: t.errServiceUnavailable,
      SERVER_ERROR: t.errServerError,
    };
    return map[code];
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Le submit natif du formulaire (touche Entrée ou bouton) ne doit envoyer
    // qu'à l'étape finale. Sur les étapes 1-2, on avance à la place.
    if (step < TOTAL_STEPS) {
      goToStep(step + 1);
      return;
    }
    // Garde anti double-submit : si une soumission est déjà en cours, on ignore.
    if (loading) return;
    setLoading(true);
    setErrorMsg(null);
    setFieldErrors({});
    setResult(null);

    try {
      const battleTagRegex = /^[A-Za-z0-9]{2,}#[0-9]{3,6}$/;
      const preparedMembers = members
        .map((m, idx) => ({
          email: m.email.trim(),
          role: m.role.trim() || 'player',
          battle_tag: m.battleTag.trim(),
          specialty: m.specialty.trim() || null,
          set_captain: captainIndex === idx,
        }))
        .filter((m) => m.email.length > 0);

      // Lot 6 : BattleTag obligatoire uniquement quand l'équipe est créée
      // dans le cadre d'une inscription à un tournoi (tournamentIdParam set).
      // Hors tournoi, le champ reste validé s'il est saisi mais peut être
      // laissé vide — utile pour les équipes "scrim only".
      if (tournamentIdParam) {
        const missingBattle = preparedMembers.find(
          (m) => !m.battle_tag || !battleTagRegex.test(m.battle_tag)
        );
        if (preparedMembers.length && missingBattle) {
          throw new Error(t.errorBattleTagRequired);
        }
      } else {
        const invalidBattle = preparedMembers.find(
          (m) => m.battle_tag && !battleTagRegex.test(m.battle_tag)
        );
        if (invalidBattle) {
          throw new Error(t.errorBattleTagInvalid);
        }
      }

      const payload = {
        name,
        short_name: shortName || null,
        logo_url: logoUrl || null,
        country: country || null,
        website: website || null,
        description: description || null,
        discord: discord || null,
        members: preparedMembers,
        tournament_id: tournamentIdParam || null,
        // Réponses aux champs d'inscription personnalisés (vide si le tournoi
        // n'en définit aucun). Le serveur les valide/coerce et bloque en 400
        // { fieldErrors } si un champ requis manque.
        field_values: registrationFields.length ? fieldValues : undefined,
        captchaToken,
        captchaAnswer,
        honeypot,
      };

      const res = await fetch('/api/teams/create-with-member', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKeyRef.current,
        },
        body: JSON.stringify(payload),
      });

      const json: CreateResponse = await res.json();

      if (!res.ok || (json as any)?.error) {
        // Le token captcha est à usage unique : on en récupère un nouveau pour
        // que l'utilisateur puisse réessayer sans recharger la page.
        refreshCaptcha();
        // Erreurs par champ (champs d'inscription personnalisés) → affichage
        // inline sous chaque champ, en plus du message global.
        if (json?.fieldErrors) {
          setFieldErrors(json.fieldErrors);
        }
        // Priorité au code machine-readable localisé (contrat §1), fallback sur
        // le message FR du serveur puis un message générique.
        const message =
          localizedCode(json?.code) ||
          (json as any)?.error ||
          t.errorCreateFailed;
        throw new Error(message);
      }

      // Création réussie : nouvelle clé pour une éventuelle prochaine équipe.
      idempotencyKeyRef.current = genIdempotencyKey();
      setResult(json);
      // Message fixe et distinct du panneau "Résultat" (qui affiche json.info)
      // pour éviter tout doublon de texte à l'écran. On précise que les
      // co-équipières sont INVITÉES (en attente d'acceptation), pas ajoutées
      // immédiatement à l'équipe.
      addToast(t.toastCreated, 'success');
      setName('');
      setShortName('');
      setCountry('');
      setLogoUrl('');
      setWebsite('');
      setDescription('');
      setDiscord('');
      setMembers([
        { id: 'm-0', email: '', role: 'player', battleTag: '', specialty: '' },
      ]);
      setCaptainIndex(null);
      // Réinitialise les réponses aux champs personnalisés (valeurs par défaut).
      setFieldValues(() => {
        const next: Record<string, FieldValue> = {};
        for (const f of registrationFields) {
          next[f.key] = f.type === 'checkbox' ? false : '';
        }
        return next;
      });
      setFieldErrors({});
      setTouched({});
      setStep(1);
      // Nouveau challenge captcha pour une éventuelle prochaine création.
      refreshCaptcha();
    } catch (err: unknown) {
      const message = (err as Error)?.message ?? t.errorUnexpected;
      setErrorMsg(message);
      addToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }

  const teamSlug = result?.team?.slug || result?.team?.id;

  // ── Dérivés d'aperçu / état visuel ────────────────────────────────────────
  const steps = [
    { n: 1, label: t.stepIdentity },
    { n: 2, label: t.stepRoster },
    { n: 3, label: t.stepSubmit },
  ];
  const stepState = (n: number): 'done' | 'current' | 'todo' =>
    n < step ? 'done' : n === step ? 'current' : 'todo';
  const currentStepValid = isStepValid(step);
  const currentStepReason = currentStepValid
    ? undefined
    : validateStep(step)[0];
  const hasLogo = logoUrl.trim().length > 0 && isValidHttpUrl(logoUrl);
  const previewInitials = getInitials(name) || '?';
  const filledMemberIdx = members
    .map((_, i) => i)
    .filter((i) => members[i].email.trim().length > 0);
  // Inscription tournoi « à moitié échouée » : on a demandé une inscription
  // (tournamentIdParam) mais le serveur n'a pas confirmé de tournoi → NEEDS_REVIEW.
  const tournamentHalfFailed =
    !!result && !!tournamentIdParam && !result.tournament;

  const inputCls =
    'w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--color-violet)]/70 focus:border-[var(--color-violet)]/70 transition';
  const labelCls =
    'block text-xs font-semibold uppercase tracking-[0.14em] text-gray-300 mb-2';
  const errCls = 'mt-1.5 text-xs text-[var(--status-error)]';
  const primaryBtn =
    'inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-violet)] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-[var(--color-violet)]/30 transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet)] focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:brightness-100';
  const secondaryBtn =
    'inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40';

  // ── Aperçu live : carte d'équipe qui se construit en temps réel ───────────
  const teamPreview = (
    <div className="card-brand rounded-3xl bg-white/[0.05] p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-300">
          {t.previewTitle}
        </h2>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-green)]/40 bg-[var(--color-green)]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-green-light)]">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-[var(--color-green)]"
          />
          {t.previewLive}
        </span>
      </div>

      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#160b28] via-[#1b0f33] to-[#0f0820] p-5">
        <div className="flex items-center gap-4">
          {hasLogo ? (
            <div
              role="img"
              aria-label={name || t.previewNamePlaceholder}
              className="h-16 w-16 shrink-0 rounded-2xl bg-cover bg-center ring-1 ring-white/15"
              style={{ backgroundImage: `url("${logoUrl.trim()}")` }}
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--color-violet)]/70 to-[var(--color-green)]/50 text-xl font-black text-white ring-1 ring-white/15">
              {previewInitials}
            </div>
          )}
          <div className="min-w-0">
            <p
              className={`truncate text-lg font-bold ${
                name ? 'text-white' : 'text-gray-500'
              }`}
            >
              {name || t.previewNamePlaceholder}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
              {shortName && (
                <span className="rounded-md border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono uppercase text-gray-200">
                  {shortName}
                </span>
              )}
              {country && (
                <span className="inline-flex items-center gap-1">
                  <GlobeIcon className="h-3.5 w-3.5 text-[var(--color-violet-light)]" />
                  {country}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5">
          {filledMemberIdx.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {members.map((m, idx) =>
                m.email.trim() ? (
                  <li key={m.id} className="relative">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white ring-1 ring-white/15">
                      {m.email.trim()[0]?.toUpperCase() || '?'}
                    </div>
                    {captainIndex === idx && (
                      <span
                        title={t.captainLabel}
                        className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-yellow)] text-black ring-2 ring-[#160b28]"
                      >
                        <CrownIcon className="h-2.5 w-2.5" />
                        <span className="sr-only">{t.captainLabel}</span>
                      </span>
                    )}
                  </li>
                ) : null
              )}
            </ul>
          ) : (
            <p className="text-xs text-gray-500">{t.previewRosterEmpty}</p>
          )}
        </div>
      </div>

      <div className="mt-5 space-y-1.5 text-xs text-gray-400">
        <p>• {t.note2}</p>
        <p>• {t.note4}</p>
      </div>
    </div>
  );

  // ── Vue succès (célébrative), construite depuis `result` ──────────────────
  const successView = result && (
    <div className="mx-auto max-w-2xl">
      <div className="card-brand overflow-hidden rounded-3xl bg-white/[0.05]">
        <div className="relative bg-gradient-to-br from-[var(--color-violet)]/25 via-[#1b0f33] to-[var(--color-green)]/15 px-6 py-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-green)] text-black shadow-lg shadow-[var(--color-green)]/40">
            <CheckIcon className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-black text-white">{t.successHeading}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-emerald-50/80">
            {result.info || t.resultCreatedFallback}
          </p>
        </div>

        <div className="space-y-4 p-6">
          <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--color-violet)]/70 to-[var(--color-green)]/50 text-lg font-black text-white ring-1 ring-white/15">
              {getInitials(result.team.name) || '?'}
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-bold text-white">
                {result.team.name}
              </p>
              <p className="truncate text-xs text-gray-500">
                {t.resultIdLabel} {result.team.id}
              </p>
            </div>
          </div>

          {result.tournament && (
            <div className="rounded-2xl border border-[var(--color-violet)]/40 bg-[var(--color-violet)]/10 px-4 py-3 text-sm text-[var(--color-violet-light)]">
              {format(t.resultRegistered, {
                name: result.tournament.tournament_name,
              })}
            </div>
          )}

          {tournamentHalfFailed && (
            <div className="rounded-2xl border border-[var(--status-warning)]/50 bg-[var(--status-warning)]/10 px-4 py-3">
              <p className="text-sm font-semibold text-[var(--status-warning)]">
                {t.partialWarningTitle}
              </p>
              <p className="mt-1 text-xs text-amber-100/80">
                {t.partialWarningDesc}
              </p>
              <p className="mt-1 text-xs text-amber-100/80">
                {t.partialWarningAction}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href="/support"
                  className="inline-flex items-center justify-center rounded-full border border-[var(--status-warning)]/50 bg-[var(--status-warning)]/15 px-4 py-2 text-xs font-semibold text-[var(--status-warning)] transition hover:bg-[var(--status-warning)]/25"
                >
                  {t.contactStaffCta}
                </Link>
              </div>
            </div>
          )}

          {result.accessEmail?.sent && (
            <div className="rounded-2xl border border-[var(--color-green)]/40 bg-[var(--color-green)]/10 px-4 py-4">
              <p className="text-sm font-semibold text-[var(--color-green-light)]">
                {t.accessEmailTitle}
              </p>
              <p className="mt-1 text-xs text-emerald-50/80">
                {format(t.accessEmailSent, { to: result.accessEmail.to })}
              </p>
              <Link
                href="/login"
                className="mt-3 inline-flex items-center justify-center rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
              >
                {t.goToLogin}
              </Link>
            </div>
          )}

          {result.members && result.members.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
              <p className="text-sm font-semibold text-white">
                {t.invitedPlayers}
              </p>
              <p className="mt-0.5 text-[11px] text-gray-400">
                {t.invitedPlayersHint}
              </p>
              <ul className="mt-3 space-y-1.5 text-xs text-gray-300">
                {result.members.map((m) => (
                  <li
                    key={`${m.user_id}-${m.id ?? 'new'}`}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <span className="font-mono break-all">{m.user_id}</span>
                    <span className="text-gray-500">·</span>
                    <span>
                      {t.memberRoleLabel} {m.role}
                    </span>
                    <span className="text-gray-500">·</span>
                    <span>
                      {t.memberCaptainLabel} {m.captain ? t.yes : t.no}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            {teamSlug && (
              <Link href={`/team/${teamSlug}`} className={primaryBtn}>
                {t.viewTeamPage}
              </Link>
            )}
            <button
              type="button"
              onClick={() => setResult(null)}
              className={secondaryBtn}
            >
              {t.createAnother}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── Formulaire wizard ─────────────────────────────────────────────────────
  const wizardForm = (
    <div className="grid items-start gap-6 lg:grid-cols-[1.7fr_1fr]">
      <form
        onSubmit={handleSubmit}
        className="order-last space-y-6 rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-2xl shadow-black/40 sm:p-6 lg:order-first"
      >
        {/* Stepper de progression */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-violet-light)]">
              {format(t.stepLabel, { current: step, total: TOTAL_STEPS })}
            </p>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[var(--color-violet)] via-[var(--color-green)] to-[var(--color-yellow)] transition-[width] duration-500 ease-out"
              style={{
                width: `${((step - 1) / (TOTAL_STEPS - 1)) * 100}%`,
              }}
            />
          </div>
          <ol className="mt-4 grid grid-cols-3 gap-1.5 sm:gap-2">
            {steps.map((s) => {
              const state = stepState(s.n);
              return (
                <li key={s.n}>
                  <button
                    type="button"
                    onClick={() => goToStep(s.n)}
                    disabled={s.n > step}
                    aria-current={state === 'current' ? 'step' : undefined}
                    className="flex w-full items-center gap-2 rounded-xl px-1.5 py-2 text-left transition enabled:hover:bg-white/5 disabled:cursor-not-allowed sm:px-2"
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
                        state === 'done'
                          ? 'bg-[var(--color-green)] text-black'
                          : state === 'current'
                            ? 'bg-[var(--color-violet)] text-white ring-2 ring-[var(--color-violet)]/40'
                            : 'border border-white/20 bg-white/5 text-gray-400'
                      }`}
                    >
                      {state === 'done' ? (
                        <CheckIcon className="h-3.5 w-3.5" />
                      ) : (
                        s.n
                      )}
                    </span>
                    <span
                      className={`hidden truncate text-xs font-semibold sm:block ${
                        state === 'todo' ? 'text-gray-500' : 'text-white'
                      }`}
                    >
                      {s.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        {/* ── Étape 1 — Identité ── */}
        {step === 1 && (
          <section key="step-1" className="wizard-step-enter space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-gray-400">
                  {t.teamInfoEyebrow}
                </p>
                <h2
                  ref={stepHeadingRef}
                  tabIndex={-1}
                  className="text-xl font-semibold outline-none"
                >
                  {t.mainDetailsTitle}
                </h2>
              </div>
              <Link href="/" className="text-sm text-gray-300 hover:text-white">
                {t.backHomeArrow}
              </Link>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="team-name" className={labelCls}>
                  {t.nameLabel} *
                </label>
                <input
                  id="team-name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => markTouched('name')}
                  aria-invalid={touched.name && !!nameError()}
                  aria-describedby={
                    touched.name && nameError() ? 'err-name' : undefined
                  }
                  className={inputCls}
                  placeholder={t.namePlaceholder}
                />
                {touched.name && nameError() && (
                  <p id="err-name" className={errCls}>
                    {nameError()}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="team-short" className={labelCls}>
                  {t.shortNameLabel}
                </label>
                <input
                  id="team-short"
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value)}
                  className={inputCls}
                  placeholder="OWC"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="team-country" className={labelCls}>
                  {t.countryLabel}
                </label>
                <input
                  id="team-country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className={inputCls}
                  placeholder={t.countryPlaceholder}
                />
              </div>

              <div>
                <label htmlFor="team-discord" className={labelCls}>
                  {t.discordLabel}
                </label>
                <input
                  id="team-discord"
                  value={discord}
                  onChange={(e) => setDiscord(e.target.value)}
                  onBlur={() => markTouched('discord')}
                  aria-invalid={touched.discord && !isValidHttpUrl(discord)}
                  aria-describedby={
                    touched.discord && !isValidHttpUrl(discord)
                      ? 'err-discord'
                      : undefined
                  }
                  className={inputCls}
                  placeholder="https://discord.gg/…"
                />
                {touched.discord && !isValidHttpUrl(discord) && (
                  <p id="err-discord" className={errCls}>
                    {t.validationDiscordUrl}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="team-logo" className={labelCls}>
                  {t.logoLabel}
                </label>
                <input
                  id="team-logo"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  onBlur={() => markTouched('logoUrl')}
                  aria-invalid={touched.logoUrl && !isValidHttpUrl(logoUrl)}
                  aria-describedby={
                    touched.logoUrl && !isValidHttpUrl(logoUrl)
                      ? 'err-logo'
                      : undefined
                  }
                  className={inputCls}
                  placeholder="https://…png"
                />
                {touched.logoUrl && !isValidHttpUrl(logoUrl) && (
                  <p id="err-logo" className={errCls}>
                    {t.validationLogoUrl}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="team-website" className={labelCls}>
                  {t.websiteLabel}
                </label>
                <input
                  id="team-website"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  onBlur={() => markTouched('website')}
                  aria-invalid={touched.website && !isValidHttpUrl(website)}
                  aria-describedby={
                    touched.website && !isValidHttpUrl(website)
                      ? 'err-website'
                      : undefined
                  }
                  className={inputCls}
                  placeholder="https://…"
                />
                {touched.website && !isValidHttpUrl(website) && (
                  <p id="err-website" className={errCls}>
                    {t.validationWebsiteUrl}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="team-desc" className={labelCls}>
                {t.descriptionLabel}
              </label>
              <textarea
                id="team-desc"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={inputCls}
                placeholder={t.descriptionPlaceholder}
              />
            </div>
          </section>
        )}

        {/* ── Étape 2 — Roster ── */}
        {step === 2 && (
          <section key="step-2" className="wizard-step-enter space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-gray-400">
                  {t.rosterEyebrow}
                </p>
                <h2
                  ref={stepHeadingRef}
                  tabIndex={-1}
                  className="text-xl font-semibold outline-none"
                >
                  {t.rosterTitle}
                </h2>
              </div>
              <span className="text-xs text-gray-400">{t.rosterMax}</span>
            </div>

            <div className="space-y-3">
              {members.map((member, idx) => {
                const emailErr = touched[`member-${idx}-email`]
                  ? memberEmailError(idx)
                  : undefined;
                const btErr = touched[`member-${idx}-battleTag`]
                  ? memberBattleTagError(idx)
                  : undefined;
                return (
                  <div
                    key={member.id}
                    className={`rounded-2xl border bg-white/[0.04] p-4 transition ${
                      captainIndex === idx
                        ? 'border-[var(--color-yellow)]/40 ring-1 ring-[var(--color-yellow)]/20'
                        : 'border-white/10'
                    }`}
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white ring-1 ring-white/15">
                          {member.email.trim()[0]?.toUpperCase() || idx + 1}
                        </span>
                        <span className="text-sm font-semibold text-gray-200">
                          #{idx + 1}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <label
                          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                            captainIndex === idx
                              ? 'border-[var(--color-yellow)]/60 bg-[var(--color-yellow)]/15 text-[var(--color-yellow)]'
                              : 'border-white/15 text-gray-300 hover:border-white/30'
                          }`}
                        >
                          <input
                            type="radio"
                            name="captain"
                            className="sr-only"
                            checked={captainIndex === idx}
                            onChange={() => {
                              setCaptainIndex(idx);
                              markTouched('captain');
                            }}
                          />
                          <CrownIcon className="h-3 w-3" />
                          {t.captainLabel}
                        </label>
                        {members.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeMemberRow(idx)}
                            className="rounded-full p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
                            aria-label={t.removeMember}
                            title={t.removeMember}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2}
                              strokeLinecap="round"
                              className="h-4 w-4"
                              aria-hidden="true"
                            >
                              <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label
                          htmlFor={`member-${idx}-email`}
                          className={labelCls}
                        >
                          {t.emailLabel}
                        </label>
                        <input
                          id={`member-${idx}-email`}
                          type="email"
                          value={member.email}
                          onChange={(e) =>
                            handleMemberChange(idx, 'email', e.target.value)
                          }
                          onBlur={() => markTouched(`member-${idx}-email`)}
                          aria-invalid={!!emailErr}
                          aria-describedby={
                            emailErr ? `err-member-${idx}-email` : undefined
                          }
                          className={inputCls}
                          placeholder={t.emailPlaceholder}
                        />
                        {emailErr && (
                          <p id={`err-member-${idx}-email`} className={errCls}>
                            {emailErr}
                          </p>
                        )}
                      </div>

                      <div className="grid gap-3 md:grid-cols-3">
                        <div>
                          <label
                            htmlFor={`member-${idx}-role`}
                            className={labelCls}
                          >
                            {t.roleLabel}
                          </label>
                          <select
                            id={`member-${idx}-role`}
                            value={member.role}
                            onChange={(e) =>
                              handleMemberChange(idx, 'role', e.target.value)
                            }
                            className={inputCls}
                          >
                            <option value="player">{t.roleOptionPlayer}</option>
                            <option value="coach">{t.roleOptionCoach}</option>
                            <option value="sub">{t.roleOptionSub}</option>
                          </select>
                        </div>

                        <div>
                          <label
                            htmlFor={`member-${idx}-specialty`}
                            className={labelCls}
                          >
                            {t.specialtyLabel}
                          </label>
                          <select
                            id={`member-${idx}-specialty`}
                            value={member.specialty}
                            onChange={(e) =>
                              handleMemberChange(
                                idx,
                                'specialty',
                                e.target.value
                              )
                            }
                            className={inputCls}
                          >
                            <option value="">{t.specialtyNone}</option>
                            <option value="tank">{t.specialtyTank}</option>
                            <option value="dps">{t.specialtyDps}</option>
                            <option value="support">
                              {t.specialtySupport}
                            </option>
                            <option value="flex">{t.specialtyFlex}</option>
                          </select>
                        </div>

                        <div>
                          <label
                            htmlFor={`member-${idx}-btag`}
                            className={labelCls}
                          >
                            {t.battleTagLabel}
                            {tournamentIdParam ? ' *' : ''}
                          </label>
                          <input
                            id={`member-${idx}-btag`}
                            value={member.battleTag}
                            onChange={(e) =>
                              handleMemberChange(
                                idx,
                                'battleTag',
                                e.target.value
                              )
                            }
                            onBlur={() =>
                              markTouched(`member-${idx}-battleTag`)
                            }
                            aria-invalid={!!btErr}
                            aria-describedby={
                              btErr ? `err-member-${idx}-btag` : undefined
                            }
                            className={inputCls}
                            placeholder={t.battleTagPlaceholder}
                            required={
                              !!tournamentIdParam &&
                              member.email.trim().length > 0
                            }
                          />
                          {btErr ? (
                            <p id={`err-member-${idx}-btag`} className={errCls}>
                              {btErr}
                            </p>
                          ) : (
                            !tournamentIdParam && (
                              <p className="mt-1 text-[10px] text-gray-500">
                                {t.battleTagOptionalNote}
                              </p>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {touched.captain &&
              filledMemberIdx.length > 0 &&
              captainIndex === null && (
                <p className={errCls}>{t.validationCaptainRequired}</p>
              )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={addMemberRow}
                disabled={members.length >= 5}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  members.length >= 5
                    ? 'cursor-not-allowed border border-white/10 bg-white/5 text-gray-500'
                    : 'border border-[var(--color-green)]/40 bg-[var(--color-green)]/10 text-[var(--color-green-light)] hover:bg-[var(--color-green)]/20'
                }`}
              >
                <span aria-hidden="true">+</span>
                {t.addMember}
              </button>
              <p className="text-xs text-gray-400">{t.addMemberHint}</p>
            </div>
          </section>
        )}

        {/* ── Étape 3 — Tournoi & envoi ── */}
        {step === 3 && (
          <section key="step-3" className="wizard-step-enter space-y-5">
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-gray-400">
                {t.customFieldsEyebrow}
              </p>
              <h2
                ref={stepHeadingRef}
                tabIndex={-1}
                className="text-xl font-semibold outline-none"
              >
                {t.stepSubmit}
              </h2>
            </div>

            {registrationFields.length > 0 && (
              <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <h3 className="text-sm font-semibold text-white">
                  {t.customFieldsTitle}
                </h3>
                {registrationFields.map((field) => {
                  const value = fieldValues[field.key];
                  const stringValue =
                    typeof value === 'string'
                      ? value
                      : typeof value === 'number'
                        ? String(value)
                        : '';
                  const rawError = fieldErrors[field.key];
                  const fieldError = rawError
                    ? rawError === 'Ce champ est requis.'
                      ? t.customFieldRequiredError
                      : rawError
                    : undefined;
                  const controlId = `custom-field-${field.key}`;
                  const describedBy = field.help
                    ? `${controlId}-help`
                    : undefined;

                  if (field.type === 'checkbox') {
                    return (
                      <div key={field.key}>
                        <label className="inline-flex items-start gap-2 text-sm text-gray-200">
                          <input
                            id={controlId}
                            type="checkbox"
                            checked={value === true}
                            onChange={(e) =>
                              handleFieldChange(field.key, e.target.checked)
                            }
                            aria-describedby={describedBy}
                            className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/60"
                          />
                          <span>
                            {field.label}
                            {field.required && (
                              <span className="text-[var(--color-green)]">
                                {' '}
                                {t.customFieldRequiredMark}
                              </span>
                            )}
                          </span>
                        </label>
                        {field.help && (
                          <p
                            id={describedBy}
                            className="mt-1 text-[11px] text-gray-500"
                          >
                            {field.help}
                          </p>
                        )}
                        {fieldError && (
                          <p className="mt-1 text-xs text-[var(--status-error)]">
                            {fieldError}
                          </p>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div key={field.key}>
                      <label htmlFor={controlId} className={labelCls}>
                        {field.label}
                        {field.required && (
                          <span className="text-[var(--color-green)]">
                            {' '}
                            {t.customFieldRequiredMark}
                          </span>
                        )}
                      </label>

                      {field.type === 'textarea' ? (
                        <textarea
                          id={controlId}
                          rows={4}
                          required={field.required}
                          maxLength={field.maxLength}
                          value={stringValue}
                          onChange={(e) =>
                            handleFieldChange(field.key, e.target.value)
                          }
                          aria-describedby={describedBy}
                          className={inputCls}
                        />
                      ) : field.type === 'select' ? (
                        <select
                          id={controlId}
                          required={field.required}
                          value={stringValue}
                          onChange={(e) =>
                            handleFieldChange(field.key, e.target.value)
                          }
                          aria-describedby={describedBy}
                          className={inputCls}
                        >
                          <option value="">
                            {t.customFieldSelectPlaceholder}
                          </option>
                          {(field.options ?? []).map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          id={controlId}
                          type={
                            field.type === 'number'
                              ? 'number'
                              : field.type === 'url'
                                ? 'url'
                                : 'text'
                          }
                          required={field.required}
                          maxLength={
                            field.type === 'text' ? field.maxLength : undefined
                          }
                          value={stringValue}
                          onChange={(e) =>
                            handleFieldChange(field.key, e.target.value)
                          }
                          aria-describedby={describedBy}
                          className={inputCls}
                        />
                      )}

                      {field.help && (
                        <p
                          id={describedBy}
                          className="mt-1 text-[11px] text-gray-500"
                        >
                          {field.help}
                        </p>
                      )}
                      {fieldError && (
                        <p className="mt-1 text-xs text-[var(--status-error)]">
                          {fieldError}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <label htmlFor="captcha" className={labelCls}>
                {t.captchaLabel} *
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-xl border border-white/15 bg-black/60 px-3 py-2 font-mono text-sm text-white">
                  {captchaQuestion ? `${captchaQuestion} = ?` : '… = ?'}
                </span>
                <input
                  id="captcha"
                  required
                  inputMode="numeric"
                  value={captchaAnswer}
                  onChange={(e) => setCaptchaAnswer(e.target.value)}
                  className="w-32 rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-[var(--color-violet)]/70 focus:outline-none focus:ring-2 focus:ring-[var(--color-violet)]/70"
                  placeholder={t.captchaPlaceholder}
                />
                <button
                  type="button"
                  onClick={refreshCaptcha}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  {t.captchaRefresh}
                </button>
              </div>
            </div>

            {errorMsg && (
              <div
                role="alert"
                aria-live="polite"
                className="rounded-xl border border-[var(--status-error)]/50 bg-[var(--status-error)]/10 px-3 py-2 text-sm text-red-100"
              >
                {errorMsg}
              </div>
            )}
          </section>
        )}

        {/* Honeypot : caché aux humains (aria-hidden + hors flux), piège à bots. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '-9999px',
            width: '1px',
            height: '1px',
            overflow: 'hidden',
          }}
        >
          <label>
            Ne pas remplir
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />
          </label>
        </div>

        {/* Navigation wizard */}
        <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-5">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => goToStep(step - 1)}
              className={secondaryBtn}
            >
              ← {t.previous}
            </button>
          ) : (
            <Link href="/" className={secondaryBtn}>
              {t.backHome}
            </Link>
          )}

          {step < TOTAL_STEPS ? (
            <button
              type="button"
              onClick={() => goToStep(step + 1)}
              disabled={!currentStepValid}
              title={currentStepReason}
              className={primaryBtn}
            >
              {t.next} →
            </button>
          ) : (
            <button type="submit" disabled={loading} className={primaryBtn}>
              {loading && (
                <span
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                />
              )}
              {loading ? t.submitting : t.submit}
            </button>
          )}
        </div>
      </form>

      {/* Aperçu live — au-dessus sur mobile, colonne droite sticky sur desktop */}
      <div className="order-first lg:order-last lg:sticky lg:top-28">
        {teamPreview}
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-black via-[#0b0b12] to-black px-4 pb-16 pt-24 text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-40 -top-16 h-[420px] w-[420px] rounded-full bg-[var(--color-violet)]/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 top-40 h-[360px] w-[360px] rounded-full bg-[var(--color-green)]/15 blur-3xl"
      />

      <div className="relative mx-auto max-w-5xl">
        <header className="mb-10 space-y-3 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-gray-300">
            <span className="rounded-full bg-gradient-to-r from-[var(--color-violet)] to-[var(--color-green)] px-2 py-[2px] font-semibold text-white">
              {t.badgePublic}
            </span>
            <span>{t.badgeTeam}</span>
          </div>
          <h1 className="text-3xl font-bold md:text-4xl">{t.title}</h1>
          <p className="mx-auto max-w-2xl text-sm text-gray-300">
            {t.subtitle}
          </p>
        </header>

        {tournamentInfo && (
          <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-[var(--color-violet)]/30 bg-[var(--color-violet)]/5 px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-violet-light)]">
                {t.tournamentEyebrow}
              </p>
              <p className="text-sm text-purple-50/90">
                {t.tournamentRegisteredText}{' '}
                <span className="font-semibold text-white">
                  {tournamentInfo.name}
                </span>
                {tournamentInfo.start_date && (
                  <>
                    {' '}
                    —{' '}
                    {new Date(tournamentInfo.start_date).toLocaleDateString(
                      locale,
                      { day: 'numeric', month: 'long', year: 'numeric' }
                    )}
                  </>
                )}
              </p>
            </div>
          </div>
        )}

        <div className="mb-8 grid gap-4 md:grid-cols-2">
          <div className="flex flex-col justify-between gap-3 rounded-2xl border border-[var(--color-green)]/30 bg-[var(--color-green)]/5 px-4 py-3 sm:flex-row sm:items-center">
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-green-light)]">
                {t.registrationsEyebrow}
              </p>
              <p className="text-sm text-emerald-50/90">
                {t.registrationsDesc}
              </p>
            </div>
            <Link
              href="/timeline-2026"
              className="inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--color-green)] px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110"
            >
              {t.viewTimeline}
            </Link>
          </div>

          <div className="flex flex-col justify-between gap-3 rounded-2xl border border-[var(--color-violet)]/30 bg-gradient-to-br from-[var(--color-violet)]/10 via-white/[0.02] to-[var(--color-green)]/10 px-4 py-3 sm:flex-row sm:items-center">
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-violet-light)]">
                {t.firstTimeEyebrow}
              </p>
              <p className="text-sm text-purple-50/90">{t.firstTimeDesc}</p>
            </div>
            <Link
              href="/guide/gerer-mon-equipe"
              className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              {t.viewGuide}
            </Link>
          </div>
        </div>

        {result ? successView : wizardForm}
      </div>
    </div>
  );
}

const publicCreateTeamSeo: SeoProps = {
  title: {
    fr: 'Créer une équipe',
    en: 'Create a team',
  },
  description: {
    fr: 'Crée ton équipe OW Women’s Cup et ajoute rapidement ton roster complet (emails existants ou comptes créés automatiquement).',
    en: 'Create your OW Women’s Cup team and quickly add your full roster (existing emails or auto-created accounts).',
  },
};

PublicCreateTeamPage.seo = publicCreateTeamSeo;
