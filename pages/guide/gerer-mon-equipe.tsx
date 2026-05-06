// pages/guide/gerer-mon-equipe.tsx
// Public guide showing what's possible from the captain space.
// The "screenshots" are live JSX previews built from the same Tailwind
// tokens as the real player UI — they stay in sync with the design and
// don't go stale like raster images.

import Link from 'next/link';
import type { JSX, ReactNode } from 'react';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';

const REGISTER_TEAM_HREF = '/team/create';
const PLAYER_HREF = '/player';

type Step = {
  number: string;
  title: string;
  description: string;
  bullets: string[];
  preview: () => JSX.Element;
};

const STEPS: Step[] = [
  {
    number: '01',
    title: 'Inscris ton équipe',
    description:
      'Crée ton équipe en deux minutes : nom, BattleTag de capitaine, premiers membres. Tu deviens capitaine automatiquement.',
    bullets: [
      'Choisis un nom et un tag (ex. PHX)',
      'Renseigne 5 BattleTags pour démarrer le roster',
      'Tu peux ajouter coachs et remplaçantes plus tard',
    ],
    preview: NewTeamPreview,
  },
  {
    number: '02',
    title: 'Reçois et valide les candidatures',
    description:
      'Active le mode “équipe ouverte” pour recevoir des demandes. Lis le message, accepte ou refuse — la joueuse reçoit une notification.',
    bullets: [
      'Toggle ouvert/fermé en un clic',
      'Voir le rôle souhaité et un mot d’intro',
      'Accepter assigne automatiquement le rôle',
    ],
    preview: JoinRequestsPreview,
  },
  {
    number: '03',
    title: 'Gère le roster et les rôles',
    description:
      'Ajuste les rôles (tank/dps/support/sub/coach), passe le brassard de capitaine, copie un BattleTag en un clic pour les lobbies.',
    bullets: [
      'Compteur Tank / DPS / Support visible',
      'Bouton 📋 à côté de chaque BattleTag',
      'Transfert de capitaine en deux clics',
    ],
    preview: RosterPreview,
  },
  {
    number: '04',
    title: 'Discute avec les autres capitaines',
    description:
      'Messagerie intégrée entre capitaines pour caler horaires, lobbies ou règles maison sans quitter le site.',
    bullets: [
      'Inbox triée par dernière activité',
      'Compteur de messages non lus dans la navbar',
      'Modération staff active si besoin',
    ],
    preview: MessagesPreview,
  },
  {
    number: '05',
    title: 'Check-in du prochain match',
    description:
      'Une heure avant le coup d’envoi, le bouton check-in s’ouvre directement dans ton espace. Plus besoin de chercher le mail Draftbot.',
    bullets: [
      'Carte “Prochain match” en haut du dashboard',
      'Compte à rebours, format BO3/BO5, lien live',
      'Forfait auto si pas de check-in à T-0',
    ],
    preview: NextMatchPreview,
  },
  {
    number: '06',
    title: 'Propose des scrims',
    description:
      'Choisis une équipe adverse, propose un horaire et un message. La capitaine adverse accepte ou refuse depuis son espace.',
    bullets: [
      'Recherche d’équipe avec filtre pays/places',
      'Proposition + date + commentaire',
      'Une fois accepté, ajoute-le à ton agenda',
    ],
    preview: ScrimPreview,
  },
];

const FEATURES: { title: string; description: string }[] = [
  {
    title: 'Cloche de notifications',
    description:
      'Un badge rose en navbar agrège messages non lus, scrims en attente, candidatures et check-in à valider.',
  },
  {
    title: 'Page publique d’équipe',
    description:
      'Profite d’une vitrine partageable (logo, roster, palmarès) à diffuser sur les réseaux et auprès des sponsors.',
  },
  {
    title: 'Historique des demandes',
    description:
      'Toutes tes demandes (capitanat, transferts, scrims) sont tracées avec leur statut et la date de traitement staff.',
  },
  {
    title: 'Sécurité & modération',
    description:
      'Charte anti-harcèlement, staff formé, signalement intégré, suppression de compte conforme RGPD.',
  },
];

