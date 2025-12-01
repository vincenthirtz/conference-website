import { useState } from "react";
import Head from "next/head";
import Link from "next/link";

type CreateResponse = {
  team: {
    id: string;
    name: string;
    slug?: string | null;
  };
  member?: {
    id: string | null;
    user_id: string;
    role: string;
    captain: boolean;
  };
  info?: string;
  error?: string;
};

export default function PublicCreateTeamPage() {
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [country, setCountry] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");
  const [discord, setDiscord] = useState("");

  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState("player");
  const [setCaptain, setSetCaptain] = useState(true);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<CreateResponse | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setResult(null);

    try {
      const payload = {
        name,
        short_name: shortName || null,
        logo_url: logoUrl || null,
        country: country || null,
        website: website || null,
        description: description || null,
        discord: discord || null,
        member_email: memberEmail.trim() || null,
        member_role: memberRole.trim() || null,
        set_captain: Boolean(memberEmail.trim()) && setCaptain,
      };

      const res = await fetch("/api/teams/create-with-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json: CreateResponse = await res.json();

      if (!res.ok || (json as any)?.error) {
        const message = (json as any)?.error || "Impossible de créer l'équipe";
        throw new Error(message);
      }

      setResult(json);
      setName("");
      setShortName("");
      setCountry("");
      setLogoUrl("");
      setWebsite("");
      setDescription("");
      setDiscord("");
      setMemberEmail("");
      setMemberRole("player");
      setSetCaptain(true);
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Erreur inattendue");
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
          content="Crée une équipe et ajoute rapidement ton premier membre."
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
              Ajoute les infos principales de ton équipe et lie directement un premier membre (email déjà enregistré sur la plateforme).
            </p>
          </header>

          <div className="mb-8 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-emerald-200/80">Inscriptions équipes</p>
              <p className="text-sm text-emerald-50/90">
                Les jalons et dates clés sont détaillés dans la roadmap. Consulte la timeline 2026 pour anticiper les prochaines étapes.
              </p>
            </div>
            <Link
              href="/timeline-2026"
              className="inline-flex items-center justify-center px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-500 text-black hover:bg-emerald-400 transition"
            >
              Voir la timeline 2026 ↗
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
                    <p className="text-[11px] uppercase tracking-[0.14em] text-gray-400">Informations équipe</p>
                    <h2 className="text-xl font-semibold">Détails principaux</h2>
                  </div>
                  <Link href="/" className="text-sm text-gray-300 hover:text-white">
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
                    <p className="text-[11px] uppercase tracking-[0.14em] text-gray-400">Premier membre</p>
                    <h3 className="text-lg font-semibold">Ajouter quelqu&apos;un tout de suite</h3>
                  </div>
                  <span className="text-xs text-gray-400">Optionnel mais recommandé</span>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-gray-300 mb-2">
                      Email du membre
                    </label>
                    <input
                      type="email"
                      value={memberEmail}
                      onChange={(e) => setMemberEmail(e.target.value)}
                      className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/70 focus:border-emerald-400/70 transition"
                      placeholder="utilisateur@email.tld"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      L&apos;utilisateur doit déjà avoir un compte; nous le recherchons par email.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-gray-300 mb-2">
                      Rôle
                    </label>
                    <input
                      value={memberRole}
                      onChange={(e) => setMemberRole(e.target.value)}
                      className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/70 focus:border-emerald-400/70 transition"
                      placeholder="player / coach / sub"
                    />
                  </div>
                </div>

                <label className="inline-flex items-center gap-2 text-sm text-gray-200">
                  <input
                    type="checkbox"
                    checked={setCaptain}
                    onChange={(e) => setSetCaptain(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-500 bg-black/60"
                    disabled={!memberEmail.trim()}
                  />
                  <span>Désigner ce membre comme capitaine</span>
                </label>
              </section>

              {errorMsg && (
                <div className="rounded-xl border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                  {errorMsg}
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={loading}
                  className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition ${
                    loading
                      ? "bg-neutral-700 cursor-not-allowed"
                      : "bg-emerald-500 hover:bg-emerald-400 text-black"
                  }`}
                >
                  {loading ? "Création..." : "Créer l&apos;équipe"}
                </button>

                <Link href="/" className="text-sm text-gray-300 hover:text-white">
                  Retour à l&apos;accueil
                </Link>
              </div>
            </form>

            <aside className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 space-y-4 sticky top-28">
              <h2 className="text-lg font-semibold">Résultat</h2>

              {result ? (
                <div className="space-y-2 text-sm">
                  <div className="rounded-xl border border-emerald-500/60 bg-emerald-500/10 px-3 py-2 text-emerald-100">
                    {result.info || "Équipe créée"}
                  </div>
                  <p className="text-gray-300">
                    Équipe : <span className="font-semibold">{result.team.name}</span>
                  </p>
                  <p className="text-gray-400 text-xs break-all">ID : {result.team.id}</p>
                  {teamSlug && (
                    <Link
                      href={`/team/${teamSlug}`}
                      className="inline-flex items-center gap-2 text-sm text-emerald-300 hover:text-white"
                    >
                      Voir la page équipe ↗
                    </Link>
                  )}

                  {result.member && (
                    <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 space-y-1">
                      <p className="text-sm font-semibold">Membre ajouté</p>
                      <p className="text-xs text-gray-300">
                        user_id : <span className="font-mono break-all">{result.member.user_id}</span>
                      </p>
                      <p className="text-xs text-gray-300">role : {result.member.role}</p>
                      <p className="text-xs text-gray-300">
                        capitaine : {result.member.captain ? "oui" : "non"}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-300">
                  Après validation, l&apos;équipe créée et le membre lié (si fourni) s&apos;afficheront ici.
                </p>
              )}

              <div className="text-xs text-gray-400 space-y-1">
                <p>• Le membre est recherché par email dans Supabase auth.</p>
                <p>• Active &quot;Capitaine&quot; uniquement si un email est renseigné.</p>
                <p>• Le slug est généré automatiquement à partir du nom.</p>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </>
  );
}
