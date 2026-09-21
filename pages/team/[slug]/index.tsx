// pages/team/[slug]/index.tsx

import { useState } from 'react';
import { GetStaticPaths, GetStaticProps } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import PublicScrimDialog from '@/components/Team/PublicScrimDialog';
import { safeHref, socialHref } from '@/utils/social/profileHandles';
import { splitTeamMembers } from '@/utils/teams/roleKind';
import SkillRatingBadge from '@/components/Team/SkillRatingBadge';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import { useTeamPageAccess } from '@/components/Team/useTeamPageAccess';
import { formatSiteDate } from '@/utils/timezone';
import {
  renderTeamPublicMarkdown,
  normalizeAccentColor,
  normalizeBannerOverlay,
  normalizeBannerFocal,
  type BannerOverlay,
  type BannerFocal,
} from '@/utils/markdown/teamPublicMarkdown';
import nsTeamDetail from '@/lib/i18n/locales/fr/teamDetail';
import nsOverwatchRank from '@/lib/i18n/locales/fr/overwatchRank';
import nsPlayerTcg from '@/lib/i18n/locales/fr/playerTcg';
import TcgCard from '@/components/tcg/TcgCard';
import TeamLogoCredit from '@/components/Team/LogoCredit';
import { resolveLogoCredit } from '@/utils/teams/logoCredit';
import { XIcon } from '@/components/Icons';
// Briques d'affichage de la fiche, sorties de ce fichier (il en faisait 2 054).
import {
  MemberCard,
  SponsorTile,
  SocialLink,
  BannerOverlayLayer,
  StatCard,
  MatchCard,
  StatusBadge,
  initials,
} from '@/components/Team/TeamPageParts';
// Chargement de la fiche : serveur uniquement. `buildTeamPage` n'est appelé
// que depuis `getStaticProps`, que Next retire du bundle client ; les types
// passent par `import type` et disparaissent à la compilation.
import { buildTeamPage } from '@/utils/teams/buildTeamPage';
import type { TeamPageProps } from '@/utils/teams/buildTeamPage';

import { teamPageSeoFallback } from '@/components/Team/teamPageSeo';

export const getStaticPaths: GetStaticPaths = async () => {
  // On-demand generation: no team is pre-rendered at build time, every slug
  // is rendered on first request then cached/revalidated (ISR).
  return { paths: [], fallback: 'blocking' };
};

/**
 * Traduit le résultat du chargeur en réponse Next, et rien d'autre.
 *
 * Les 450 lignes de requêtes qui vivaient ici sont dans
 * `utils/teams/buildTeamPage.ts` — elles contenaient les treize `any` du
 * fichier, et l'une d'elles masquait un tournoi fantôme (cf. l'en-tête de ce
 * module). `revalidate: 60` reste le même sur les trois issues : une équipe
 * introuvable aujourd'hui peut exister dans une minute.
 */
export const getStaticProps: GetStaticProps<TeamPageProps> = async (ctx) => {
  const slug = ctx.params?.slug;
  if (typeof slug !== 'string' || !slug) {
    return { notFound: true, revalidate: 60 };
  }

  const result = await buildTeamPage(slug);
  if (result.kind === 'notFound') {
    return { notFound: true, revalidate: 60 };
  }
  if (result.kind === 'redirect') {
    return {
      redirect: { destination: result.destination, permanent: true },
      revalidate: 60,
    };
  }
  return { props: result.props, revalidate: 60 };
};

