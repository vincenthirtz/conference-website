// pages/team/[slug]/edit.tsx
// Self-service editor for the team's public page.
// Accessible to a logged-in user who is captain of the team OR who has the
// `edit_public_page` permission via their team_members.role.

import { useState, useMemo } from 'react';
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { supabaseAdmin, getServerClient, supabaseClient } from '@/utils/supabase';
import { hasTeamPermission } from '@/utils/teams/permissions';
import {
  TEAM_PUBLIC_CONTENT_MAX_LENGTH,
  renderTeamPublicMarkdown,
  normalizeAccentColor,
  BANNER_OVERLAY_VALUES,
  BANNER_FOCAL_VALUES,
  type BannerOverlay,
  type BannerFocal,
} from '@/utils/markdown/teamPublicMarkdown';
import { useToast } from '@/components/Toast';
import LogoUpload from '@/components/admin/LogoUpload';

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
};

type Props = {
  team: EditableTeam;
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

  // Resolve team by slug first, then id/name/short_name (back-compat).
  let team: EditableTeam | null = null;
  const fields =
    'id, slug, name, short_name, logo_url, banner_url, description, public_content, accent_color, secondary_color, banner_overlay, banner_focal, twitter, discord, website, youtube, twitch, instagram, tiktok';
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      slug
    );

  const { data: bySlug } = await supabaseAdmin
    .from('teams')
    .select(fields)
    .eq('slug', slug)
    .maybeSingle();
  if (bySlug) team = bySlug as EditableTeam;

  if (!team && isUuid) {
    const { data } = await supabaseAdmin
      .from('teams')
      .select(fields)
      .eq('id', slug)
      .maybeSingle();
    if (data) team = data as EditableTeam;
  }

  if (!team) {
    const { data } = await supabaseAdmin
      .from('teams')
      .select(fields)
      .ilike('name', slug)
      .maybeSingle();
    if (data) team = data as EditableTeam;
  }
  if (!team) {
    const { data } = await supabaseAdmin
      .from('teams')
      .select(fields)
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

  return { props: { team } };
};

