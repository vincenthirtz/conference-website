// components/TeamCreate/useTeamCreateWizard.ts — état, validations et envoi
// du wizard public /team/create (lot P11 : extrait de la page À L'IDENTIQUE —
// mêmes règles, même payload, même pont magic-link, mêmes codes d'erreur
// localisés). Page PUBLIQUE : ni TanStack ni module joueuse (garde de bundle
// tests/unit/adminBoundariesGuard.test.ts).

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useToast } from '@/components/Toast';
import { ANALYTICS_EVENTS, trackEvent } from '@/lib/analytics/track';
import { useT, format } from '@/lib/i18n/useT';
import type { RegistrationField } from '@/utils/registrationFields';
import { ACTIVE_WOMEN_TOURNAMENT_ID } from '@/utils/activeEdition';
import {
  BATTLE_TAG_REGEX,
  roleRequiresBattleTag,
  isNonPlayingTeamRole,
} from '@/utils/teams/roleKind';
import { MAX_TEAM_PLAYERS, MAX_ROSTER_ROWS } from '@/utils/constants';
import nsTeamCreate from '@/lib/i18n/locales/fr/teamCreate';
import type {
  FieldValue,
  CreateResponse,
  TournamentInfo,
  MemberForm,
} from './wizardModel';
import {
  EMAIL_REGEX,
  isValidHttpUrl,
  getInitials,
  genIdempotencyKey,
} from './wizardModel';

