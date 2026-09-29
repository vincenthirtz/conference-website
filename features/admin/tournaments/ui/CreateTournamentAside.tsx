/* biome-ignore-all lint/performance/noImgElement: image hors next/image (exclusion reprise d’ESLint) */
// features/admin/tournaments/ui/CreateTournamentAside.tsx — colonne de droite
// de la création d'un tournoi (pages/admin/tournaments/create.tsx) : aperçu,
// gabarit retenu, rappels. Plus les classes « Le Ruban » du formulaire.
// Purement présentationnel : l'état du formulaire reste dans la page.

import type nsAdminTournamentsCreate from '@/lib/i18n/locales/admin-fr/adminTournamentsCreate';
import type { TournamentTemplate } from '@/config/tournament-templates';
import Chip from '@/features/admin/_shared/ui/Chip';

type Dict = typeof nsAdminTournamentsCreate.fr;

export const CREATE_CARD =
  'space-y-4 rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-6';
export const CREATE_CARD_TITLE = 'text-[19px] text-[var(--t1,#f4edf7)]';
export const CREATE_LABEL = 'mb-1 block text-sm text-[var(--t2,#c7bfca)]';
export const CREATE_INPUT =
  'w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2.5 text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none';
export const CREATE_HELP = 'mt-1 text-xs text-[var(--t3,#a39ba6)]';
export const CREATE_ERROR =
  'rounded-[var(--r-card,14px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] px-4 py-3 text-sm text-[#ffc2c2]';
export const CREATE_TOGGLE =
  'inline-flex cursor-pointer items-center gap-3 text-sm text-[var(--t2,#c7bfca)]';

type PreviewForm = {
  name: string;
  slug: string;
  game: string;
  status: string;
  is_public: boolean;
  is_featured: boolean;
  logo_url: string;
};

function statusLabel(status: string, t: Dict) {
  switch (status) {
    case 'draft':
      return t.statusDraft;
    case 'published':
      return t.statusPublished;
    case 'running':
      return t.statusRunning;
    case 'completed':
      return t.statusCompleted;
    case 'archived':
      return t.statusArchived;
    default:
      return null;
  }
}

export default function CreateTournamentAside({
  form,
  logoError,
  onLogoError,
  selectedTemplate,
  t,
}: {
  form: PreviewForm;
  logoError: boolean;
  onLogoError: () => void;
  selectedTemplate: TournamentTemplate | null;
  t: Dict;
}) {
  return (
    <aside className="space-y-6">
      <section className={CREATE_CARD}>
        <h2 className={CREATE_CARD_TITLE}>{t.preview}</h2>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            {form.logo_url && !logoError ? (
              <img
                src={form.logo_url}
                alt={t.logoAlt}
                width={48}
                height={48}
                loading="lazy"
                className="h-12 w-12 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] object-cover"
                onError={onLogoError}
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-[var(--r-ctrl,4px)] border-l-[3px] border-[var(--or,#b467d1)] bg-[var(--s3,#2f2732)] font-[family-name:var(--fd)] text-[16px] font-extrabold text-[var(--t1,#f4edf7)]">
                {(form.name || '?').slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate font-semibold text-[var(--t1,#f4edf7)]">
                {form.name || t.nameFallback}
              </p>
              {form.slug && (
                <p className="font-mono text-xs text-[var(--t3,#a39ba6)]">
                  /{form.slug}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Chip tone="neutral">{statusLabel(form.status, t)}</Chip>
            {form.is_public && <Chip tone="ok">{t.badgePublic}</Chip>}
            {form.is_featured && <Chip tone="brand">{t.badgeFeatured}</Chip>}
          </div>

          {form.game && (
            <p className="text-sm text-[var(--t3,#a39ba6)]">{form.game}</p>
          )}
        </div>
      </section>

      {selectedTemplate && (
        <section className={CREATE_CARD}>
          <h2 className={CREATE_CARD_TITLE}>{t.templateSelected}</h2>
          <p className="text-sm font-medium text-[var(--t2,#c7bfca)]">
            {selectedTemplate.name}
          </p>
          <ol className="space-y-2">
            {selectedTemplate.stages.map((s, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="w-4 font-mono text-xs text-[var(--t4,#807984)]">
                  {i + 1}
                </span>
                <Chip tone="brand">{s.name}</Chip>
              </li>
            ))}
          </ol>
          {selectedTemplate.defaults && (
            <p className="rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] px-3 py-2 text-xs text-[var(--t2,#c7bfca)]">
              {t.templateDefaultsApplied}
            </p>
          )}
          <p className="text-xs text-[var(--t3,#a39ba6)]">
            {t.templateStagesNote}
          </p>
        </section>
      )}

      <section className={CREATE_CARD}>
        <h2 className={CREATE_CARD_TITLE}>{t.infoTitle}</h2>
        <ul className="list-disc space-y-2 pl-4 text-xs text-[var(--t3,#a39ba6)] marker:text-[var(--t4,#807984)]">
          <li>{t.infoDraftDefault}</li>
          <li>{t.infoConfigureLater}</li>
          <li>{t.infoSlugUsage}</li>
        </ul>
      </section>
    </aside>
  );
}
