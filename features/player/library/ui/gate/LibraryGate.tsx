// features/player/library/ui/gate/LibraryGate.tsx — la porte de la Women's
// Library (lot 2 côté API, lot 4 côté écran, docs/PLAN-womens-library.md).
//
//   - `attest` : première entrée. La case « J'ai 18 ans ou plus », une ligne
//     sur le POURQUOI, et le lien vers /securite (ouvert à toutes, majeures
//     ou non). Rien ne part sans la case cochée.
//   - `minor`  : une adhérente dont la date de naissance connue la rend
//     mineure. Refus bienveillant, et le même lien vers /securite.
//   - `banned` : message neutre, sans motif ; un lien vers l'équipe.
//   - `unavailable` / `error` : la Library ne répond pas ; on peut réessayer.
// Présentationnel : l'attestation et la relecture arrivent par les props.

import Link from 'next/link';
import { type FormEvent, useId, useState } from 'react';
import { useT } from '@/lib/i18n/useT';
import nsPlayerLibrary from '@/lib/i18n/locales/fr/playerLibrary';
import { Button, Card } from '@/features/ruban';
import type { ActionResult } from '../../hooks/useLibraryActions';
import type { LibraryGate as Gate } from '../../model';

const LINK =
  'font-medium text-[var(--or-300,#dea3f6)] underline underline-offset-4 hover:text-[var(--or-200,#eec4ff)]';

export default function LibraryGate({
  gate,
  attesting,
  onAttest,
  onRetry,
}: {
  gate: Exclude<Gate, 'ready' | 'loading'>;
  attesting: boolean;
  onAttest: () => Promise<ActionResult<unknown>>;
  onRetry: () => void;
}) {
  const t = useT(nsPlayerLibrary);
  const ids = useId();
  const [checked, setChecked] = useState(false);
  const [failed, setFailed] = useState(false);

  if (gate === 'attest') {
    const submit = async (e: FormEvent) => {
      e.preventDefault();
      if (!checked || attesting) return;
      setFailed(false);
      const result = await onAttest();
      if (!result.ok) setFailed(true);
    };
    return (
      <Card as="section" aria-labelledby={`${ids}-title`} className="max-w-xl">
        <h2
          id={`${ids}-title`}
          className="text-xl font-bold text-[var(--t1,#f4edf7)]"
        >
          {t.gateTitle}
        </h2>
        <p className="mt-2 text-sm text-[var(--t2,#c7bfca)]">{t.gateWhy}</p>
        <form
          onSubmit={(e) => void submit(e)}
          className="mt-4 flex flex-col gap-4"
        >
          <label className="flex items-center gap-3 text-base text-[var(--t1,#f4edf7)]">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="h-5 w-5"
            />
            {t.gateCheckbox}
          </label>
          <div className="flex flex-wrap items-center gap-4">
            <Button
              type="submit"
              variant="primary"
              disabled={!checked || attesting}
              aria-busy={attesting}
            >
              {attesting ? t.gateSubmitting : t.gateSubmit}
            </Button>
            <Link prefetch={false} href="/securite" className={LINK}>
              {t.safetyLink}
            </Link>
          </div>
          {failed && (
            <p role="alert" className="text-sm text-[var(--err,#ff6b6b)]">
              {t.gateError}
            </p>
          )}
        </form>
      </Card>
    );
  }

  const content =
    gate === 'minor'
      ? {
          title: t.minorTitle,
          body: t.minorBody,
          link: { href: '/securite', label: t.safetyLink },
        }
      : gate === 'banned'
        ? {
            title: t.bannedTitle,
            body: t.bannedBody,
            link: { href: '/support', label: t.supportLink },
          }
        : {
            title: t.title,
            body: gate === 'unavailable' ? t.unavailable : t.loadError,
            link: null,
          };

  return (
    <Card
      as="section"
      aria-labelledby={`${ids}-title`}
      data-gate={gate}
      className="max-w-xl"
    >
      <h2
        id={`${ids}-title`}
        className="text-xl font-bold text-[var(--t1,#f4edf7)]"
      >
        {content.title}
      </h2>
      <p className="mt-2 text-sm text-[var(--t2,#c7bfca)]">{content.body}</p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        {content.link && (
          <Link prefetch={false} href={content.link.href} className={LINK}>
            {content.link.label}
          </Link>
        )}
        {(gate === 'unavailable' || gate === 'error') && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {t.retry}
          </Button>
        )}
      </div>
    </Card>
  );
}