export function useTeamCreateWizard() {
  const t = useT(nsTeamCreate);
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
  // Qui crée l'équipe ? « captain » = la personne qui remplit le formulaire joue
  // et prend le capitanat (flux historique). « manager » = elle encadre sans
  // jouer : elle est ajoutée avec le rôle manager, reçoit le lien d'accès à
  // l'espace équipe, et TOUTES les joueuses du roster — capitaine désignée
  // comprise — sont invitées (le capitanat est attribué à l'acceptation).
  const [creatorRole, setCreatorRole] = useState<'captain' | 'manager'>(
    'captain'
  );
  const [managerEmail, setManagerEmail] = useState('');
  const isManagerMode = creatorRole === 'manager';

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<CreateResponse | null>(null);
  const { addToast } = useToast();
  // Clé d'idempotence courante : régénérée après chaque création réussie pour
  // qu'une nouvelle équipe soit bien une nouvelle intention (non dédupliquée).
  const idempotencyKeyRef = useRef<string>(genIdempotencyKey());
  const [, setTournamentInfo] = useState<TournamentInfo | null>(null);
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: un seul captcha au montage ; les suivants sont demandés explicitement (échec, renvoi)
  useEffect(() => {
    refreshCaptcha();
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `router` volontairement exclu — l'objet change à chaque navigation et relancerait cette requête pour rien ; seul l'identifiant du tournoi doit déclencher le chargement.
  useEffect(() => {
    if (!tournamentIdParam) return;
    fetch(`/api/tournaments`)
      .then((r) => r.json())
      .then((data) => {
        const found = (
          data.tournaments as
            | {
                id: string;
                name: string;
                game: string | null;
                start_date: string | null;
                /** Champs d'inscription personnalisés ; absents des versions
                 *  antérieures de l'API, d'où l'`Array.isArray` plus bas. */
                registration_fields?: RegistrationField[];
                /** Inscription individuelle : ce wizard n'est pas le bon écran. */
                solo_mode?: boolean;
                /** Inscription individuelle regroupée : même aiguillage. */
                pooled_teams?: boolean;
              }[]
            | undefined
        )?.find((t) => t.id === tournamentIdParam);
        // Tournoi en inscription individuelle : ce wizard demande un nom
        // d'équipe, un roster et un capitanat — trois questions sans objet.
        // On renvoie vers le formulaire solo plutôt que de laisser quelqu'un
        // créer une équipe d'une joueuse à la main. `replace` et non `push` :
        // le retour arrière doit ramener d'où l'on vient, pas ici.
        if (found?.solo_mode === true || found?.pooled_teams === true) {
          void router.replace(`/tournament/${found.id}/inscription-solo`);
          return;
        }
        if (found) {
          setTournamentInfo({
            id: found.id,
            name: found.name,
            game: found.game,
            start_date: found.start_date,
          });
          // /api/tournaments renvoie des définitions DÉJÀ validées et nettoyées
          // (options select, maxLength borné…) : le tableau est directement
          // exploitable. On initialise ensuite les valeurs par défaut
          // (checkbox → false, autres → chaîne vide) pour un état contrôlé.
          // `?? []` couvre une réponse d'une version antérieure de l'API.
          const fields: RegistrationField[] = Array.isArray(
            found.registration_fields
          )
            ? found.registration_fields
            : [];
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

  // Le plafond de 5 porte sur les JOUEUSES : une ligne coach ou manager ne
  // consomme pas de place de roster, sinon déclarer un coach coûtait une
  // joueuse à la création.
  const playingRowsCount = members.filter(
    (m) => !isNonPlayingTeamRole(m.role)
  ).length;
  /** Effectif jouant complet — seul l'ajout de JOUEUSES est alors fermé. */
  const rosterFull = playingRowsCount >= MAX_TEAM_PLAYERS;
  /** Plafond absolu de lignes, miroir de celui du serveur. */
  const rowsFull = members.length >= MAX_ROSTER_ROWS;

  /**
   * Ajoute une ligne de roster.
   *
   * Le rôle est un PARAMÈTRE, et c'est le cœur du correctif : la fonction
   * créait toujours une ligne `player`, donc à 5 joueuses le bouton ne faisait
   * plus rien — impossible de déclarer un coach ou un manager, alors même que
   * l'encadrement ne consomme aucune place de roster. Le plafond appliqué
   * dépend donc de ce qu'on ajoute :
   *   - une joueuse est bornée par MAX_TEAM_PLAYERS (l'effectif jouant) ;
   *   - un membre du staff n'est borné que par le plafond ABSOLU de lignes,
   *     celui que le serveur applique aussi (anti-abus, cf.
   *     pages/api/teams/create-with-member.ts).
   */
  function addMemberRow(role: 'player' | 'coach' = 'player') {
    setMembers((prev) => {
      if (prev.length >= MAX_ROSTER_ROWS) return prev;
      if (
        !isNonPlayingTeamRole(role) &&
        prev.filter((m) => !isNonPlayingTeamRole(m.role)).length >=
          MAX_TEAM_PLAYERS
      ) {
        return prev;
      }
      return [
        ...prev,
        {
          id: `m-${Date.now().toString(36)}-${prev.length}`,
          email: '',
          role,
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
  function managerEmailError(): string | undefined {
    if (!isManagerMode) return undefined;
    const email = managerEmail.trim().toLowerCase();
    if (!email) return t.validationManagerEmailRequired;
    if (!EMAIL_REGEX.test(email))
      return format(t.validationEmailInvalid, { email: managerEmail.trim() });
    // Le serveur rejette (MANAGER_DUPLICATE) : on le dit avant l'envoi.
    const clash = members.some(
      (m) => m.email.trim().toLowerCase() === email && m.email.trim().length > 0
    );
    if (clash) return t.validationManagerEmailDuplicate;
    return undefined;
  }
  function memberBattleTagError(idx: number): string | undefined {
    const m = members[idx];
    if (!m || m.email.trim().length === 0) return undefined;
    const bt = m.battleTag.trim();
    // Coach / manager : jamais obligatoire, même à l'inscription — ils ne
    // comptent pas dans le roster jouant (cf. utils/teams/addMember).
    if (tournamentIdParam && roleRequiresBattleTag(m.role)) {
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
      const me = managerEmailError();
      if (me) errs.push(me);
      for (const i of filled) {
        const e = memberEmailError(i);
        if (e) errs.push(e);
      }
      // En mode manager, la capitaine est facultative à la création : elle peut
      // être désignée plus tard depuis l'espace équipe (le manager pilote déjà
      // l'équipe). En mode capitaine, elle reste obligatoire dès qu'un membre
      // est saisi — sinon personne ne peut inviter le roster.
      if (!isManagerMode && filled.length > 0 && captainIndex === null) {
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
        next.managerEmail = true;
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
      MANAGER_EMAIL_INVALID: t.errManagerEmailInvalid,
      MANAGER_DUPLICATE: t.errManagerDuplicate,
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
      const battleTagRegex = BATTLE_TAG_REGEX;
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
          (m) =>
            roleRequiresBattleTag(m.role) &&
            (!m.battle_tag || !battleTagRegex.test(m.battle_tag))
        );
        if (preparedMembers.length && missingBattle) {
          throw new Error(t.errorBattleTagRequired);
        }
        // L'encadrement peut ne rien saisir, mais pas saisir n'importe quoi.
        const invalidStaffBattle = preparedMembers.find(
          (m) =>
            !roleRequiresBattleTag(m.role) &&
            m.battle_tag &&
            !battleTagRegex.test(m.battle_tag)
        );
        if (invalidStaffBattle) {
          throw new Error(t.errorBattleTagInvalid);
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
        // Mode manager : le serveur insère le manager (rôle `manager`), lui
        // envoie le magic-link et invite tout le roster en son nom.
        manager_email: isManagerMode ? managerEmail.trim() : undefined,
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

      if (!res.ok || json?.error) {
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
          localizedCode(json?.code) || json?.error || t.errorCreateFailed;
        throw new Error(message);
      }

      // Création réussie : nouvelle clé pour une éventuelle prochaine équipe.
      idempotencyKeyRef.current = genIdempotencyKey();
      setResult(json);
      // Message fixe et distinct du panneau "Résultat" (qui affiche json.info)
      // pour éviter tout doublon de texte à l'écran. On précise que les
      // co-équipières sont INVITÉES (en attente d'acceptation), pas ajoutées
      // immédiatement à l'équipe.
      trackEvent(ANALYTICS_EVENTS.teamCreated);
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
      setCreatorRole('captain');
      setManagerEmail('');
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
  // (tournamentIdParam) mais le serveur n'a NI inscrit l'équipe NI enregistré
  // de candidature → NEEDS_REVIEW. Une candidature déposée n'est pas un échec :
  // c'est le déroulé normal tant que les invitations n'ont pas été acceptées.
  const tournamentHalfFailed =
    !!result &&
    !!tournamentIdParam &&
    !result.tournament &&
    !result.tournament_application;

  const inputCls =
    'w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--color-violet)]/70 focus:border-[var(--color-violet)]/70 transition';
  const labelCls =
    'block text-xs font-semibold uppercase tracking-[0.14em] text-gray-300 mb-2';
  const errCls = 'mt-1.5 text-xs text-[var(--status-error)]';
  const primaryBtn =
    'inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-violet)] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-[var(--color-violet)]/30 transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet)] focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:brightness-100';
  const secondaryBtn =
    'inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40';

  return {
    t,
    router,
    tournamentIdParam,
    name,
    setName,
    shortName,
    setShortName,
    country,
    setCountry,
    logoUrl,
    setLogoUrl,
    website,
    setWebsite,
    description,
    setDescription,
    discord,
    setDiscord,
    members,
    setMembers,
    captainIndex,
    setCaptainIndex,
    creatorRole,
    setCreatorRole,
    managerEmail,
    setManagerEmail,
    isManagerMode,
    loading,
    setLoading,
    errorMsg,
    setErrorMsg,
    result,
    setResult,
    addToast,
    idempotencyKeyRef,
    setTournamentInfo,
    registrationFields,
    setRegistrationFields,
    fieldValues,
    setFieldValues,
    fieldErrors,
    setFieldErrors,
    captchaToken,
    setCaptchaToken,
    captchaQuestion,
    setCaptchaQuestion,
    captchaAnswer,
    setCaptchaAnswer,
    honeypot,
    setHoneypot,
    TOTAL_STEPS,
    step,
    setStep,
    touched,
    setTouched,
    markTouched,
    stepHeadingRef,
    refreshCaptcha,
    handleFieldChange,
    playingRowsCount,
    rosterFull,
    rowsFull,
    addMemberRow,
    removeMemberRow,
    handleMemberChange,
    nameError,
    urlError,
    memberEmailError,
    managerEmailError,
    memberBattleTagError,
    validateStep,
    isStepValid,
    markStepTouched,
    goToStep,
    localizedCode,
    handleSubmit,
    teamSlug,
    steps,
    stepState,
    currentStepValid,
    currentStepReason,
    hasLogo,
    previewInitials,
    filledMemberIdx,
    tournamentHalfFailed,
    inputCls,
    labelCls,
    errCls,
    primaryBtn,
    secondaryBtn,
  };
}

export type TeamCreateWizard = ReturnType<typeof useTeamCreateWizard>;
