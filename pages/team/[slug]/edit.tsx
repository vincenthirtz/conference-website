// pages/team/[slug]/edit.tsx
// Self-service editor for the team's public page.
// Accessible to a logged-in user who is captain of the team OR who has the
// `edit_public_page` permission via their team_members.role.

import { useState, useMemo } from 'react';
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { supabaseAdmin, getServerClient } from '@/utils/supabase';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { hasTeamPermission } from '@/utils/teams/permissions';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';
import {
  TEAM_PUBLIC_CONTENT_MAX_LENGTH,
  renderTeamPublicMarkdown,
  normalizeAccentColor,
  parseEmbedUrl,
  BANNER_OVERLAY_VALUES,
  BANNER_FOCAL_VALUES,
  ACHIEVEMENTS_MAX,
  ACHIEVEMENT_TITLE_MAX,
  ACHIEVEMENT_TOURNAMENT_MAX,
  SPONSORS_MAX,
  SPONSOR_NAME_MAX,
  PINNED_ANNOUNCEMENT_MAX,
  type BannerOverlay,
  type BannerFocal,
  type Achievement,
  type Sponsor,
} from '@/utils/markdown/teamPublicMarkdown';
import { useToast } from '@/components/Toast';
import LogoUpload from '@/components/admin/LogoUpload';
import MemberProfileEditor, {
  type EditableMember,
} from '@/components/Team/MemberProfileEditor';
import { useT, format } from '@/lib/i18n/useT';

type TeamEditDict = ReturnType<typeof useT<'teamEdit'>>;

type EditableTeam = {
  id: string;
  slug: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  banner_url: string | null;
  description: string | null;
  public_content: string | null;
  accent_color: string | null;
  secondary_color: string | null;
  banner_overlay: string | null;
  banner_focal: string | null;
  twitter: string | null;
  discord: string | null;
  website: string | null;
  youtube: string | null;
  twitch: string | null;
  instagram: string | null;
  tiktok: string | null;
  achievements: Achievement[] | null;
  sponsors: Sponsor[] | null;
  embed_provider: string | null;
  embed_id: string | null;
  pinned_announcement: string | null;
  pinned_announcement_until: string | null;
  captain_id: string | null;
};

type Props = {
  team: EditableTeam;
  members: EditableMember[];
};

