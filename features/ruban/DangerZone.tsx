// features/ruban/DangerZone.tsx — la zone sensible de l'archétype
// Fiche : « Ces actions engagent des données que d'autres écrans consomment.
// Chacune demande une confirmation par saisie du nom. »
//
// Taper le nom et non cliquer « OK » : un clic de confirmation se donne par
// réflexe, un nom se tape en sachant ce qu'on vise.

import { useId, useState, type ReactNode } from 'react';
import Button from './Button';

export type DangerAction = {
  id: string;
  title: ReactNode;
  description: ReactNode;
  /** Libellé du bouton (« EXÉCUTER »). */
  actionLabel: string;
  onConfirm: () => Promise<unknown> | unknown;
};

function DangerRow({
  action,
  confirmName,
  labels,
}: {
  action: DangerAction;
  confirmName: string;
  labels: DangerZoneLabels;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const matches =
    typed.trim() === confirmName.trim() && confirmName.trim() !== '';

  const run = async () => {
    setBusy(true);
    try {
      await action.onConfirm();
      setOpen(false);
      setTyped('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14.5px] text-[var(--t1,#f4edf7)]">
            {action.title}
          </p>
          <p className="mt-0.5 text-[12.5px] text-[var(--t3,#a39ba6)]">
            {action.description}
          </p>
        </div>
        {!open && (
          <Button variant="danger" size="xs" onClick={() => setOpen(true)}>
            {action.actionLabel}
          </Button>
        )}
      </div>
      {open && (
        <div className="mt-3 flex flex-wrap items-end gap-2.5">
          <div className="min-w-[220px] flex-1">
            <label
              htmlFor={id}
              className="mb-1 block text-[12px] text-[var(--t3,#a39ba6)]"
            >
              {labels.typeToConfirm.replace('{name}', confirmName)}
            </label>
            <input
              id={id}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="h-[38px] w-full rounded-[var(--r-ctrl,4px)] border border-[rgba(255,107,107,.45)] bg-[var(--s1,#100812)] px-3 text-[13px] text-[var(--t1,#f4edf7)] outline-none"
            />
          </div>
          <Button
            size="sm"
            onClick={() => {
              setOpen(false);
              setTyped('');
            }}
          >
            {labels.cancel}
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={!matches || busy}
            onClick={() => void run()}
          >
            {action.actionLabel}
          </Button>
        </div>
      )}
    </li>
  );
}

export type DangerZoneLabels = {
  title: string;
  intro: string;
  /** « Tapez « {name} » pour confirmer ». */
  typeToConfirm: string;
  cancel: string;
};

export default function DangerZone({
  confirmName,
  actions,
  labels,
}: {
  /** Nom à retaper (celui de l'entité). */
  confirmName: string;
  actions: DangerAction[];
  labels: DangerZoneLabels;
}) {
  return (
    <section className="rounded-[var(--r-card,14px)] border border-[rgba(255,107,107,.45)] bg-[var(--s1,#100812)] p-6">
      <h2 className="text-[19px] text-[var(--err,#ff6b6b)]">{labels.title}</h2>
      <p className="mt-2 mb-5 text-[13px] text-[var(--t3,#a39ba6)]">
        {labels.intro}
      </p>
      <ul className="flex flex-col gap-3">
        {actions.map((a) => (
          <DangerRow
            key={a.id}
            action={a}
            confirmName={confirmName}
            labels={labels}
          />
        ))}
      </ul>
    </section>
  );
}
