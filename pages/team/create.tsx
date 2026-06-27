import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useToast } from '@/components/Toast';

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
};

const WOMEN_TOURNAMENT_ID_2026 = 'e8fa740c-d92b-49d8-a654-05a37d0eea3b';

export default function PublicCreateTeamPage() {
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
          throw new Error(
            "BattleTag requis pour chaque membre (format Pseudo#0000) lors d'une inscription à un tournoi."
          );
        }
      } else {
        const invalidBattle = preparedMembers.find(
          (m) => m.battle_tag && !battleTagRegex.test(m.battle_tag)
        );
        if (invalidBattle) {
          throw new Error(
            'Format BattleTag invalide (attendu : Pseudo#0000). Laisse vide si tu préfères ne pas le renseigner.'
          );
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
        const message = (json as any)?.error || "Impossible de créer l'équipe";
        throw new Error(message);
      }

      // Création réussie : nouvelle clé pour une éventuelle prochaine équipe.
      idempotencyKeyRef.current = genIdempotencyKey();
      setResult(json);
      // Message fixe et distinct du panneau "Résultat" (qui affiche json.info)
      // pour éviter tout doublon de texte à l'écran.
      addToast('Inscription enregistrée 🎉', 'success');
      setName('');
      setShortName('');
      setCountry('');
      setLogoUrl('');
      setWebsite('');
      setDescription('');
      setDiscord('');
      setMembers([{ id: 'm-0', email: '', role: 'player', battleTag: '' }]);
      setCaptainIndex(null);
      // Nouveau challenge captcha pour une éventuelle prochaine création.
      refreshCaptcha();
    } catch (err: unknown) {
      const message = (err as Error)?.message ?? 'Erreur inattendue';
      setErrorMsg(message);
      addToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }

  const teamSlug = result?.team?.slug || result?.team?.id;

  return (
    <>
      <Head>
        <title>Créer une équipe | OW Women&apos;s Cup</title>
        <meta
          name="description"
          content="Crée une équipe et ajoute rapidement ton roster complet."
        />
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-black via-[#0b0b12] to-black text-white pt-24 pb-16 px-4">
        <div className="max-w-5xl mx-auto">
          <header className="mb-10 space-y-3 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] uppercase tracking-[0.18em] text-gray-300">
              <span className="px-2 py-[2px] rounded-full bg-emerald-400/90 text-black font-semibold">
                Public
              </span>
              <span>Équipe</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold">Créer une équipe</h1>
            <p className="text-sm text-gray-300 max-w-2xl mx-auto">
              Ajoute les infos principales de ton équipe et, si tu veux,
              renseigne tout le roster (emails existants ou comptes créés
              automatiquement) en une seule fois.
            </p>
          </header>

          {tournamentInfo && (
            <div className="mb-8 rounded-2xl border border-blue-500/30 bg-blue-500/5 px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-blue-200/80">
                  Inscription au tournoi
                </p>
                <p className="text-sm text-blue-50/90">
                  Ton équipe sera automatiquement inscrite au tournoi{' '}
                  <span className="font-semibold text-white">
                    {tournamentInfo.name}
                  </span>
                  {tournamentInfo.start_date && (
                    <>
                      {' '}
                      —{' '}
                      {new Date(tournamentInfo.start_date).toLocaleDateString(
                        'fr-FR',
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
                Inscriptions équipes
              </p>
              <p className="text-sm text-emerald-50/90">
                Les jalons et dates clés sont détaillés dans la roadmap.
                Consulte la timeline 2026 pour anticiper les prochaines étapes.
              </p>
            </div>
            <Link
              href="/timeline-2026"
              className="inline-flex items-center justify-center px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-500 text-black hover:bg-emerald-400 transition"
            >
              Voir la timeline 2026 ↗
            </Link>
          </div>

          <div className="mb-8 rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-500/10 via-white/[0.02] to-cyan-500/10 px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-purple-200/80">
                Première fois ?
              </p>
              <p className="text-sm text-purple-50/90">
                Découvre en images ce que tu peux faire depuis ton espace
                capitaine : roster, candidatures, scrims, check-in et
                messagerie.
              </p>
            </div>
            <Link
              href="/guide/gerer-mon-equipe"
              className="inline-flex items-center justify-center px-4 py-2 rounded-xl text-sm font-semibold bg-white/10 border border-white/15 text-white hover:bg-white/20 transition whitespace-nowrap"
            >
              Voir le guide capitaine ↗
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
                      Informations équipe
                    </p>
                    <h2 className="text-xl font-semibold">
                      Détails principaux
                    </h2>
                  </div>
                  <Link
                    href="/"
                    className="text-sm text-gray-300 hover:text-white"
                  >
                    ← Retour à l&apos;accueil
                  </Link>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-gray-300 mb-2">
                      Nom de l&apos;équipe *
                    </label>
                    <input
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/70 focus:border-emerald-400/70 transition"
                      placeholder="Ex : Phénix"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-gray-300 mb-2">
                      Tag / short name
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
                      Pays / région
                    </label>
                    <input
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/70 focus:border-emerald-400/70 transition"
                      placeholder="France, Europe…"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-gray-300 mb-2">
                      Discord / contact (optionnel)
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
                      Logo (URL)
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
                      Site web (optionnel)
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
                    Description
                  </label>
                  <textarea
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/70 focus:border-emerald-400/70 transition"
                    placeholder="Pitch rapide, palmarès, ambitions…"
                  />
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.14em] text-gray-400">
                      Roster (optionnel)
                    </p>
                    <h3 className="text-lg font-semibold">
                      Ajouter plusieurs joueuses
                    </h3>
                  </div>
                  <span className="text-xs text-gray-400">
                    Jusqu&apos;à 5 personnes
                  </span>
                </div>

                <div className="space-y-3">
                  {members.map((member, idx) => (
                    <div
                      key={member.id}
                      className="rounded-xl border border-white/10 bg-white/5 p-3 grid gap-3 md:grid-cols-[1.2fr_0.9fr_1.1fr_auto] items-center"
                    >
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-gray-300 mb-1">
                          Email {idx + 1}
                        </label>
                        <input
                          type="email"
                          value={member.email}
                          onChange={(e) =>
                            handleMemberChange(idx, 'email', e.target.value)
                          }
                          className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/70 focus:border-emerald-400/70 transition"
                          placeholder="joueuse@email.tld"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-gray-300 mb-1">
                          Rôle
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
                          BattleTag{tournamentIdParam ? ' *' : ''}
                        </label>
                        <input
                          value={member.battleTag}
                          onChange={(e) =>
                            handleMemberChange(idx, 'battleTag', e.target.value)
                          }
                          className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/70 focus:border-emerald-400/70 transition"
                          placeholder="Pseudo#0000"
                          required={
                            !!tournamentIdParam &&
                            member.email.trim().length > 0
                          }
                        />
                        {!tournamentIdParam && (
                          <p className="mt-1 text-[10px] text-gray-500">
                            Optionnel hors inscription tournoi.
                          </p>
                        )}
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
                          <span>Capitaine</span>
                        </label>
                        {members.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeMemberRow(idx)}
                            className="text-xs text-gray-400 hover:text-white"
                          >
                            Retirer
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
                    Ajouter une personne
                  </button>
                  <p className="text-xs text-gray-400">
                    On recherche l&apos;utilisateur par email ; si aucun compte
                    n&apos;existe, il est créé automatiquement avant d&apos;être
                    ajouté.
                  </p>
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
                  Vérification anti-bot *
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
                    placeholder="Réponse"
                  />
                  <button
                    type="button"
                    onClick={refreshCaptcha}
                    className="text-xs text-gray-400 hover:text-white"
                  >
                    Autre question ↻
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
                  {loading ? 'Création...' : "Créer l'équipe"}
                </button>

                <Link
                  href="/"
                  className="text-sm text-gray-300 hover:text-white"
                >
                  Retour à l&apos;accueil
                </Link>
              </div>
            </form>

            <aside className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 space-y-4 sticky top-28">
              <h2 className="text-lg font-semibold">Résultat</h2>

              {result ? (
                <div className="space-y-2 text-sm">
                  <div className="rounded-xl border border-emerald-500/60 bg-emerald-500/10 px-3 py-2 text-emerald-100">
                    {result.info || 'Équipe créée'}
                  </div>
                  <p className="text-gray-300">
                    Équipe :{' '}
                    <span className="font-semibold">{result.team.name}</span>
                  </p>
                  <p className="text-gray-400 text-xs break-all">
                    ID : {result.team.id}
                  </p>
                  {result.tournament && (
                    <div className="rounded-xl border border-blue-500/60 bg-blue-500/10 px-3 py-2 text-blue-100">
                      Inscrite au tournoi &laquo;&nbsp;
                      {result.tournament.tournament_name}&nbsp;&raquo;
                    </div>
                  )}
                  {teamSlug && (
                    <Link
                      href={`/team/${teamSlug}`}
                      className="inline-flex items-center gap-2 text-sm text-emerald-300 hover:text-white"
                    >
                      Voir la page équipe ↗
                    </Link>
                  )}

                  {result.members && result.members.length > 0 && (
                    <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 space-y-2">
                      <p className="text-sm font-semibold">Membres ajoutés</p>
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
                            <span>role : {m.role}</span>
                            <span className="text-gray-400">·</span>
                            <span>capitaine : {m.captain ? 'oui' : 'non'}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-300">
                  Après validation, l&apos;équipe créée et les membres liés (si
                  fournis) s&apos;afficheront ici.
                </p>
              )}

              <div className="text-xs text-gray-400 space-y-1">
                <p>
                  • Les membres sont recherchés par email dans Supabase auth; un
                  compte est créé si besoin.
                </p>
                <p>• Sélectionne un capitaine dans la liste si besoin.</p>
                <p>• Le slug est généré automatiquement à partir du nom.</p>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </>
  );
}