const DESCRIPTION_MAX = 280;
const HANDLE_MAX = 80;

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const slug = ctx.params?.slug as string | undefined;
  if (!slug) return { notFound: true };

  const supabase = getServerClient(ctx.req, ctx.res);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      redirect: {
        destination: `/login?next=/team/${encodeURIComponent(slug)}/edit`,
        permanent: false,
      },
    };
  }

  const tenantId = resolveTenantIdForUserRequest(ctx.req, {
    authUserId: user.id,
  });

  // Resolve team by slug first, then id/name/short_name (back-compat).
  let team: EditableTeam | null = null;
  const fields =
    'id, slug, name, short_name, logo_url, banner_url, description, public_content, accent_color, secondary_color, banner_overlay, banner_focal, twitter, discord, website, youtube, twitch, instagram, tiktok, achievements, sponsors, embed_provider, embed_id, pinned_announcement, pinned_announcement_until, captain_id';
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      slug
    );

  const { data: bySlug } = await supabaseAdmin
    .from('teams')
    .select(fields)
    .eq('tenant_id', tenantId)
    .eq('slug', slug)
    .maybeSingle();
  if (bySlug) team = bySlug as EditableTeam;

  if (!team && isUuid) {
    const { data } = await supabaseAdmin
      .from('teams')
      .select(fields)
      .eq('tenant_id', tenantId)
      .eq('id', slug)
      .maybeSingle();
    if (data) team = data as EditableTeam;
  }

  if (!team) {
    const { data } = await supabaseAdmin
      .from('teams')
      .select(fields)
      .eq('tenant_id', tenantId)
      .ilike('name', slug)
      .maybeSingle();
    if (data) team = data as EditableTeam;
  }
  if (!team) {
    const { data } = await supabaseAdmin
      .from('teams')
      .select(fields)
      .eq('tenant_id', tenantId)
      .ilike('short_name', slug)
      .maybeSingle();
    if (data) team = data as EditableTeam;
  }

  if (!team) return { notFound: true };

  const allowed = await hasTeamPermission(user.id, team.id, 'edit_public_page');
  if (!allowed) {
    return {
      redirect: {
        destination: `/team/${encodeURIComponent(slug)}`,
        permanent: false,
      },
    };
  }

  // Roster — used by the per-member profile editor.
  const { data: rawMembers } = await supabaseAdmin
    .from('team_members')
    .select(
      'id, user_id, role, battle_tag, is_substitute, display_name, specialty, avatar_url, pronouns, tagline, twitter, twitch, created_at'
    )
    .eq('tenant_id', tenantId)
    .eq('team_id', team.id)
    .order('created_at', { ascending: true });

  const teamCaptainId = (team as Record<string, unknown>).captain_id as
    | string
    | null
    | undefined;
  const members: EditableMember[] = (rawMembers ?? []).map((m: any) => ({
    id: m.id,
    user_id: m.user_id,
    battle_tag: m.battle_tag ?? null,
    role: m.role ?? null,
    is_captain: m.user_id === teamCaptainId,
    is_substitute: !!m.is_substitute,
    display_name: m.display_name ?? null,
    specialty: m.specialty ?? null,
    avatar_url: m.avatar_url ?? null,
    pronouns: m.pronouns ?? null,
    tagline: m.tagline ?? null,
    twitter: m.twitter ?? null,
    twitch: m.twitch ?? null,
  }));

  return { props: { team, members } };
};

