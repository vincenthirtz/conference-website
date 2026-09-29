// features/player/team/ui/pageEditor/ListFolds.tsx — listes de la page
// publique (lot P10) : palmarès et sponsors. Une ligne = un objet de la
// liste du formulaire (`setValue` de la liste entière, pas d'état local).

import { inputClass } from '@/features/ruban/FormField';
import { FicheFold } from '@/features/player/_shared/ui';
import {
  ACHIEVEMENT_TITLE_MAX,
  ACHIEVEMENT_TOURNAMENT_MAX,
  ACHIEVEMENTS_MAX,
  SPONSOR_NAME_MAX,
  SPONSORS_MAX,
} from '@/utils/markdown/teamPublicMarkdown';
import type { TeamPageEditorState } from '../../hooks/useTeamPageEditor';
import { FieldNote } from './EditorFields';

const rowClass =
  'flex flex-col gap-2 rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] p-3';
const removeClass =
  'min-h-11 shrink-0 px-2 text-[12.5px] text-[var(--err,#ff6b6b)] hover:underline';
const addClass =
  'min-h-11 w-full rounded-[var(--r-ctrl,4px)] border border-dashed border-[var(--line2,rgba(194,196,201,.2))] px-3 py-2 text-sm text-[var(--or,#b467d1)] hover:bg-[var(--s2,#1d1520)]';

function Counter({ count, max }: { count: number; max: number }) {
  return (
    <span className="text-[12.5px] text-[var(--t4,#807984)]">
      {count}/{max}
    </span>
  );
}

export function AchievementsFold({ editor }: { editor: TeamPageEditorState }) {
  const { t, form } = editor;
  const items = form.values.achievements;
  const update = (idx: number, patch: Partial<(typeof items)[number]>) =>
    form.setValue(
      'achievements',
      items.map((it, i) => (i === idx ? { ...it, ...patch } : it))
    );

  return (
    <FicheFold title={t.achievementsSection}>
      <div className="flex flex-col gap-3">
        <div className="flex justify-end">
          <Counter count={items.length} max={ACHIEVEMENTS_MAX} />
        </div>
        {items.length === 0 && <FieldNote>{t.achievementsEmpty}</FieldNote>}
        {items.map((a, idx) => (
          <div key={idx} className={rowClass}>
            <div className="flex gap-2">
              <input
                type="text"
                value={a.title}
                maxLength={ACHIEVEMENT_TITLE_MAX}
                placeholder={t.achievementTitlePlaceholder}
                aria-label={t.achievementTitlePlaceholder}
                onChange={(e) => update(idx, { title: e.target.value })}
                className={inputClass}
              />
              <button
                type="button"
                onClick={() =>
                  form.setValue(
                    'achievements',
                    items.filter((_, i) => i !== idx)
                  )
                }
                className={removeClass}
                aria-label={t.delete}
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                type="date"
                value={a.date ?? ''}
                onChange={(e) => update(idx, { date: e.target.value || null })}
                className={inputClass}
              />
              <input
                type="text"
                value={a.tournament ?? ''}
                maxLength={ACHIEVEMENT_TOURNAMENT_MAX}
                placeholder={t.achievementTournamentPlaceholder}
                aria-label={t.achievementTournamentPlaceholder}
                onChange={(e) =>
                  update(idx, { tournament: e.target.value || null })
                }
                className={inputClass}
              />
            </div>
          </div>
        ))}
        {items.length < ACHIEVEMENTS_MAX && (
          <button
            type="button"
            onClick={() =>
              form.setValue('achievements', [
                ...items,
                { title: '', date: null, tournament: null },
              ])
            }
            className={addClass}
          >
            {t.addAchievement}
          </button>
        )}
      </div>
    </FicheFold>
  );
}

export function SponsorsFold({ editor }: { editor: TeamPageEditorState }) {
  const { t, form } = editor;
  const items = form.values.sponsors;
  const update = (idx: number, patch: Partial<(typeof items)[number]>) =>
    form.setValue(
      'sponsors',
      items.map((it, i) => (i === idx ? { ...it, ...patch } : it))
    );

  return (
    <FicheFold title={t.sponsorsSection}>
      <div className="flex flex-col gap-3">
        <div className="flex justify-end">
          <Counter count={items.length} max={SPONSORS_MAX} />
        </div>
        {items.length === 0 && <FieldNote>{t.sponsorsEmpty}</FieldNote>}
        {items.map((s, idx) => (
          <div key={idx} className={rowClass}>
            <div className="flex gap-2">
              <input
                type="text"
                value={s.name}
                maxLength={SPONSOR_NAME_MAX}
                placeholder={t.sponsorNamePlaceholder}
                aria-label={t.sponsorNamePlaceholder}
                onChange={(e) => update(idx, { name: e.target.value })}
                className={inputClass}
              />
              <button
                type="button"
                onClick={() =>
                  form.setValue(
                    'sponsors',
                    items.filter((_, i) => i !== idx)
                  )
                }
                className={removeClass}
                aria-label={t.delete}
              >
                ✕
              </button>
            </div>
            <input
              type="text"
              value={s.logo_url ?? ''}
              placeholder={t.sponsorLogoPlaceholder}
              aria-label={t.sponsorLogoPlaceholder}
              onChange={(e) =>
                update(idx, { logo_url: e.target.value || null })
              }
              className={`${inputClass} font-mono`}
            />
            <input
              type="text"
              value={s.url ?? ''}
              placeholder={t.sponsorUrlPlaceholder}
              aria-label={t.sponsorUrlPlaceholder}
              onChange={(e) => update(idx, { url: e.target.value || null })}
              className={`${inputClass} font-mono`}
            />
          </div>
        ))}
        {items.length < SPONSORS_MAX && (
          <button
            type="button"
            onClick={() =>
              form.setValue('sponsors', [
                ...items,
                { name: '', logo_url: null, url: null },
              ])
            }
            className={addClass}
          >
            {t.addSponsor}
          </button>
        )}
      </div>
    </FicheFold>
  );
}