export default function TeamPage({
  team,
  tcgImageUrl,
  members,
  skillAverage,
  tournaments,
  matchStats,
  scrimHistory,
  reliability,
  recentMatches,
  embedHost,
  announcementActive,
  tcgRarity,
}: TeamPageProps) {
  const t = useT(nsTeamDetail);
  const tRank = useT(nsOverwatchRank);
  // Les libellés de rareté viennent du namespace du TCG, pas de `teamDetail` :
  // les redéfinir ici donnerait deux sources pour le même palier.
  const tTcg = useT(nsPlayerTcg);
  const locale = useLocale();
  // `canEdit` is auth-dependent and therefore not part of the statically
  // generated payload. We resolve it client-side after hydration: a captain
  // or manager of *this* team (per /api/admin/teams/my) may edit its public
  // page. Defaults to false so the SSG markup never leaks an edit affordance.
  // Le visiteur gère-t-il cette équipe (édition) ou une AUTRE (scrim depuis
  // son espace, R3) ? Appel seulement pour une session ouverte.
  const { canEdit, canProposeScrim } = useTeamPageAccess(team.id);

  const winRate =
    matchStats.total > 0
      ? Math.round((matchStats.wins / matchStats.total) * 100)
      : 0;

  const activeTournaments = tournaments.filter(
    (t) =>
      t.status === 'running' ||
      t.status === 'ongoing' ||
      t.status === 'published'
  );

  const hasSocials =
    team.twitter ||
    team.discord ||
    team.website ||
    team.youtube ||
    team.twitch ||
    team.instagram ||
    team.tiktok;
  const description = team.description || team.bio;
  const [scrimDialogOpen, setScrimDialogOpen] = useState(false);
  const accent = normalizeAccentColor(team.accent_color);
  const secondary = normalizeAccentColor(team.secondary_color);
  const overlay: BannerOverlay =
    normalizeBannerOverlay(team.banner_overlay) ?? 'gradient';
  const focal: BannerFocal =
    normalizeBannerFocal(team.banner_focal) ?? 'center';
  const richContent = renderTeamPublicMarkdown(team.public_content);
  const editHref = `/team/${encodeURIComponent(team.slug || team.id)}/edit`;
  const gradientStops = secondary && accent ? `${accent}, ${secondary}` : null;

  const achievements = (team.achievements ?? []).filter((a) => a && a.title);
  const sponsors = (team.sponsors ?? []).filter((s) => s && s.name);

  const embedSrc =
    team.embed_provider === 'youtube' && team.embed_id
      ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(team.embed_id)}`
      : team.embed_provider === 'twitch' && team.embed_id
        ? `https://player.twitch.tv/?channel=${encodeURIComponent(team.embed_id)}&parent=${encodeURIComponent(embedHost)}`
        : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      {/* Pas de <Head> ici : les meta viennent de `props.seo` → DefaultSeo. */}

      {/* Pinned announcement */}
      {announcementActive && (
        <div
          className="w-full px-4 py-2 text-center text-sm font-medium text-black"
          style={{
            backgroundImage: gradientStops
              ? `linear-gradient(90deg, ${accent}, ${secondary})`
              : undefined,
            backgroundColor: gradientStops ? undefined : (accent ?? '#f0e63c'),
          }}
        >
          {team.pinned_announcement}
        </div>
      )}

      {/* Banner */}
      {team.banner_url && (
        <div className="relative h-48 md:h-64 w-full overflow-hidden">
          <Image
            src={team.banner_url}
            alt=""
            fill
            className={`object-cover ${overlay === 'none' ? '' : 'opacity-60'}`}
            style={{ objectPosition: focal }}
          />
          <BannerOverlayLayer
            overlay={overlay}
            accent={accent}
            secondary={secondary}
          />
        </div>
      )}

      <main
        className={`container mx-auto px-4 max-w-6xl pb-16 ${team.banner_url ? '-mt-20 relative z-10' : 'pt-24'}`}
      >
        {/* Header */}
        <section className="mb-10">
          <div className="flex flex-col md:flex-row md:items-end gap-6">
            {/* Logo */}
            <div className="flex-shrink-0">
              <div
                className="rounded-2xl p-1 shadow-2xl"
                style={
                  gradientStops
                    ? {
                        backgroundImage: `linear-gradient(135deg, ${accent}, ${secondary})`,
                      }
                    : {
                        backgroundColor: accent ?? 'rgba(255,255,255,0.1)',
                      }
                }
              >
                {team.logo_url ? (
                  <div className="w-28 h-28 md:w-36 md:h-36 rounded-xl bg-black/80 overflow-hidden">
                    <Image
                      src={team.logo_url}
                      alt={team.name}
                      width={144}
                      height={144}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-28 h-28 md:w-36 md:h-36 rounded-xl bg-gradient-to-br from-neutral-800 to-neutral-900 flex items-center justify-center">
                    <span className="text-4xl font-bold text-neutral-500">
                      {initials(team.short_name || team.name)}
                    </span>
                  </div>
                )}
              </div>
              {/* Crédit de l'artiste, SOUS le logo et seulement s'il y a un
                  logo : sans image, il n'y a rien à créditer. Largeur bornée à
                  celle du logo pour ne pas pousser le bloc d'infos voisin. */}
              {team.logo_url && (
                <TeamLogoCredit
                  name={team.logo_credit_name}
                  url={team.logo_credit_url}
                  label={tTcg.logoCredit}
                  className="mt-2 w-28 md:w-36 text-xs break-words drop-shadow"
                />
              )}
            </div>

            {/* Info */}
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3 mb-2">
                {team.short_name && (
                  <span className="px-2 py-1 rounded-lg bg-white/10 border border-white/20 text-xs font-mono">
                    {team.short_name}
                  </span>
                )}
                {team.country && (
                  <span className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-xs">
                    {team.country}
                  </span>
                )}
                {team.is_active !== false && (
                  <span className="px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs">
                    {t.active}
                  </span>
                )}
                {canEdit && (
                  <Link
                    href={editHref}
                    className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/30 text-xs"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                    {t.editPage}
                  </Link>
                )}
              </div>

              <Heading
                typeStyle="heading-lg"
                className="text-brand-gradient mb-2"
              >
                {team.name}
              </Heading>

              {description && (
                <Paragraph
                  typeStyle="body-md"
                  textColor="text-gray-300"
                  className="max-w-2xl whitespace-pre-line"
                >
                  {description}
                </Paragraph>
              )}

              {/* Social links */}
              {hasSocials && (
                <div className="flex flex-wrap gap-3 mt-4">
                  <SocialLink
                    href={socialHref('x', team.twitter)}
                    label="X"
                    // X n'a pas de couleur de marque : noir sur blanc, blanc
                    // sur noir. Le survol va donc vers le blanc, pas vers le
                    // bleu de l'oiseau qui n'existe plus.
                    hover="hover:border-white/40 hover:bg-white/10"
                    icon={<XIcon className="w-4 h-4" />}
                  />
                  <SocialLink
                    href={team.discord ? safeHref(team.discord) : undefined}
                    label="Discord"
                    hover="hover:border-indigo-400/50 hover:bg-indigo-500/10"
                    icon={
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                      </svg>
                    }
                  />
                  <SocialLink
                    href={team.website ? safeHref(team.website) : undefined}
                    label={t.socialWebsite}
                    hover="hover:border-white/30"
                    icon={
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                        />
                      </svg>
                    }
                  />
                  <SocialLink
                    href={socialHref('youtube', team.youtube)}
                    label="YouTube"
                    hover="hover:border-red-400/50 hover:bg-red-500/10"
                    icon={
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M23.498 6.186a2.998 2.998 0 0 0-2.108-2.124C19.505 3.5 12 3.5 12 3.5s-7.505 0-9.39.562A2.998 2.998 0 0 0 .502 6.186 31.46 31.46 0 0 0 0 12a31.46 31.46 0 0 0 .502 5.814 2.998 2.998 0 0 0 2.108 2.124C4.495 20.5 12 20.5 12 20.5s7.505 0 9.39-.562a2.998 2.998 0 0 0 2.108-2.124A31.46 31.46 0 0 0 24 12a31.46 31.46 0 0 0-.502-5.814zM9.75 15.568V8.432L15.818 12 9.75 15.568z" />
                      </svg>
                    }
                  />
                  <SocialLink
                    href={socialHref('twitch', team.twitch)}
                    label="Twitch"
                    hover="hover:border-purple-400/50 hover:bg-purple-500/10"
                    icon={
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M2.149 0L.537 4.119v16.836h5.731V24h3.224l3.045-3.045h4.657L23.463 14.9V0H2.149zm1.612 1.612h17.985v12.298l-3.582 3.582h-5.731l-3.045 3.045v-3.045H3.761V1.612zm6.985 11.582h1.612V6.642h-1.612v6.552zm4.478 0h1.612V6.642h-1.612v6.552z" />
                      </svg>
                    }
                  />
                  <SocialLink
                    href={socialHref('instagram', team.instagram)}
                    label="Instagram"
                    hover="hover:border-pink-400/50 hover:bg-pink-500/10"
                    icon={
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
                      </svg>
                    }
                  />
                  <SocialLink
                    href={socialHref('tiktok', team.tiktok)}
                    label="TikTok"
                    hover="hover:border-cyan-400/50 hover:bg-cyan-500/10"
                    icon={
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.93a8.16 8.16 0 0 0 4.77 1.52V7a4.85 4.85 0 0 1-1.84-.31z" />
                      </svg>
                    }
                  />
                </div>
              )}
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-2 gap-2 md:gap-3 md:w-auto w-full">
              <StatCard label={t.statMatches} value={matchStats.total} />
              <StatCard
                label={t.statWins}
                value={matchStats.wins}
                hint={matchStats.total > 0 ? `${winRate}%` : undefined}
                color="emerald"
              />
              <StatCard
                label={t.statLosses}
                value={matchStats.losses}
                color="red"
              />
              <StatCard label={t.statMembers} value={members.length} />
            </div>
          </div>
        </section>

        {/* Rich content authored by the team */}
        {richContent && (
          <section
            className="mb-6 rounded-2xl border bg-black/40 px-5 py-5 relative overflow-hidden"
            style={{
              borderColor: accent
                ? `${accent}40` // ~25% alpha
                : 'rgba(255,255,255,0.08)',
            }}
          >
            {gradientStops && (
              <div
                aria-hidden
                className="absolute inset-x-0 top-0 h-[3px]"
                style={{
                  backgroundImage: `linear-gradient(90deg, ${accent}, ${secondary})`,
                }}
              />
            )}
            <div className="prose prose-invert max-w-none">{richContent}</div>
          </section>
        )}

        {/* Embed (Twitch/YouTube) */}
        {embedSrc && (
          <section className="mb-6 rounded-2xl border border-white/5 bg-black/40 overflow-hidden">
            <div className="aspect-video w-full">
              <iframe
                src={embedSrc}
                title={`Stream ${team.name}`}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                className="w-full h-full"
              />
            </div>
          </section>
        )}

        {/* Achievements */}
        {achievements.length > 0 && (
          <section className="mb-6 rounded-2xl border border-white/5 bg-black/60 p-5">
            <p className="text-xs uppercase tracking-wide text-brand-gradient mb-4">
              {t.achievementsTitle}
            </p>
            <ul className="space-y-2">
              {achievements.map((a, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 rounded-xl bg-white/5 border border-white/10 px-4 py-3"
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{
                      backgroundColor: accent
                        ? `${accent}33`
                        : 'rgba(240,230,60,0.2)',
                      color: accent ?? '#f0e63c',
                    }}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate">
                      {a.title}
                    </p>
                    {(a.tournament || a.date) && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {a.tournament}
                        {a.tournament && a.date ? ' • ' : ''}
                        {formatSiteDate(a.date, locale, {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Sponsors */}
        {sponsors.length > 0 && (
          <section className="mb-6 rounded-2xl border border-white/5 bg-black/60 p-5">
            <p className="text-xs uppercase tracking-wide text-brand-gradient mb-4">
              {t.sponsorsTitle}
            </p>
            <div className="flex flex-wrap gap-3">
              {sponsors.map((s, i) => (
                <SponsorTile key={i} sponsor={s} />
              ))}
            </div>
          </section>
        )}

        {/* ── Profil réseau (R9) ──────────────────────────────────────────
            La fiche était une vitrine : elle disait qui est l'équipe, pas
            comment elle se comporte dans le réseau. Ces deux signaux répondent
            à « est-ce que ça vaut le coup de leur proposer un créneau ? ».
            Masqués quand il n'y a rien à dire — un bloc vide n'informe pas. */}
        {/* ── Carte à collectionner ────────────────────────────────────────
            AFFICHÉE SANS CONDITION, à la différence du bloc « réseau »
            ci-dessous qui se masque quand il n'a rien à dire. Le barème pose
            que TOUTE équipe a une carte, plancher `common` compris : la
            masquer pour une équipe sans palmarès reviendrait à affirmer
            qu'elle n'en a pas. C'est aussi ce qui fait découvrir le TCG à qui
            n'en a jamais entendu parler.

            La rareté vient de `getStaticProps` (readTeamRarity), pas d'un
            calcul ici : le même barème sert au tirage des paquets. */}
        <section className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-gray-300">
            {t.tcgTitle}
          </h2>
          <div className="mt-3 flex flex-wrap items-start gap-5">
            <div className="w-36 shrink-0 sm:w-40">
              <TcgCard
                subject={{
                  kind: 'team',
                  teamId: team.id,
                  name: team.name,
                  slug: team.slug ?? null,
                  logoUrl: team.logo_url ?? null,
                  cardImageUrl: tcgImageUrl,
                  // La carte ne l'affiche que si elle montre le logo.
                  logoCredit: resolveLogoCredit(
                    team.logo_credit_name,
                    team.logo_credit_url
                  ),
                }}
                rarity={tcgRarity}
                // La carte est déjà sur la page de son sujet : pas de lien
                // vers soi-même.
                noLink
                labels={{
                  rarity: {
                    common: tTcg.rarityCommon,
                    rare: tTcg.rarityRare,
                    epic: tTcg.rarityEpic,
                    legendary: tTcg.rarityLegendary,
                  },
                  foil: tTcg.foil,
                  copies: tTcg.copies,
                  logoCredit: tTcg.logoCredit,
                }}
              />
            </div>
            <p className="min-w-[12rem] flex-1 text-sm text-gray-400">
              {t.tcgIntro}
            </p>
          </div>
        </section>

        {(scrimHistory.length > 0 || reliability.responseRate !== null) && (
          <section className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-gray-300">
              {t.networkTitle}
            </h2>

            {reliability.responseRate !== null && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    reliability.responseRate >= 70
                      ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                      : 'border-amber-400/40 bg-amber-500/10 text-amber-200'
                  }`}
                >
                  {format(t.networkResponseRate, {
                    rate: reliability.responseRate,
                  })}
                </span>
                {reliability.medianResponseHours !== null && (
                  <span className="rounded-full border border-white/15 px-3 py-1 text-xs text-gray-300">
                    {format(t.networkResponseDelay, {
                      hours: reliability.medianResponseHours,
                    })}
                  </span>
                )}
                <span className="text-[11px] text-gray-500">
                  {format(t.networkSample, { count: reliability.received })}
                </span>
              </div>
            )}

            {scrimHistory.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-gray-300">
                  {t.networkScrimsTitle}
                </p>
                <ul className="mt-2 space-y-1.5">
                  {scrimHistory.map((scrim) => (
                    <li
                      key={scrim.id}
                      className="flex flex-wrap items-center gap-2 text-xs text-gray-400"
                    >
                      <span className="text-gray-200">
                        {scrim.opponentName ?? t.networkUnknownOpponent}
                      </span>
                      {scrim.scheduledDate && (
                        <span>
                          {formatSiteDate(scrim.scheduledDate, locale, {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* Public scrim CTA */}
        <section className="mb-6 rounded-2xl border border-[var(--color-violet)]/25 bg-gradient-to-r from-[var(--color-violet)]/10 via-[var(--color-violet)]/5 to-transparent px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--color-violet-light)]">
              {format(t.scrimCtaTitle, { name: team.name })}
            </p>
            <p className="text-xs text-gray-400 mt-1">{t.scrimCtaDesc}</p>
          </div>
          {canProposeScrim ? (
            // Capitaine/manager d'une autre équipe : on l'envoie sur le
            // formulaire connecté, adversaire pré-sélectionné (multi-créneaux,
            // négociation, notifications) plutôt que sur le formulaire public.
            <Link
              href={`/player/requests?tab=scrim&team=${encodeURIComponent(team.id)}`}
              className="flex-shrink-0 px-4 py-2 rounded-lg bg-[var(--color-violet-cta)] hover:brightness-110 text-sm font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet)]"
            >
              {t.scrimCtaBtnConnected}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setScrimDialogOpen(true)}
              className="flex-shrink-0 px-4 py-2 rounded-lg bg-[var(--color-violet-cta)] hover:brightness-110 text-sm font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet)]"
            >
              {t.scrimCtaBtn}
            </button>
          )}
        </section>

        <PublicScrimDialog
          teamId={team.id}
          teamName={team.name}
          open={scrimDialogOpen}
          onClose={() => setScrimDialogOpen(false)}
        />

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1.3fr)] gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Members */}
            <section className="bg-black/60 border border-white/5 rounded-2xl p-5">
              {(() => {
                // Coach et manager ne sont pas des joueuses : ils ont leur
                // propre bloc et ne gonflent pas le décompte du roster.
                const {
                  roster: rosterMembers,
                  subs: subMembers,
                  staff: staffMembers,
                } = splitTeamMembers(members);

                return (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-xs uppercase tracking-wide text-brand-gradient">
                        {t.rosterLabel}
                      </p>
                      <span className="text-xs text-gray-500">
                        {format(
                          rosterMembers.length > 1
                            ? t.rosterCount_other
                            : t.rosterCount_one,
                          { count: rosterMembers.length }
                        )}
                      </span>
                    </div>

                    {/* Niveau moyen déclaré, au-dessus des fiches qui portent
                        chacune le sien. */}
                    {skillAverage && (
                      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-xs uppercase tracking-wide text-gray-400">
                          {tRank.teamAverageLabel}
                        </span>
                        <SkillRatingBadge
                          skillRating={skillAverage.average}
                          size="md"
                        />
                        <span className="text-xs text-gray-500">
                          {skillAverage.source === 'declared'
                            ? tRank.teamDeclaredBasis
                            : format(
                                skillAverage.count === skillAverage.eligible
                                  ? tRank.teamAverageComplete
                                  : tRank.teamAverageBasis,
                                {
                                  count: String(skillAverage.count),
                                  eligible: String(skillAverage.eligible),
                                }
                              )}
                        </span>
                      </div>
                    )}

                    {rosterMembers.length === 0 ? (
                      <Paragraph typeStyle="body-sm" textColor="text-gray-400">
                        {t.emptyRoster}
                      </Paragraph>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {rosterMembers.map((member) => (
                          <MemberCard
                            key={member.id}
                            member={member}
                            accent={accent}
                          />
                        ))}
                      </div>
                    )}

                    {subMembers.length > 0 && (
                      <div className="mt-5 pt-4 border-t border-white/5">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs uppercase tracking-wide text-gray-500">
                            {t.substitutesLabel}
                          </p>
                          <span className="text-xs text-gray-400">
                            {subMembers.length}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {subMembers.map((member) => (
                            <MemberCard
                              key={member.id}
                              member={member}
                              accent={accent}
                              substitute
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {staffMembers.length > 0 && (
                      <div className="mt-5 pt-4 border-t border-white/5">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs uppercase tracking-wide text-gray-500">
                            {t.staffLabel}
                          </p>
                          <span className="text-xs text-gray-400">
                            {staffMembers.length}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {staffMembers.map((member) => (
                            <MemberCard
                              key={member.id}
                              member={member}
                              accent={accent}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </section>

            {/* Recent Matches */}
            <section className="bg-black/60 border border-white/5 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs uppercase tracking-wide text-brand-gradient">
                  {t.recentMatchesTitle}
                </p>
              </div>

              {recentMatches.length === 0 ? (
                <Paragraph typeStyle="body-sm" textColor="text-gray-400">
                  {t.emptyMatches}
                </Paragraph>
              ) : (
                <div className="space-y-2">
                  {recentMatches.slice(0, 6).map((match) => (
                    <MatchCard key={match.id} match={match} teamId={team.id} />
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Tournaments */}
            <section className="bg-black/60 border border-white/5 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs uppercase tracking-wide text-brand-gradient">
                  {t.tournamentsTitle}
                </p>
                <span className="text-xs text-gray-500">
                  {format(
                    tournaments.length > 1
                      ? t.tournamentsCount_other
                      : t.tournamentsCount_one,
                    { count: tournaments.length }
                  )}
                </span>
              </div>

              {tournaments.length === 0 ? (
                <Paragraph typeStyle="body-sm" textColor="text-gray-400">
                  {t.emptyTournaments}
                </Paragraph>
              ) : (
                <div className="space-y-2">
                  {tournaments.slice(0, 8).map((tournament) => (
                    <Link
                      key={tournament.id}
                      href={`/tournament/${tournament.slug || tournament.id}`}
                    >
                      <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3 hover:border-emerald-400/50 hover:bg-emerald-500/5 transition-colors cursor-pointer group">
                        {tournament.logo_url ? (
                          <Image
                            src={tournament.logo_url}
                            alt=""
                            width={32}
                            height={32}
                            className="w-8 h-8 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--color-violet)]/30 to-[var(--color-green)]/30 flex items-center justify-center">
                            <svg
                              className="w-4 h-4 text-[var(--color-violet-light)]"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
                              />
                            </svg>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate group-hover:text-emerald-300 transition-colors">
                            {tournament.name}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            <span>{tournament.game || 'Overwatch'}</span>
                            <span className="text-gray-600">•</span>
                            <StatusBadge status={tournament.status} />
                          </div>
                        </div>
                        <svg
                          className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {/* Quick Stats */}
            <section className="bg-black/60 border border-white/5 rounded-2xl p-5">
              <p className="text-xs uppercase tracking-wide text-brand-gradient mb-4">
                {t.statisticsTitle}
              </p>

              <div className="space-y-4">
                {/* Win rate bar */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-400">{t.winRateLabel}</span>
                    <span className="text-white font-semibold">{winRate}%</span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${gradientStops ? '' : 'bg-gradient-to-r from-emerald-500 to-emerald-400'}`}
                      style={{
                        width: `${winRate}%`,
                        ...(gradientStops
                          ? {
                              backgroundImage: `linear-gradient(90deg, ${accent}, ${secondary})`,
                            }
                          : {}),
                      }}
                    />
                  </div>
                </div>

                {/* Stats breakdown */}
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl py-3">
                    <p className="text-lg font-bold text-emerald-300">
                      {matchStats.wins}
                    </p>
                    <p className="text-[10px] text-gray-400 uppercase">
                      {t.statWins}
                    </p>
                  </div>
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl py-3">
                    <p className="text-lg font-bold text-red-300">
                      {matchStats.losses}
                    </p>
                    <p className="text-[10px] text-gray-400 uppercase">
                      {t.statLosses}
                    </p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-xl py-3">
                    <p className="text-lg font-bold text-gray-300">
                      {matchStats.draws}
                    </p>
                    <p className="text-[10px] text-gray-400 uppercase">
                      {t.statDraws}
                    </p>
                  </div>
                </div>

                {/* Active in tournaments */}
                {activeTournaments.length > 0 && (
                  <div className="pt-3 border-t border-white/10">
                    <p className="text-xs text-gray-400 mb-2">
                      {t.activeInLabel}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {activeTournaments.slice(0, 3).map((t) => (
                        <Link key={t.id} href={`/tournament/${t.slug || t.id}`}>
                          <span className="px-2 py-1 rounded-full bg-[var(--color-violet)]/20 text-[var(--color-violet-light)] border border-[var(--color-violet)]/40 text-[10px] hover:bg-[var(--color-violet)]/30 transition-colors cursor-pointer">
                            {t.name}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Components & utils
 * ────────────────────────────────────────────*/

// Repli statique (cf. pages/player/[userId].tsx) : en pratique `props.seo`
// est toujours fourni par getStaticProps et prime dans `_app.tsx`.
TeamPage.seo = teamPageSeoFallback;
