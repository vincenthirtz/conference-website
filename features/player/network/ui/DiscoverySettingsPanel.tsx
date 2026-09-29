// features/player/network/ui/DiscoverySettingsPanel.tsx — section
// « Découverte / Réseau joueurs » de « Mon profil » (lot P15). Remplace
// components/player/DiscoveryCard.
//
// Opt-in GLOBAL, INVISIBLE par défaut, derrière le login. L'interrupteur
// maître `discoverable` révèle, quand il est actif, l'accroche (≤ 160 car.,
// enregistrement explicite) et deux sous-interrupteurs (stats, équipes).
// Toutes les écritures : PUT /api/player/discovery (patch partiel), optimiste
// pour les interrupteurs, rétabli sur refus, toast dans les deux cas.

import Link from 'next/link';
import { useEffect } from 'react';
import Switch from '@/components/ui/Switch';
import { useToast } from '@/components/Toast';
import { useSchemaForm } from '@/hooks/forms/useSchemaForm';
import FormField from '@/features/ruban/FormField';
import {
  Button,
  Card,
  rubanErrBox,
  rubanFormInput,
  rubanHelp,
  rubanInset,
  rubanSpinnerRing,
  rubanStrong,
} from '@/features/ruban';
import { format, useT } from '@/lib/i18n/useT';
import nsPlayerDiscovery from '@/lib/i18n/locales/fr/playerDiscovery';
import { usePlayerErrorText } from '../../_shared/useErrorText';
import {
  useMyDiscoveryCard,
  useUpdateDiscoveryCard,
} from '../hooks/useDiscovery';
import {
  DISCOVERY_ANCHOR,
  TAGLINE_MAX,
  TaglineForm,
  type DiscoveryCard,
} from '../schemas';

type BoolKey = 'discoverable' | 'showRatings' | 'showTeams';

function ToggleRow({
  title,
  hint,
  checked,
  disabled,
  onChange,
  label,
}: {
  title: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <div className={`${rubanInset} flex items-center gap-4 px-5 py-4`}>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${rubanStrong}`}>{title}</p>
        <p className={rubanHelp}>{hint}</p>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        label={label}
      />
    </div>
  );
}

/** Accroche : formulaire sur schéma, enregistré à la demande. */
function TaglineEditor({
  card,
  onSave,
}: {
  card: DiscoveryCard;
  /** Rend la carte enregistrée, ou `null` (refus déjà signalé par toast). */
  onSave: (tagline: string) => Promise<DiscoveryCard | null>;
}) {
  const t = useT(nsPlayerDiscovery);
  const form = useSchemaForm({
    schema: TaglineForm,
    initialValues: { tagline: card.tagline ?? '' },
    onSubmit: async (body) => {
      const updated = await onSave(body.tagline ?? '');
      if (updated) form.reset({ tagline: updated.tagline ?? '' });
    },
    errorFallback: t.saveError,
  });
  const value = String(form.values.tagline ?? '');
  return (
    <form
      onSubmit={form.handleSubmit}
      noValidate
      className={`${rubanInset} px-5 py-4`}
    >
      <FormField form={form} name="tagline" label={t.taglineLabel}>
        {(props) => (
          <textarea
            {...props}
            maxLength={TAGLINE_MAX}
            rows={2}
            placeholder={t.taglinePlaceholder}
            className={`${rubanFormInput} resize-none`}
          />
        )}
      </FormField>
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className={`${rubanHelp} tabular-nums`} data-numeric>
          {format(t.taglineCounter, { count: value.length })}
        </span>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={form.isSubmitting || value === (card.tagline ?? '')}
        >
          {form.isSubmitting ? t.taglineSaving : t.taglineSave}
        </Button>
      </div>
    </form>
  );
}

export default function DiscoverySettingsPanel() {
  const t = useT(nsPlayerDiscovery);
  const { addToast } = useToast();
  const errorText = usePlayerErrorText();
  const cardQ = useMyDiscoveryCard(true);
  const update = useUpdateDiscoveryCard({ optimistic: true });
  const card = cardQ.data;

  // Arrivée par `/player/profile#decouverte` : la carte est rendue après le
  // défilement tenté par le navigateur — on le refait une fois chargée.
  const loaded = !cardQ.isPending;
  useEffect(() => {
    if (!loaded) return;
    if (window.location.hash !== `#${DISCOVERY_ANCHOR}`) return;
    document
      .getElementById(DISCOVERY_ANCHOR)
      ?.scrollIntoView({ block: 'start' });
  }, [loaded]);

  const pendingKey =
    update.isPending && update.variables
      ? (Object.keys(update.variables)[0] as BoolKey | 'tagline')
      : null;

  const patchBool = (key: BoolKey, next: boolean) =>
    update.mutate({ [key]: next } as Partial<Record<BoolKey, boolean>>, {
      onSuccess: () => addToast(t.saved, 'success'),
      onError: (err) => addToast(errorText(err, t.saveError), 'error'),
    });

  const saveTagline = async (tagline: string) => {
    try {
      const updated = await update.mutateAsync({ tagline });
      addToast(t.saved, 'success');
      return updated;
    } catch (err) {
      addToast(errorText(err, t.saveError), 'error');
      return null;
    }
  };

  return (
    <Card as="section" id={DISCOVERY_ANCHOR} className="scroll-mt-24">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className={`text-lg font-semibold ${rubanStrong}`}>
            {t.cardTitle}
          </h2>
          <p className={`max-w-prose ${rubanHelp}`}>{t.cardDesc}</p>
        </div>
        <Link
          href="/player/discovery"
          className="shrink-0 text-xs font-medium text-[var(--or-300,#dea3f6)]"
        >
          {t.browseLink} &rarr;
        </Link>
      </div>

      {cardQ.isError && (
        <div role="alert" className={`mt-4 ${rubanErrBox}`}>
          {t.loadError}
        </div>
      )}

      {cardQ.isPending ? (
        <div className="mt-6 flex items-center justify-center py-6">
          <span className={`h-6 w-6 ${rubanSpinnerRing}`} aria-hidden />
        </div>
      ) : card ? (
        <div className="mt-5 space-y-4">
          <ToggleRow
            title={t.masterSwitchLabel}
            hint={t.masterSwitchHint}
            checked={card.discoverable}
            disabled={pendingKey === 'discoverable'}
            onChange={() => patchBool('discoverable', !card.discoverable)}
            label={t.masterAriaLabel}
          />
          {/* Révélé uniquement quand la découverte est active. */}
          {card.discoverable && (
            <div className="space-y-4">
              <TaglineEditor card={card} onSave={saveTagline} />
              <ToggleRow
                title={t.showRatingsLabel}
                hint={t.showRatingsHint}
                checked={card.showRatings}
                disabled={pendingKey === 'showRatings'}
                onChange={() => patchBool('showRatings', !card.showRatings)}
                label={t.showRatingsAria}
              />
              <ToggleRow
                title={t.showTeamsLabel}
                hint={t.showTeamsHint}
                checked={card.showTeams}
                disabled={pendingKey === 'showTeams'}
                onChange={() => patchBool('showTeams', !card.showTeams)}
                label={t.showTeamsAria}
              />
            </div>
          )}
        </div>
      ) : null}
    </Card>
  );
}
