// features/player/team/ui/pageEditor/IdentityFold.tsx — identité visuelle de
// la page publique (lot P10) : logo, bannière, illustration TCG (enregistrée
// SEULE, séparée par un trait), couleurs, overlay et cadrage de bannière.

import LogoUpload from '@/components/admin/LogoUpload';
import TcgTeamImageCard from '@/components/Team/TcgTeamImageCard';
import {
  BANNER_FOCAL_VALUES,
  BANNER_OVERLAY_VALUES,
} from '@/utils/markdown/teamPublicMarkdown';
import { FicheFold } from '@/features/player/_shared/ui';
import type {
  TeamEditTexts,
  TeamPageEditorState,
} from '../../hooks/useTeamPageEditor';
import { ColorField, SelectField } from './EditorFields';

const overlayLabels = (t: TeamEditTexts) => ({
  gradient: t.overlayGradient,
  dark: t.overlayDark,
  none: t.overlayNone,
  grid: t.overlayGrid,
  dots: t.overlayDots,
});

const focalLabels = (t: TeamEditTexts) => ({
  center: t.focalCenter,
  top: t.focalTop,
  bottom: t.focalBottom,
  left: t.focalLeft,
  right: t.focalRight,
});

export default function IdentityFold({
  editor,
  teamId,
  tcgImageUrl,
}: {
  editor: TeamPageEditorState;
  teamId: string;
  tcgImageUrl: string | null;
}) {
  const { t, form } = editor;
  const v = form.values;
  const overlays = overlayLabels(t);
  const focals = focalLabels(t);

  return (
    <FicheFold title={t.identitySection}>
      <div className="flex flex-col gap-5">
        <LogoUpload
          label={t.logoLabel}
          hint={t.logoHint}
          value={v.logo_url}
          onChange={(url) => form.setValue('logo_url', url)}
          endpoint={editor.uploadEndpoint}
        />
        <LogoUpload
          label={t.bannerLabel}
          hint={t.bannerHint}
          value={v.banner_url}
          onChange={(url) => form.setValue('banner_url', url)}
          endpoint={editor.uploadEndpoint}
        />

        {/* Ce bloc s'enregistre SEUL, contrairement au reste du formulaire :
            le trait le dit autant que le texte. */}
        <div className="border-t border-[var(--line,rgba(194,196,201,.12))] pt-4">
          <TcgTeamImageCard
            teamId={teamId}
            logoUrl={v.logo_url || null}
            initialImageUrl={tcgImageUrl}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ColorField
            form={form}
            name="accent_color"
            label={t.accentColorLabel}
            hint={t.colorHintDefault}
            valid={editor.accentValid}
            placeholder="#b24be0"
            onClear={() => form.setValue('accent_color', '')}
            t={t}
          />
          <ColorField
            form={form}
            name="secondary_color"
            label={t.secondaryColorLabel}
            hint={t.secondaryColorHint}
            valid={editor.secondaryValid}
            placeholder="#7bc96a"
            onClear={() => form.setValue('secondary_color', '')}
            t={t}
          />
        </div>

        {v.accent_color &&
          v.secondary_color &&
          editor.accentValid &&
          editor.secondaryValid && (
            <div
              aria-hidden
              className="h-3 rounded-full border border-[var(--line2,rgba(194,196,201,.2))]"
              style={{
                backgroundImage: `linear-gradient(90deg, ${v.accent_color}, ${v.secondary_color})`,
              }}
            />
          )}

        <SelectField
          form={form}
          name="banner_overlay"
          label={t.bannerOverlayLabel}
          hint={t.bannerOverlayHint}
          defaultLabel={t.bannerOverlayDefault}
          options={BANNER_OVERLAY_VALUES.map((value) => ({
            value,
            label: overlays[value],
          }))}
        />
        <SelectField
          form={form}
          name="banner_focal"
          label={t.bannerFocalLabel}
          hint={t.bannerFocalHint}
          defaultLabel={t.bannerFocalDefault}
          options={BANNER_FOCAL_VALUES.filter((f) => f !== 'center').map(
            (value) => ({ value, label: focals[value] })
          )}
        />
      </div>
    </FicheFold>
  );
}
