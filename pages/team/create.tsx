import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useToast } from '@/components/Toast';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';

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

const WOMEN_TOURNAMENT_ID_2026 = 'e8fa740c-d92b-49d8-a654-05a37d0eea3b';

export default function PublicCreateTeamPage() {
  const t = useT('teamCreate');
  const locale = useLocale();
  const router = useRouter();
  const tournamentIdParam =
    typeof router.query.tournament === 'string'
      ? router.query.tournament
      : WOMEN_TOURNAMENT_ID_2026;

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

  // Captcha anti-bot (endpoint public + création de comptes côté serveur).
  // On récupère un challenge HMAC depuis /api/captcha au montage et après
  // chaque soumission (le token est à usage unique / TTL 5 min).
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaQuestion, setCaptchaQuestion] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  // Honeypot : champ caché, jamais rempli par un humain.
  const [honeypot, setHoneypot] = useState('');

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
        }
      })
      .catch(() => {});
  }, [tournamentIdParam]);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Garde anti double-submit : si une soumission est déjà en cours, on ignore.
    if (loading) return;
    setLoading(true);
    setErrorMsg(null);
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
        const message = (json as any)?.error || t.errorCreateFailed;
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

  return (
    <>
      <div className="min-h-screen bg-gradient-to-b from-black via-[#0b0b12] to-black text-white pt-24 pb-16 px-4">
        <div className="max-w-5xl mx-auto">
          <header className="mb-10 space-y-3 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] uppercase tracking-[0.18em] text-gray-300">
              <span className="px-2 py-[2px] rounded-full bg-emerald-400/90 text-black font-semibold">
                {t.badgePublic}
              </span>
              <span>{t.badgeTeam}</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold">{t.title}</h1>
            <p className="text-sm text-gray-300 max-w-2xl mx-auto">
              {t.subtitle}
            </p>
          </header>

          {tournamentInfo && (
            <div className="mb-8 rounded-2xl border border-blue-500/30 bg-blue-500/5 px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-blue-200/80">
                  {t.tournamentEyebrow}
                </p>
                <p className="text-sm text-blue-50/90">
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

          <div className="mb-8 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-emerald-200/80">
                {t.registrationsEyebrow}
              </p>
              <p className="text-sm text-emerald-50/90">
                {t.registrationsDesc}
              </p>
            </div>
            <Link
              href="/timeline-2026"
              className="inline-flex items-center justify-center px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-500 text-black hover:bg-emerald-400 transition"
            >
              {t.viewTimeline}
            </Link>
          </div>

          <div className="mb-8 rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-500/10 via-white/[0.02] to-cyan-500/10 px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-purple-200/80">
                {t.firstTimeEyebrow}
              </p>
              <p className="text-sm text-purple-50/90">{t.firstTimeDesc}</p>
            </div>
            <Link
              href="/guide/gerer-mon-equipe"
              className="inline-flex items-center justify-center px-4 py-2 rounded-xl text-sm font-semibold bg-white/10 border border-white/15 text-white hover:bg-white/20 transition whitespace-nowrap"
            >
              {t.viewGuide}
            </Link>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.8fr,1.2fr] items-start">
            <form
              onSubmit={handleSubmit}
              className="space-y-6 bg-white/[0.03] border border-white/10 rounded-2xl p-6 shadow-2xl shadow-black/40"
            >
              <section className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.14em] text-gray-400">
                      {t.teamInfoEyebrow}
                    </p>
                    <h2 className="text-xl font-semibold">
                      {t.mainDetailsTitle}
                    </h2>
                  </div>
                  <Link
                    href="/"
                    className="text-sm text-gray-300 hover:text-white"
                  >
                    {t.backHomeArrow}
                  </Link>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-gray-300 mb-2">
                      {t.nameLabel} *
                    </label>
                    <input
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/70 focus:border-emerald-400/70 transition"
                      placeholder={t.namePlaceholder}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-gray-300 mb-2">
                      {t.shortNameLabel}
                    </label>
                    <input
                      value={shortName}
                      onChange={(e) => setShortName(e.target.value)}
                      className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/70 focus:border-emerald-400/70 transition"
                      placeholder="OWC"
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-gray-300 mb-2">
                      {t.countryLabel}
                    </label>
                    <input
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/70 focus:border-emerald-400/70 transition"
                      placeholder={t.countryPlaceholder}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-gray-300 mb-2">
                      {t.discordLabel}
                    </label>
                    <input
                      value={discord}
                      onChange={(e) => setDiscord(e.target.value)}
                      className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/70 focus:border-emerald-400/70 transition"
                      placeholder="https://discord.gg/…"
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-gray-300 mb-2">
                      {t.logoLabel}
                    </label>
                    <input
                      value={logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                      className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/70 focus:border-emerald-400/70 transition"
                      placeholder="https://…png"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-gray-300 mb-2">
                      {t.websiteLabel}
                    </label>
                    <input
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/70 focus:border-emerald-400/70 transition"
                      placeholder="https://…"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-gray-300 mb-2">
                    {t.descriptionLabel}
                  </label>
                  <textarea
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/70 focus:border-emerald-400/70 transition"
                    placeholder={t.descriptionPlaceholder}
                  />
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.14em] text-gray-400">
                      {t.rosterEyebrow}
                    </p>
                    <h3 className="text-lg font-semibold">{t.rosterTitle}</h3>
                  </div>
                  <span className="text-xs text-gray-400">{t.rosterMax}</span>
                </div>

                <div className="space-y-3">
                  {members.map((member, idx) => (
                    <div
                      key={member.id}
                      className="rounded-xl border border-white/10 bg-white/5 p-3 grid gap-3 md:grid-cols-[1.2fr_0.9fr_1.1fr_0.9fr_auto] items-center"
                    >
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-gray-300 mb-1">
                          {t.emailLabel} {idx + 1}
                        </label>
                        <input
                          type="email"
                          value={member.email}
                          onChange={(e) =>
                            handleMemberChange(idx, 'email', e.target.value)
                          }
                          className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/70 focus:border-emerald-400/70 transition"
                          placeholder={t.emailPlaceholder}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-gray-300 mb-1">
                          {t.roleLabel}
                        </label>
                        <input
                          value={member.role}
                          onChange={(e) =>
                            handleMemberChange(idx, 'role', e.target.value)
                          }
                          className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/70 focus:border-emerald-400/70 transition"
                          placeholder="player / coach / sub"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-gray-300 mb-1">
                          {t.battleTagLabel}
                          {tournamentIdParam ? ' *' : ''}
                        </label>
                        <input
                          value={member.battleTag}
                          onChange={(e) =>
                            handleMemberChange(idx, 'battleTag', e.target.value)
                          }
                          className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/70 focus:border-emerald-400/70 transition"
                          placeholder={t.battleTagPlaceholder}
                          required={
                            !!tournamentIdParam &&
                            member.email.trim().length > 0
                          }
                        />
                        {!tournamentIdParam && (
                          <p className="mt-1 text-[10px] text-gray-500">
                            {t.battleTagOptionalNote}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-gray-300 mb-1">
                          {t.specialtyLabel}
                        </label>
                        <select
                          value={member.specialty}
                          onChange={(e) =>
                            handleMemberChange(idx, 'specialty', e.target.value)
                          }
                          className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-400/70 focus:border-emerald-400/70 transition"
                        >
                          <option value="">{t.specialtyNone}</option>
                          <option value="tank">{t.specialtyTank}</option>
                          <option value="dps">{t.specialtyDps}</option>
                          <option value="support">{t.specialtySupport}</option>
                          <option value="flex">{t.specialtyFlex}</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-2 justify-between">
                        <label className="inline-flex items-center gap-2 text-xs text-gray-200">
                          <input
                            type="radio"
                            name="captain"
                            checked={captainIndex === idx}
                            onChange={() => setCaptainIndex(idx)}
                            className="h-4 w-4 rounded-full border-gray-500 bg-black/60"
                          />
                          <span>{t.captainLabel}</span>
                        </label>
                        {members.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeMemberRow(idx)}
                            className="text-xs text-gray-400 hover:text-white"
                          >
                            {t.removeMember}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={addMemberRow}
                    disabled={members.length >= 5}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                      members.length >= 5
                        ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                        : 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-100'
                    }`}
                  >
                    {t.addMember}
                  </button>
                  <p className="text-xs text-gray-400">{t.addMemberHint}</p>
                </div>
              </section>

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

              <section className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-gray-300">
                  {t.captchaLabel} *
                </label>
                <div className="flex items-center gap-3">
                  <span className="rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white font-mono">
                    {captchaQuestion ? `${captchaQuestion} = ?` : '… = ?'}
                  </span>
                  <input
                    required
                    inputMode="numeric"
                    value={captchaAnswer}
                    onChange={(e) => setCaptchaAnswer(e.target.value)}
                    className="w-32 rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/70 focus:border-emerald-400/70 transition"
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
              </section>

              {errorMsg && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="rounded-xl border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-100"
                >
                  {errorMsg}
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={loading}
                  className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition ${
                    loading
                      ? 'bg-neutral-700 cursor-not-allowed'
                      : 'bg-emerald-500 hover:bg-emerald-400 text-black'
                  }`}
                >
                  {loading ? t.submitting : t.submit}
                </button>

                <Link
                  href="/"
                  className="text-sm text-gray-300 hover:text-white"
                >
                  {t.backHome}
                </Link>
              </div>
            </form>

            <aside className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 space-y-4 sticky top-28">
              <h2 className="text-lg font-semibold">{t.resultTitle}</h2>

              {result ? (
                <div className="space-y-2 text-sm">
                  <div className="rounded-xl border border-emerald-500/60 bg-emerald-500/10 px-3 py-2 text-emerald-100">
                    {result.info || t.resultCreatedFallback}
                  </div>
                  <p className="text-gray-300">
                    {t.resultTeamLabel}{' '}
                    <span className="font-semibold">{result.team.name}</span>
                  </p>
                  <p className="text-gray-400 text-xs break-all">
                    {t.resultIdLabel} {result.team.id}
                  </p>
                  {result.tournament && (
                    <div className="rounded-xl border border-blue-500/60 bg-blue-500/10 px-3 py-2 text-blue-100">
                      {format(t.resultRegistered, {
                        name: result.tournament.tournament_name,
                      })}
                    </div>
                  )}
                  {teamSlug && (
                    <Link
                      href={`/team/${teamSlug}`}
                      className="inline-flex items-center gap-2 text-sm text-emerald-300 hover:text-white"
                    >
                      {t.viewTeamPage}
                    </Link>
                  )}

                  {result.members && result.members.length > 0 && (
                    <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 space-y-2">
                      <p className="text-sm font-semibold">
                        {t.invitedPlayers}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        {t.invitedPlayersHint}
                      </p>
                      <ul className="space-y-1 text-xs text-gray-300">
                        {result.members.map((m) => (
                          <li
                            key={`${m.user_id}-${m.id ?? 'new'}`}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <span className="font-mono break-all">
                              {m.user_id}
                            </span>
                            <span className="text-gray-400">·</span>
                            <span>
                              {t.memberRoleLabel} {m.role}
                            </span>
                            <span className="text-gray-400">·</span>
                            <span>
                              {t.memberCaptainLabel} {m.captain ? t.yes : t.no}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-300">{t.resultEmpty}</p>
              )}

              <div className="text-xs text-gray-400 space-y-1">
                <p>• {t.note1}</p>
                <p>• {t.note2}</p>
                <p>• {t.note3}</p>
                <p>• {t.note4}</p>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </>
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
