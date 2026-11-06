// features/admin/tournaments/ui/TournamentRulesSection.tsx — la section
// « Règlement » de l'édition du tournoi : déposer une version (PDF), la liste
// des versions (téléchargement), les validations équipe par équipe.
//
// AUTONOME, comme la playlist « Reviews » : le dépôt part tout de suite, sans
// passer par « Enregistrer » (le réglage, lui, est un champ du formulaire —
// TournamentRulesToggle). Logée DANS le <form> de l'édition : aucun <form>
// imbriqué ici, et chaque bouton est `type="button"`.
//
// Contrat (conference-api) :
//   GET  /api/admin/tournament/[id]/rules         → { required, versions }
//   POST /api/admin/tournament/[id]/rules         { data, mimeType, filename,
//        requiresRevalidation, note } → la version créée (idempotence + journal)
//   GET  /api/admin/tournament/[id]/rules/status  → { teams: [...] }
//   GET  /api/tournaments/[id]/rules/file?version=n → le PDF (téléchargement)

import { useRef, useState } from 'react';
import {
  Button,
  rubanCardPadded,
  rubanErr,
  rubanFormInput,
  rubanFormLabel,
  rubanHelp,
  rubanMuted,
  rubanOk,
  rubanWarn,
} from '@/features/ruban';
import { serverErrorText } from '@/features/admin/_shared/serverErrorText';
import { format, useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminTournamentRules from '@/lib/i18n/locales/admin-fr/adminTournamentRules';
import {
  useTournamentRulesOverview,
  useUploadTournamentRules,
} from '../hooks/useTournamentRules';
import {
  RULES_NOTE_MAX,
  checkRulesFile,
  readAsPdfDataUrl,
  type RulesFileProblem,
} from '../rulesUpload';
import {
  RulesValidationsList,
  RulesVersionsList,
} from './TournamentRulesLists';

type T = typeof nsAdminTournamentRules.fr;

type Outcome =
  | { kind: 'ok'; number: number | null; important: boolean }
  | { kind: 'error'; message: string }
  | null;

function problemText(p: RulesFileProblem, t: T): string {
  if (p === 'too_large') return t.errorTooLarge;
  if (p === 'bad_signature') return t.errorNotPdf;
  return t.errorPdfOnly;
}

export default function TournamentRulesSection({
  tournamentId,
}: {
  tournamentId: string;
}) {
  const t = useAdminT(nsAdminTournamentRules);
  const { versions, status, required } =
    useTournamentRulesOverview(tournamentId);
  const upload = useUploadTournamentRules(tournamentId);

  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  const [important, setImportant] = useState(true);
  const [note, setNote] = useState('');
  const [outcome, setOutcome] = useState<Outcome>(null);
  const busy = upload.isPending;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    setOutcome(null);
    setFileProblem(null);
    setFile(null);
    if (!picked) return;
    const problem = await checkRulesFile(picked);
    if (problem) {
      setFileProblem(problemText(problem, t));
      e.target.value = '';
      return;
    }
    setFile(picked);
  }

  async function handleSubmit() {
    setOutcome(null);
    if (!file) {
      setFileProblem(t.errorNoFile);
      return;
    }
    try {
      const data = await readAsPdfDataUrl(file);
      const res = await upload.mutateAsync({
        data,
        mimeType: 'application/pdf',
        filename: file.name,
        requiresRevalidation: important,
        note: note.trim() ? note.trim().slice(0, RULES_NOTE_MAX) : null,
      });
      const number = res?.version?.number ?? res?.number ?? null;
      setOutcome({ kind: 'ok', number, important });
      setFile(null);
      setNote('');
      setImportant(true);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      const server = serverErrorText(err);
      setOutcome({
        kind: 'error',
        message: server ? `${t.errorUpload} ${server}` : t.errorUpload,
      });
    }
  }

  const list = versions.data?.versions ?? [];
  const sorted = [...list].sort((a, b) => b.number - a.number);

  return (
    <section
      className={rubanCardPadded}
      aria-labelledby="tournament-rules-section-title"
      data-testid="tournament-rules-section"
    >
      <h2
        id="tournament-rules-section-title"
        className="mb-2 text-lg font-semibold text-[var(--t1,#f4edf7)]"
      >
        {t.sectionTitle}
      </h2>
      <p className={`mb-4 text-sm ${rubanMuted}`}>{t.sectionIntro}</p>

      {versions.isPending && (
        <p role="status" className={`text-sm ${rubanMuted}`}>
          {t.loading}
        </p>
      )}
      {versions.isError && (
        <div role="alert" className={`${rubanErr} mb-4 px-3 py-2 text-sm`}>
          {t.loadError}{' '}
          <Button
            size="xs"
            variant="ghost"
            onClick={() => void versions.refetch()}
          >
            {t.refresh}
          </Button>
        </div>
      )}

      {versions.data && !required && (
        <p className={`${rubanWarn} mb-4 px-3 py-2 text-sm`}>{t.requiredOff}</p>
      )}
      {versions.data && required && list.length === 0 && (
        <p role="alert" className={`${rubanWarn} mb-4 px-3 py-2 text-sm`}>
          {t.requiredNoVersion}
        </p>
      )}

      {/* Dépôt d'une version */}
      <fieldset
        className="mb-6 space-y-4 rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] p-4"
        disabled={busy}
      >
        <legend className="px-1 text-sm font-semibold text-[var(--t1,#f4edf7)]">
          {t.uploadTitle}
        </legend>
        <div>
          <label htmlFor="tournament-rules-file" className={rubanFormLabel}>
            {t.fileLabel}
          </label>
          <input
            ref={fileRef}
            id="tournament-rules-file"
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => void handleFile(e)}
            className="block w-full text-sm text-[var(--t2,#c7bfca)] file:mr-3 file:rounded-[var(--r-ctrl,4px)] file:border file:border-[var(--line2,rgba(194,196,201,.2))] file:bg-transparent file:px-3 file:py-1.5 file:text-[var(--t1,#f4edf7)]"
          />
          {fileProblem && (
            <p role="alert" className="mt-1 text-xs text-[var(--err,#ff6b6b)]">
              {fileProblem}
            </p>
          )}
        </div>
        <div>
          <label
            htmlFor="tournament-rules-important"
            className="flex cursor-pointer items-start gap-3 text-sm text-[var(--t1,#f4edf7)]"
          >
            <input
              id="tournament-rules-important"
              type="checkbox"
              className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--or,#b467d1)]"
              checked={important}
              onChange={(e) => setImportant(e.target.checked)}
              aria-describedby="tournament-rules-important-help"
            />
            <span>{t.importantLabel}</span>
          </label>
          <p
            id="tournament-rules-important-help"
            className={`${rubanHelp} pl-8`}
          >
            {t.importantHelp}
          </p>
        </div>
        <div>
          <label htmlFor="tournament-rules-note" className={rubanFormLabel}>
            {t.noteLabel}
          </label>
          <textarea
            id="tournament-rules-note"
            rows={3}
            maxLength={RULES_NOTE_MAX}
            className={rubanFormInput}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t.notePlaceholder}
          />
          <p className={`${rubanHelp} text-right`} data-numeric>
            {format(t.noteCount, { count: note.length })}
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => void handleSubmit()}
          disabled={busy || !file}
        >
          {busy ? t.submitting : t.submit}
        </Button>
        {outcome?.kind === 'ok' && (
          <p role="status" className={`${rubanOk} px-3 py-2 text-sm`}>
            {outcome.number == null
              ? t.uploadedNoNumber
              : format(
                  outcome.important ? t.uploadedImportant : t.uploadedMinor,
                  {
                    number: outcome.number,
                  }
                )}
          </p>
        )}
        {outcome?.kind === 'error' && (
          <p role="alert" className={`${rubanErr} px-3 py-2 text-sm`}>
            {outcome.message}
          </p>
        )}
      </fieldset>

      <RulesVersionsList tournamentId={tournamentId} versions={sorted} t={t} />

      {required && (
        <RulesValidationsList
          query={status}
          t={t}
          onRefresh={() => void status.refetch()}
        />
      )}
    </section>
  );
}