function GuidePage(): JSX.Element {
  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      {/* Hero */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-purple-600/30 blur-3xl" />
          <div className="absolute right-10 top-10 h-[360px] w-[360px] rounded-full bg-cyan-500/20 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-5xl px-6 pt-32 pb-16 text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-gray-200">
            Guide capitaine
          </p>
          <Heading
            level="h1"
            typeStyle="heading-lg"
            className="mt-4 text-gradient font-extrabold leading-tight"
          >
            Gère ton équipe en quelques clics
          </Heading>
          <Paragraph
            typeStyle="body-lg"
            className="mx-auto mt-4 max-w-3xl"
            textColor="text-gray-200"
          >
            Roster, candidatures, scrims, check-in, messagerie : tout est dans
            ton espace. Voici un aperçu concret de chaque étape, avec des
            captures de l’interface réelle.
          </Paragraph>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={REGISTER_TEAM_HREF}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 transition hover:brightness-110"
            >
              Créer mon équipe
              <span aria-hidden>→</span>
            </Link>
            <Link
              href={PLAYER_HREF}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-white transition hover:bg-white/10"
            >
              Aller à mon espace
            </Link>
          </div>
        </div>
      </header>

      {/* Steps */}
      <section className="relative mx-auto max-w-6xl px-4 md:px-6 pb-16">
        <ol className="flex flex-col gap-12">
          {STEPS.map((step, idx) => {
            const reverse = idx % 2 === 1;
            const Preview = step.preview;
            return (
              <li
                key={step.number}
                className={`grid items-center gap-8 md:grid-cols-2 ${
                  reverse ? 'md:[&>*:first-child]:order-2' : ''
                }`}
              >
                <div className="space-y-4">
                  <span className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.18em] text-blue-200/80">
                    Étape {step.number}
                  </span>
                  <h2 className="text-3xl md:text-4xl font-bold text-white leading-tight">
                    {step.title}
                  </h2>
                  <p className="text-base text-gray-300 leading-relaxed">
                    {step.description}
                  </p>
                  <ul className="space-y-2">
                    {step.bullets.map((b) => (
                      <li
                        key={b}
                        className="flex items-start gap-2 text-sm text-gray-200"
                      >
                        <Bullet />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <FrameDevice>
                  <Preview />
                </FrameDevice>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Features grid */}
      <section className="relative mx-auto max-w-6xl px-4 md:px-6 pb-20">
        <div className="mb-8 text-center">
          <Heading typeStyle="heading-md" className="text-gradient text-center">
            Et aussi…
          </Heading>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {FEATURES.map((f) => (
            <article
              key={f.title}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur"
            >
              <h3 className="text-lg font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-sm text-gray-300 leading-relaxed">
                {f.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative mx-auto max-w-4xl px-6 pb-24">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-purple-500/10 via-white/[0.03] to-cyan-500/10 p-8 md:p-10 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white">
            Prête à passer le brassard ?
          </h2>
          <p className="mt-3 text-gray-300">
            L’inscription est libre, le formulaire prend deux minutes et tu peux
            ajuster le roster à tout moment.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={REGISTER_TEAM_HREF}
              className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-neutral-900 shadow transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              Créer mon équipe
              <span aria-hidden>→</span>
            </Link>
            <Link
              href="/espace-capitaine#faq"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 py-3 text-sm font-medium text-white transition hover:bg-white/10"
            >
              Lire la FAQ capitaine
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

const guideSeo: SeoProps = {
  title: 'Gérer mon équipe — guide capitaine',
  description:
    "Aperçu pas-à-pas de l'espace capitaine OW Women's Cup : inscription d'équipe, candidatures, roster, messagerie, scrims et check-in.",
};

(GuidePage as unknown as { seo: SeoProps }).seo = guideSeo;
export default GuidePage;

/* ------------------------------------------------------------------ */
/* Mock UI previews — rendered live from the same tokens as /player.  */
/* ------------------------------------------------------------------ */

function FrameDevice({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-purple-500/20 via-transparent to-cyan-500/20 blur-2xl pointer-events-none" />
      <div className="relative rounded-2xl border border-white/15 bg-[#0d0a18]/95 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.55)] backdrop-blur-sm">
        <div className="flex items-center gap-1.5 mb-3 px-1">
          <span className="h-2 w-2 rounded-full bg-rose-400/80" />
          <span className="h-2 w-2 rounded-full bg-amber-400/80" />
          <span className="h-2 w-2 rounded-full bg-emerald-400/80" />
          <span className="ml-2 text-[10px] uppercase tracking-[0.18em] text-white/30">
            owwomenscup.fr/player
          </span>
        </div>
        <div className="rounded-xl bg-gradient-to-b from-black via-[#0a0815] to-[#0a0815] p-4 md:p-5">
          {children}
        </div>
      </div>
    </div>
  );
}

function Bullet() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 h-4 w-4 shrink-0 text-purple-300"
      aria-hidden="true"
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

function FieldRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.16em] text-gray-400">
        {label}
      </div>
      <div className="mt-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white">
        {value}
      </div>
      {hint && <div className="mt-1 text-[10px] text-gray-500">{hint}</div>}
    </div>
  );
}

function NewTeamPreview() {
  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-200/80">
        Créer mon équipe
      </div>
      <FieldRow label="Nom" value="Phenix" />
      <FieldRow
        label="Tag"
        value="PHX"
        hint="3-4 lettres, visible en bracket"
      />
      <FieldRow label="Capitaine" value="Lina#21834" />
      <div>
        <div className="text-[10px] uppercase tracking-[0.16em] text-gray-400 mb-1">
          Roster initial
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            'Lina#21834',
            'Mei#9912',
            'Yuki#1547',
            'Ava#2090',
            'Naomi#7732',
          ].map((bt) => (
            <div
              key={bt}
              className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-white"
            >
              {bt}
            </div>
          ))}
        </div>
      </div>
      <button
        type="button"
        disabled
        className="w-full rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2 text-sm font-semibold text-white opacity-90 cursor-default"
      >
        Inscrire mon équipe
      </button>
    </div>
  );
}

function JoinRequestsPreview() {
  const requests = [
    {
      name: 'Akira',
      battleTag: 'Akira#4422',
      role: 'DPS',
      message: 'Disponible 3 soirs/semaine, niveau Diamant.',
    },
    {
      name: 'Yumi',
      battleTag: 'Yumi#1188',
      role: 'Support',
      message: 'Master saison passée, cherche projet sérieux.',
    },
  ];
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-200/80">
          Candidatures
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-100">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Équipe ouverte
        </span>
      </div>
      {requests.map((r) => (
        <div
          key={r.battleTag}
          className="rounded-lg border border-white/10 bg-white/[0.04] p-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white truncate">
                {r.name}{' '}
                <span className="text-gray-400 text-xs font-normal">
                  · {r.battleTag}
                </span>
              </div>
              <div className="mt-0.5 inline-flex items-center rounded-full border border-orange-300/40 bg-orange-500/10 px-2 py-0.5 text-[10px] text-orange-100">
                {r.role}
              </div>
              <p className="mt-1.5 text-xs text-gray-300">{r.message}</p>
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              <button
                type="button"
                disabled
                className="rounded-md bg-emerald-500/80 px-3 py-1 text-[11px] font-semibold text-white"
              >
                Accepter
              </button>
              <button
                type="button"
                disabled
                className="rounded-md border border-white/15 bg-white/5 px-3 py-1 text-[11px] text-gray-300"
              >
                Refuser
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RosterPreview() {
  const members = [
    { tag: 'Lina#21834', role: 'Tank', captain: true },
    { tag: 'Mei#9912', role: 'DPS', captain: false },
    { tag: 'Yuki#1547', role: 'DPS', captain: false },
    { tag: 'Ava#2090', role: 'Support', captain: false },
    { tag: 'Naomi#7732', role: 'Support', captain: false },
    { tag: 'Sora#0033', role: 'Sub', captain: false },
  ];
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold text-white tabular-nums">
          {members.length}
        </span>
        <span className="text-xs text-gray-400">membres</span>
      </div>
      <div className="flex flex-wrap gap-1.5 text-[10px] uppercase tracking-[0.12em]">
        <RosterBadge n={1} label="Tank" tone="rose" />
        <RosterBadge n={2} label="DPS" tone="orange" />
        <RosterBadge n={2} label="Support" tone="emerald" />
        <RosterBadge n={1} label="Sub" tone="slate" />
      </div>
      <div className="space-y-1.5">
        {members.map((m) => (
          <div
            key={m.tag}
            className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-7 w-7 rounded-full bg-black/60 border border-white/10 flex items-center justify-center text-[10px] text-gray-400">
                {m.tag.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm text-white">
                  <span className="truncate">{m.tag}</span>
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-md border border-white/10 bg-white/5 text-gray-300">
                    <CopyIcon />
                  </span>
                </div>
                <div className="text-[10px] text-gray-500">
                  {m.captain ? (
                    <span className="text-purple-300">Capitaine</span>
                  ) : (
                    m.role.toLowerCase()
                  )}
                </div>
              </div>
            </div>
            <span className="text-[10px] text-gray-500">{m.role}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MessagesPreview() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-200/80">
          Messagerie
        </span>
        <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white">
          3
        </span>
      </div>
      {[
        {
          team: 'Avoidgers',
          text: 'On peut décaler le scrim à 21h ? On a un imprévu côté tank.',
          time: 'il y a 4 min',
          unread: true,
        },
        {
          team: 'Sparkles',
          text: 'BattleTag du capitaine pour le lobby ?',
          time: 'il y a 1 h',
          unread: true,
        },
        {
          team: 'Onna',
          text: 'Merci pour le scrim hier, vous avez bien progressé !',
          time: 'hier',
          unread: false,
        },
      ].map((c) => (
        <div
          key={c.team}
          className={`rounded-lg border px-3 py-2.5 ${
            c.unread
              ? 'border-emerald-300/30 bg-emerald-500/5'
              : 'border-white/10 bg-white/[0.03]'
          }`}
        >
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-white">{c.team}</span>
            <span className="text-gray-500">{c.time}</span>
          </div>
          <p className="mt-1 text-xs text-gray-300 line-clamp-1">{c.text}</p>
        </div>
      ))}
    </div>
  );
}

function NextMatchPreview() {
  return (
    <div className="rounded-xl border border-white/10 bg-gradient-to-br from-purple-500/10 via-white/[0.03] to-cyan-500/10 p-4">
      <div className="flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-blue-200/80">
        <span className="rounded-full border border-blue-300/40 bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold text-blue-50">
          Prochain match
        </span>
        <span>OW Women’s Cup 2026</span>
        <span>Round 1</span>
        <span>BO3</span>
      </div>
      <h4 className="mt-2 text-lg font-bold text-white leading-tight">
        Phenix <span className="text-white/50">vs</span> Avoidgers
      </h4>
      <p className="mt-1 text-xs text-gray-300">
        dimanche 18 mai 2026 à 19:00 · dans 2j 4h
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] text-white">
          Voir le match →
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-1 text-[11px] text-fuchsia-100">
          Live cast ↗
        </span>
        <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-neutral-900 shadow">
          Check-in maintenant
        </span>
      </div>
    </div>
  );
}

function ScrimPreview() {
  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-200/80">
        Proposer un scrim
      </div>
      <FieldRow label="Équipe adverse" value="Sparkles · 5 membres · 🇫🇷" />
      <FieldRow label="Date proposée" value="dimanche 18 mai 2026 à 21:00" />
      <FieldRow
        label="Message"
        value="Salut ! On cherche un BO3 dimanche soir, vous êtes dispo ?"
      />
      <button
        type="button"
        disabled
        className="w-full rounded-lg border border-blue-400/40 bg-blue-500/15 px-4 py-2 text-sm font-medium text-blue-100"
      >
        Envoyer la demande
      </button>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-2.5 w-2.5"
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 012-2h10" />
    </svg>
  );
}

const ROSTER_TONE = {
  rose: 'border-rose-300/40 bg-rose-500/10 text-rose-100',
  orange: 'border-orange-300/40 bg-orange-500/10 text-orange-100',
  emerald: 'border-emerald-300/40 bg-emerald-500/10 text-emerald-100',
  slate: 'border-slate-300/30 bg-white/5 text-slate-200',
} as const;

function RosterBadge({
  n,
  label,
  tone,
}: {
  n: number;
  label: string;
  tone: keyof typeof ROSTER_TONE;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${ROSTER_TONE[tone]}`}
    >
      <span className="font-semibold tabular-nums">{n}</span>
      <span>{label}</span>
    </span>
  );
}