export default function TeamPublicEditPage({ team, members }: Props) {
  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch();
  const t = useT('teamEdit');
  const overlayLabels = getOverlayLabels(t);
  const focalLabels = getFocalLabels(t);

  const [description, setDescription] = useState(team.description ?? '');
  const [publicContent, setPublicContent] = useState(team.public_content ?? '');
  const [accentColor, setAccentColor] = useState(team.accent_color ?? '');
  const [secondaryColor, setSecondaryColor] = useState(
    team.secondary_color ?? ''
  );
  const [bannerOverlay, setBannerOverlay] = useState<BannerOverlay | ''>(
    (team.banner_overlay as BannerOverlay | null) ?? ''
  );
  const [bannerFocal, setBannerFocal] = useState<BannerFocal | ''>(
    (team.banner_focal as BannerFocal | null) ?? ''
  );
  const [logoUrl, setLogoUrl] = useState(team.logo_url ?? '');
  const [bannerUrl, setBannerUrl] = useState(team.banner_url ?? '');
  const [twitter, setTwitter] = useState(team.twitter ?? '');
  const [discord, setDiscord] = useState(team.discord ?? '');
  const [website, setWebsite] = useState(team.website ?? '');
  const [youtube, setYoutube] = useState(team.youtube ?? '');
  const [twitch, setTwitch] = useState(team.twitch ?? '');
  const [instagram, setInstagram] = useState(team.instagram ?? '');
  const [tiktok, setTiktok] = useState(team.tiktok ?? '');

  const [achievements, setAchievements] = useState<Achievement[]>(
    team.achievements ?? []
  );
  const [sponsors, setSponsors] = useState<Sponsor[]>(team.sponsors ?? []);

  const [embedUrl, setEmbedUrl] = useState(
    team.embed_provider === 'youtube' && team.embed_id
      ? `https://www.youtube.com/watch?v=${team.embed_id}`
      : team.embed_provider === 'twitch' && team.embed_id
        ? `https://www.twitch.tv/${team.embed_id}`
        : ''
  );

  const [pinnedAnnouncement, setPinnedAnnouncement] = useState(
    team.pinned_announcement ?? ''
  );
  const [pinnedUntil, setPinnedUntil] = useState(
    team.pinned_announcement_until
      ? new Date(team.pinned_announcement_until).toISOString().slice(0, 16)
      : ''
  );

  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const embedParsed = useMemo(() => parseEmbedUrl(embedUrl), [embedUrl]);
  const embedValid = !embedUrl || embedParsed !== null;

  const accentValid = useMemo(() => {
    if (!accentColor) return true;
    return normalizeAccentColor(accentColor) !== null;
  }, [accentColor]);

  const secondaryValid = useMemo(() => {
    if (!secondaryColor) return true;
    return normalizeAccentColor(secondaryColor) !== null;
  }, [secondaryColor]);

  const previewNode = useMemo(
    () => renderTeamPublicMarkdown(publicContent),
    [publicContent]
  );

  const teamSlugForLink = team.slug || team.id;
  const uploadEndpoint = `/api/teams/${team.id}/upload-image`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accentValid || !secondaryValid) {
      addToast(t.errorInvalidColor, 'error');
      return;
    }
    if (!embedValid) {
      addToast(t.errorInvalidEmbed, 'error');
      return;
    }
    setSaving(true);

    try {
      const json = await adminFetchJson<{ updatedFields?: unknown[] }>(
        `/api/teams/${team.id}/public-page`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            description,
            public_content: publicContent,
            accent_color: accentColor,
            secondary_color: secondaryColor,
            banner_overlay: bannerOverlay,
            banner_focal: bannerFocal,
            logo_url: logoUrl,
            banner_url: bannerUrl,
            twitter,
            discord,
            website,
            youtube,
            twitch,
            instagram,
            tiktok,
            achievements,
            sponsors,
            embed_url: embedUrl || null,
            pinned_announcement: pinnedAnnouncement,
            pinned_announcement_until: pinnedUntil
              ? new Date(pinnedUntil).toISOString()
              : null,
          }),
        }
      );

      const updatedCount = json.updatedFields?.length ?? 0;
      addToast(
        updatedCount > 0
          ? format(
              updatedCount > 1 ? t.updateSuccess_other : t.updateSuccess_one,
              { count: updatedCount }
            )
          : t.noChanges,
        'success'
      );
    } catch (err) {
      addToast(err instanceof Error ? err.message : t.errorUnexpected, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <Head>
        <title>{format(t.headTitle, { name: team.name })}</title>
      </Head>

      <main className="container mx-auto px-4 max-w-4xl py-10">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">
              {t.eyebrow}
            </p>
            <h1 className="text-2xl font-bold text-gradient">
              {format(t.title, { name: team.name })}
            </h1>
          </div>
          <Link
            href={`/team/${teamSlugForLink}`}
            className="text-sm text-gray-400 hover:text-white underline"
          >
            {t.viewPage}
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Identity */}
          <section className="bg-black/60 border border-white/5 rounded-2xl p-5 space-y-4">
            <h2 className="text-sm uppercase tracking-wide text-gray-400">
              {t.identitySection}
            </h2>

            <LogoUpload
              label={t.logoLabel}
              hint={t.logoHint}
              value={logoUrl}
              onChange={setLogoUrl}
              endpoint={uploadEndpoint}
            />

            <LogoUpload
              label={t.bannerLabel}
              hint={t.bannerHint}
              value={bannerUrl}
              onChange={setBannerUrl}
              endpoint={uploadEndpoint}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ColorField
                id="accentColor"
                label={t.accentColorLabel}
                value={accentColor}
                onChange={setAccentColor}
                valid={accentValid}
                placeholder="#b24be0"
              />
              <ColorField
                id="secondaryColor"
                label={t.secondaryColorLabel}
                value={secondaryColor}
                onChange={setSecondaryColor}
                valid={secondaryValid}
                placeholder="#7bc96a"
                hint={t.secondaryColorHint}
              />
            </div>

            {accentColor && secondaryColor && accentValid && secondaryValid && (
              <div
                aria-hidden
                className="h-3 rounded-full border border-white/10"
                style={{
                  backgroundImage: `linear-gradient(90deg, ${accentColor}, ${secondaryColor})`,
                }}
              />
            )}

            <div>
              <label
                htmlFor="bannerOverlay"
                className="block text-sm text-neutral-300 mb-1"
              >
                {t.bannerOverlayLabel}
              </label>
              <select
                id="bannerOverlay"
                value={bannerOverlay}
                onChange={(e) =>
                  setBannerOverlay(e.target.value as BannerOverlay | '')
                }
                className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="">{t.bannerOverlayDefault}</option>
                {BANNER_OVERLAY_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {overlayLabels[value]}
                  </option>
                ))}
              </select>
              <p className="text-xs text-neutral-500 mt-1">
                {t.bannerOverlayHint}
              </p>
            </div>

            <div>
              <label
                htmlFor="bannerFocal"
                className="block text-sm text-neutral-300 mb-1"
              >
                {t.bannerFocalLabel}
              </label>
              <select
                id="bannerFocal"
                value={bannerFocal}
                onChange={(e) =>
                  setBannerFocal(e.target.value as BannerFocal | '')
                }
                className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="">{t.bannerFocalDefault}</option>
                {BANNER_FOCAL_VALUES.filter((v) => v !== 'center').map(
                  (value) => (
                    <option key={value} value={value}>
                      {focalLabels[value]}
                    </option>
                  )
                )}
              </select>
              <p className="text-xs text-neutral-500 mt-1">
                {t.bannerFocalHint}
              </p>
            </div>
          </section>

          {/* Description */}
          <section className="bg-black/60 border border-white/5 rounded-2xl p-5 space-y-4">
            <h2 className="text-sm uppercase tracking-wide text-gray-400">
              {t.shortDescSection}
            </h2>
            <div>
              <textarea
                value={description}
                maxLength={DESCRIPTION_MAX}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder={t.shortDescPlaceholder}
                className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <p className="text-xs text-neutral-500 mt-1">
                {format(t.charCount, {
                  count: description.length,
                  max: DESCRIPTION_MAX,
                })}
              </p>
            </div>
          </section>

          {/* Rich content */}
          <section className="bg-black/60 border border-white/5 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm uppercase tracking-wide text-gray-400">
                {t.richContentSection}
              </h2>
              <button
                type="button"
                onClick={() => setShowPreview((s) => !s)}
                className="text-xs text-cyan-300 hover:text-cyan-200 underline"
              >
                {showPreview ? t.editToggle : t.previewToggle}
              </button>
            </div>

            {showPreview ? (
              <div className="min-h-[200px] rounded-xl border border-white/10 bg-black/40 p-4">
                {previewNode ?? (
                  <p className="text-gray-500 text-sm italic">{t.noContent}</p>
                )}
              </div>
            ) : (
              <textarea
                value={publicContent}
                maxLength={TEAM_PUBLIC_CONTENT_MAX_LENGTH}
                onChange={(e) => setPublicContent(e.target.value)}
                rows={12}
                placeholder={t.richContentPlaceholder}
                className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
              />
            )}

            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>
                {t.markdownLabel}{' '}
                <code className="text-neutral-400">{t.markdownHeading}</code>,{' '}
                <code className="text-neutral-400">{t.markdownBold}</code>,{' '}
                <code className="text-neutral-400">{t.markdownItalic}</code>,{' '}
                <code className="text-neutral-400">{t.markdownList}</code>,{' '}
                <code className="text-neutral-400">{t.markdownLink}</code>
              </span>
              <span>
                {publicContent.length}/{TEAM_PUBLIC_CONTENT_MAX_LENGTH}
              </span>
            </div>
          </section>

          {/* Pinned announcement */}
          <section className="bg-black/60 border border-white/5 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm uppercase tracking-wide text-gray-400">
                {t.pinnedSection}
              </h2>
              {pinnedAnnouncement && (
                <button
                  type="button"
                  onClick={() => {
                    setPinnedAnnouncement('');
                    setPinnedUntil('');
                  }}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  {t.clear}
                </button>
              )}
            </div>
            <div>
              <input
                type="text"
                value={pinnedAnnouncement}
                maxLength={PINNED_ANNOUNCEMENT_MAX}
                onChange={(e) => setPinnedAnnouncement(e.target.value)}
                placeholder={t.pinnedPlaceholder}
                className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <p className="text-xs text-neutral-500 mt-1">
                {format(t.pinnedHint, {
                  count: pinnedAnnouncement.length,
                  max: PINNED_ANNOUNCEMENT_MAX,
                })}
              </p>
            </div>
            <div>
              <label
                htmlFor="pinnedUntil"
                className="block text-sm text-neutral-300 mb-1"
              >
                {t.pinnedUntilLabel}
              </label>
              <input
                id="pinnedUntil"
                type="datetime-local"
                value={pinnedUntil}
                onChange={(e) => setPinnedUntil(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <p className="text-xs text-neutral-500 mt-1">
                {t.pinnedUntilHint}
              </p>
            </div>
          </section>

          {/* Embed */}
          <section className="bg-black/60 border border-white/5 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm uppercase tracking-wide text-gray-400">
                {t.embedSection}
              </h2>
              {embedUrl && (
                <button
                  type="button"
                  onClick={() => setEmbedUrl('')}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  {t.remove}
                </button>
              )}
            </div>
            <div>
              <input
                type="text"
                value={embedUrl}
                onChange={(e) => setEmbedUrl(e.target.value)}
                placeholder={t.embedPlaceholder}
                className={`w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border ${
                  embedValid ? 'border-neutral-600' : 'border-red-500'
                } focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm`}
              />
              <p className="text-xs text-neutral-500 mt-1">
                {embedParsed
                  ? format(t.embedDetected, {
                      provider: embedParsed.provider,
                      id: embedParsed.id,
                    })
                  : embedUrl
                    ? t.embedUnrecognized
                    : t.embedEmpty}
              </p>
            </div>
          </section>

          {/* Achievements */}
          <section className="bg-black/60 border border-white/5 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm uppercase tracking-wide text-gray-400">
                {t.achievementsSection}
              </h2>
              <span className="text-xs text-neutral-500">
                {achievements.length}/{ACHIEVEMENTS_MAX}
              </span>
            </div>
            {achievements.length === 0 && (
              <p className="text-xs text-neutral-500 italic">
                {t.achievementsEmpty}
              </p>
            )}
            <div className="space-y-3">
              {achievements.map((a, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2"
                >
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={a.title}
                      maxLength={ACHIEVEMENT_TITLE_MAX}
                      placeholder={t.achievementTitlePlaceholder}
                      onChange={(e) =>
                        setAchievements((prev) =>
                          prev.map((it, i) =>
                            i === idx ? { ...it, title: e.target.value } : it
                          )
                        )
                      }
                      className="flex-1 px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setAchievements((prev) =>
                          prev.filter((_, i) => i !== idx)
                        )
                      }
                      className="px-2 text-xs text-red-400 hover:text-red-300"
                      aria-label={t.delete}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={a.date ?? ''}
                      onChange={(e) =>
                        setAchievements((prev) =>
                          prev.map((it, i) =>
                            i === idx
                              ? { ...it, date: e.target.value || null }
                              : it
                          )
                        )
                      }
                      className="px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                    <input
                      type="text"
                      value={a.tournament ?? ''}
                      maxLength={ACHIEVEMENT_TOURNAMENT_MAX}
                      placeholder={t.achievementTournamentPlaceholder}
                      onChange={(e) =>
                        setAchievements((prev) =>
                          prev.map((it, i) =>
                            i === idx
                              ? {
                                  ...it,
                                  tournament: e.target.value || null,
                                }
                              : it
                          )
                        )
                      }
                      className="px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>
            {achievements.length < ACHIEVEMENTS_MAX && (
              <button
                type="button"
                onClick={() =>
                  setAchievements((prev) => [
                    ...prev,
                    { title: '', date: null, tournament: null },
                  ])
                }
                className="w-full px-3 py-2 rounded-lg border border-dashed border-white/15 text-sm text-cyan-300 hover:bg-cyan-500/5"
              >
                {t.addAchievement}
              </button>
            )}
          </section>

          {/* Sponsors */}
          <section className="bg-black/60 border border-white/5 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm uppercase tracking-wide text-gray-400">
                {t.sponsorsSection}
              </h2>
              <span className="text-xs text-neutral-500">
                {sponsors.length}/{SPONSORS_MAX}
              </span>
            </div>
            {sponsors.length === 0 && (
              <p className="text-xs text-neutral-500 italic">
                {t.sponsorsEmpty}
              </p>
            )}
            <div className="space-y-3">
              {sponsors.map((s, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2"
                >
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={s.name}
                      maxLength={SPONSOR_NAME_MAX}
                      placeholder={t.sponsorNamePlaceholder}
                      onChange={(e) =>
                        setSponsors((prev) =>
                          prev.map((it, i) =>
                            i === idx ? { ...it, name: e.target.value } : it
                          )
                        )
                      }
                      className="flex-1 px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setSponsors((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="px-2 text-xs text-red-400 hover:text-red-300"
                      aria-label={t.delete}
                    >
                      ✕
                    </button>
                  </div>
                  <input
                    type="text"
                    value={s.logo_url ?? ''}
                    placeholder={t.sponsorLogoPlaceholder}
                    onChange={(e) =>
                      setSponsors((prev) =>
                        prev.map((it, i) =>
                          i === idx
                            ? { ...it, logo_url: e.target.value || null }
                            : it
                        )
                      )
                    }
                    className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                  />
                  <input
                    type="text"
                    value={s.url ?? ''}
                    placeholder={t.sponsorUrlPlaceholder}
                    onChange={(e) =>
                      setSponsors((prev) =>
                        prev.map((it, i) =>
                          i === idx
                            ? { ...it, url: e.target.value || null }
                            : it
                        )
                      )
                    }
                    className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                  />
                </div>
              ))}
            </div>
            {sponsors.length < SPONSORS_MAX && (
              <button
                type="button"
                onClick={() =>
                  setSponsors((prev) => [
                    ...prev,
                    { name: '', logo_url: null, url: null },
                  ])
                }
                className="w-full px-3 py-2 rounded-lg border border-dashed border-white/15 text-sm text-cyan-300 hover:bg-cyan-500/5"
              >
                {t.addSponsor}
              </button>
            )}
          </section>

          {/* Socials */}
          <section className="bg-black/60 border border-white/5 rounded-2xl p-5 space-y-4">
            <h2 className="text-sm uppercase tracking-wide text-gray-400">
              {t.socialsSection}
            </h2>
            <SocialField
              id="twitter"
              label={t.twitterLabel}
              hint={t.twitterHint}
              value={twitter}
              onChange={setTwitter}
              max={HANDLE_MAX}
            />
            <SocialField
              id="discord"
              label={t.discordLabel}
              hint={t.discordHint}
              value={discord}
              onChange={setDiscord}
              max={HANDLE_MAX}
            />
            <SocialField
              id="website"
              label={t.websiteLabel}
              hint={t.websiteHint}
              value={website}
              onChange={setWebsite}
              max={200}
            />
            <SocialField
              id="youtube"
              label={t.youtubeLabel}
              hint={t.youtubeHint}
              value={youtube}
              onChange={setYoutube}
              max={HANDLE_MAX}
            />
            <SocialField
              id="twitch"
              label={t.twitchLabel}
              hint={t.twitchHint}
              value={twitch}
              onChange={setTwitch}
              max={HANDLE_MAX}
            />
            <SocialField
              id="instagram"
              label={t.instagramLabel}
              hint={t.instagramHint}
              value={instagram}
              onChange={setInstagram}
              max={HANDLE_MAX}
            />
            <SocialField
              id="tiktok"
              label={t.tiktokLabel}
              hint={t.tiktokHint}
              value={tiktok}
              onChange={setTiktok}
              max={HANDLE_MAX}
            />
          </section>

          {/* Members */}
          <section className="bg-black/60 border border-white/5 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm uppercase tracking-wide text-gray-400">
                {t.membersSection}
              </h2>
              <span className="text-xs text-neutral-500">
                {format(
                  members.length > 1
                    ? t.membersCount_other
                    : t.membersCount_one,
                  { count: members.length }
                )}
              </span>
            </div>
            <p className="text-xs text-neutral-500">{t.membersDesc}</p>
            {members.length === 0 ? (
              <p className="text-xs text-neutral-500 italic">
                {t.membersEmpty}
              </p>
            ) : (
              <div className="space-y-3">
                {members.map((m) => (
                  <MemberProfileEditor key={m.id} teamId={team.id} member={m} />
                ))}
              </div>
            )}
          </section>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Link
              href={`/team/${teamSlugForLink}`}
              className="px-4 py-2 rounded-xl border border-white/10 text-sm text-gray-300 hover:bg-white/5"
            >
              {t.cancel}
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-white"
            >
              {saving ? t.saving : t.save}
            </button>
          </div>
        </form>

        {/* Live preview of identity block */}
        {(logoUrl || bannerUrl) && (
          <section className="mt-10 bg-black/40 border border-dashed border-white/10 rounded-2xl p-5">
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-3">
              {t.visualPreview}
            </p>
            <div className="flex items-center gap-4">
              {logoUrl && (
                <Image
                  src={logoUrl}
                  alt=""
                  width={64}
                  height={64}
                  className="w-16 h-16 rounded-xl object-cover border border-white/10"
                  unoptimized
                />
              )}
              <div>
                <p className="text-lg font-semibold">{team.name}</p>
                {accentColor && accentValid && (
                  <span
                    className="inline-block w-3 h-3 rounded-full mr-2 align-middle"
                    style={{ backgroundColor: accentColor }}
                  />
                )}
                {description && (
                  <span className="text-sm text-gray-400 align-middle">
                    {description}
                  </span>
                )}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

const getOverlayLabels = (t: TeamEditDict): Record<BannerOverlay, string> => ({
  gradient: t.overlayGradient,
  dark: t.overlayDark,
  none: t.overlayNone,
  grid: t.overlayGrid,
  dots: t.overlayDots,
});

const getFocalLabels = (t: TeamEditDict): Record<BannerFocal, string> => ({
  center: t.focalCenter,
  top: t.focalTop,
  bottom: t.focalBottom,
  left: t.focalLeft,
  right: t.focalRight,
});

function ColorField({
  id,
  label,
  value,
  onChange,
  valid,
  placeholder,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  valid: boolean;
  placeholder: string;
  hint?: string;
}) {
  const t = useT('teamEdit');
  return (
    <div>
      <label htmlFor={id} className="block text-sm text-neutral-300 mb-1">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`flex-1 px-3 py-2.5 rounded-xl bg-neutral-900/50 border ${
            valid ? 'border-neutral-600' : 'border-red-500'
          } focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono`}
        />
        {valid && value && (
          <span
            aria-hidden
            className="inline-block w-9 h-9 rounded-lg border border-white/20"
            style={{ backgroundColor: value }}
          />
        )}
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-xs text-red-400 hover:text-red-300"
          >
            {t.reset}
          </button>
        )}
      </div>
      <p className="text-xs text-neutral-500 mt-1">
        {hint ?? t.colorHintDefault}
      </p>
    </div>
  );
}

function SocialField({
  id,
  label,
  hint,
  value,
  onChange,
  max,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm text-neutral-300 mb-1">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        maxLength={max}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
      />
      <p className="text-xs text-neutral-500 mt-1">{hint}</p>
    </div>
  );
}