export default function TeamPublicEditPage({ team }: Props) {
  const { addToast } = useToast();

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

  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

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
      addToast(
        'Couleur invalide — utilise un hex (#rgb ou #rrggbb).',
        'error'
      );
      return;
    }
    setSaving(true);

    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Session expirée — reconnecte-toi.');

      const res = await fetch(`/api/teams/${team.id}/public-page`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
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
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Échec de la mise à jour.');
      }

      const updatedCount = json.updatedFields?.length ?? 0;
      addToast(
        updatedCount > 0
          ? `Page mise à jour (${updatedCount} champ${updatedCount > 1 ? 's' : ''} modifié${updatedCount > 1 ? 's' : ''}).`
          : 'Aucun changement.',
        'success'
      );
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : 'Erreur inattendue.',
        'error'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <Head>
        <title>Éditer {team.name} | OW Women&apos;s Cup</title>
      </Head>

      <main className="container mx-auto px-4 max-w-4xl py-10">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">
              Personnalisation
            </p>
            <h1 className="text-2xl font-bold text-gradient">
              Page publique de {team.name}
            </h1>
          </div>
          <Link
            href={`/team/${teamSlugForLink}`}
            className="text-sm text-gray-400 hover:text-white underline"
          >
            ← Voir la page
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Identity */}
          <section className="bg-black/60 border border-white/5 rounded-2xl p-5 space-y-4">
            <h2 className="text-sm uppercase tracking-wide text-gray-400">
              Identité visuelle
            </h2>

            <LogoUpload
              label="Logo"
              hint="PNG, JPEG ou WebP, max 2 Mo. Carré recommandé (512×512)."
              value={logoUrl}
              onChange={setLogoUrl}
              endpoint={uploadEndpoint}
            />

            <LogoUpload
              label="Bannière"
              hint="PNG, JPEG ou WebP, max 2 Mo. Format paysage (1500×500)."
              value={bannerUrl}
              onChange={setBannerUrl}
              endpoint={uploadEndpoint}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ColorField
                id="accentColor"
                label="Couleur d'accent"
                value={accentColor}
                onChange={setAccentColor}
                valid={accentValid}
                placeholder="#7c3aed"
              />
              <ColorField
                id="secondaryColor"
                label="Couleur secondaire"
                value={secondaryColor}
                onChange={setSecondaryColor}
                valid={secondaryValid}
                placeholder="#22d3ee"
                hint="Combinée à l'accent pour les dégradés (logo, bannière, win-rate)."
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
                Overlay de bannière
              </label>
              <select
                id="bannerOverlay"
                value={bannerOverlay}
                onChange={(e) =>
                  setBannerOverlay(e.target.value as BannerOverlay | '')
                }
                className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="">Par défaut (gradient noir)</option>
                {BANNER_OVERLAY_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {OVERLAY_LABELS[value]}
                  </option>
                ))}
              </select>
              <p className="text-xs text-neutral-500 mt-1">
                Style de la couche posée au-dessus de l&apos;image de bannière.
              </p>
            </div>

            <div>
              <label
                htmlFor="bannerFocal"
                className="block text-sm text-neutral-300 mb-1"
              >
                Cadrage de la bannière
              </label>
              <select
                id="bannerFocal"
                value={bannerFocal}
                onChange={(e) =>
                  setBannerFocal(e.target.value as BannerFocal | '')
                }
                className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="">Centré (par défaut)</option>
                {BANNER_FOCAL_VALUES.filter((v) => v !== 'center').map(
                  (value) => (
                    <option key={value} value={value}>
                      {FOCAL_LABELS[value]}
                    </option>
                  )
                )}
              </select>
              <p className="text-xs text-neutral-500 mt-1">
                Point d&apos;ancrage de l&apos;image quand elle est recadrée.
              </p>
            </div>
          </section>

          {/* Description */}
          <section className="bg-black/60 border border-white/5 rounded-2xl p-5 space-y-4">
            <h2 className="text-sm uppercase tracking-wide text-gray-400">
              Description courte
            </h2>
            <div>
              <textarea
                value={description}
                maxLength={DESCRIPTION_MAX}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Une phrase pour présenter l'équipe."
                className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <p className="text-xs text-neutral-500 mt-1">
                {description.length}/{DESCRIPTION_MAX} caractères
              </p>
            </div>
          </section>

          {/* Rich content */}
          <section className="bg-black/60 border border-white/5 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm uppercase tracking-wide text-gray-400">
                Contenu détaillé
              </h2>
              <button
                type="button"
                onClick={() => setShowPreview((s) => !s)}
                className="text-xs text-cyan-300 hover:text-cyan-200 underline"
              >
                {showPreview ? 'Édition' : 'Aperçu'}
              </button>
            </div>

            {showPreview ? (
              <div className="min-h-[200px] rounded-xl border border-white/10 bg-black/40 p-4">
                {previewNode ?? (
                  <p className="text-gray-500 text-sm italic">
                    Aucun contenu.
                  </p>
                )}
              </div>
            ) : (
              <textarea
                value={publicContent}
                maxLength={TEAM_PUBLIC_CONTENT_MAX_LENGTH}
                onChange={(e) => setPublicContent(e.target.value)}
                rows={12}
                placeholder={
                  '## Notre histoire\n\nNous sommes une équipe...\n\n- Fondée en 2024\n- 5 joueuses titulaires'
                }
                className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
              />
            )}

            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>
                Markdown : <code className="text-neutral-400">## titre</code>,{' '}
                <code className="text-neutral-400">**gras**</code>,{' '}
                <code className="text-neutral-400">*italique*</code>,{' '}
                <code className="text-neutral-400">- liste</code>,{' '}
                <code className="text-neutral-400">[lien](https://...)</code>
              </span>
              <span>
                {publicContent.length}/{TEAM_PUBLIC_CONTENT_MAX_LENGTH}
              </span>
            </div>
          </section>

          {/* Socials */}
          <section className="bg-black/60 border border-white/5 rounded-2xl p-5 space-y-4">
            <h2 className="text-sm uppercase tracking-wide text-gray-400">
              Réseaux & contact
            </h2>
            <SocialField
              id="twitter"
              label="Twitter / X"
              hint="Handle ou URL complète"
              value={twitter}
              onChange={setTwitter}
              max={HANDLE_MAX}
            />
            <SocialField
              id="discord"
              label="Discord"
              hint="Lien d'invitation ou nom du serveur"
              value={discord}
              onChange={setDiscord}
              max={HANDLE_MAX}
            />
            <SocialField
              id="website"
              label="Site web"
              hint="URL complète (https://...)"
              value={website}
              onChange={setWebsite}
              max={200}
            />
            <SocialField
              id="youtube"
              label="YouTube"
              hint="Handle (@chaine), ID ou URL complète"
              value={youtube}
              onChange={setYoutube}
              max={HANDLE_MAX}
            />
            <SocialField
              id="twitch"
              label="Twitch"
              hint="Pseudo ou URL complète"
              value={twitch}
              onChange={setTwitch}
              max={HANDLE_MAX}
            />
            <SocialField
              id="instagram"
              label="Instagram"
              hint="Handle (@compte) ou URL complète"
              value={instagram}
              onChange={setInstagram}
              max={HANDLE_MAX}
            />
            <SocialField
              id="tiktok"
              label="TikTok"
              hint="Handle (@compte) ou URL complète"
              value={tiktok}
              onChange={setTiktok}
              max={HANDLE_MAX}
            />
          </section>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Link
              href={`/team/${teamSlugForLink}`}
              className="px-4 py-2 rounded-xl border border-white/10 text-sm text-gray-300 hover:bg-white/5"
            >
              Annuler
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-white"
            >
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>

        {/* Live preview of identity block */}
        {(logoUrl || bannerUrl) && (
          <section className="mt-10 bg-black/40 border border-dashed border-white/10 rounded-2xl p-5">
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-3">
              Aperçu visuel
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

const OVERLAY_LABELS: Record<BannerOverlay, string> = {
  gradient: 'Dégradé sombre (recommandé)',
  dark: 'Noir uni 50%',
  none: 'Aucun (image pleine)',
  grid: 'Grille',
  dots: 'Pointillés',
};

const FOCAL_LABELS: Record<BannerFocal, string> = {
  center: 'Centré',
  top: 'Haut',
  bottom: 'Bas',
  left: 'Gauche',
  right: 'Droite',
};

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
            Reset
          </button>
        )}
      </div>
      <p className="text-xs text-neutral-500 mt-1">
        {hint ?? 'Format hex (#rgb ou #rrggbb). Laisse vide pour la valeur par défaut.'}
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
