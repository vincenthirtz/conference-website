// components/player/HeroPreferencesCard.tsx
//
// Carte « Mes héros » : trois héros préférés, trois héros évités.
//
// POURQUOI CETTE CARTE EST DANS LE PROFIL ET PAS DANS UN JEU. Ces listes
// existaient déjà dans `/hero-picker`, mais en mémoire du navigateur : rien
// n'était conservé. Persistées, elles décident du personnage qui représentera
// la joueuse sur sa carte à collectionner faute de photo — c'est pourquoi la
// conséquence est écrite AVANT les listes, et non découverte après coup.
//
// ENREGISTREMENT EXPLICITE, PAS OPTIMISTE. `PUT /api/player/hero-preferences`
// remplace les DEUX listes d'un bloc : elles sont liées (un héros ne peut pas
// être à la fois préféré et évité), et enregistrer chaque clic séparément
// ferait transiter la paire par des états contradictoires. La joueuse compose
// donc son choix, puis l'enregistre — même patron que l'accroche de
// `DiscoveryCard`.
//
// LE SERVEUR RESTE L'AUTORITÉ. Cet écran retire des menus les héros déjà
// employés, ce qui rend doublons et contradictions difficiles à produire ; il
// ne les rend pas impossibles (deux onglets, une requête forgée). L'API
// revalide tout, et c'est sa réponse — pas l'état local — qui est réaffichée.
//
// AUCUNE IMAGE DE HÉROS n'est affichée : le dépôt n'utilise pas d'imagerie
// générée et ne dispose d'aucune illustration sous licence pour ces
// personnages. On montre des NOMS.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useT, format } from '@/lib/i18n/useT';
import { logger } from '../../utils/logger';
import {
  HERO_PREFERENCE_SLOTS,
  OVERWATCH_HEROES,
  getOverwatchHero,
  type OverwatchRole,
} from '@/utils/heroes/overwatch';
import nsPlayerHeroPrefs from '@/lib/i18n/locales/fr/playerHeroPrefs';

/** Forme rendue par GET et PUT /api/player/hero-preferences. */
type Prefs = { picks: string[]; bans: string[]; slots: number };

const ROLE_ORDER: readonly OverwatchRole[] = ['Tank', 'Damage', 'Support'];

export default function HeroPreferencesCard() {
  const t = useT(nsPlayerHeroPrefs);
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  const { addToast } = useToast();

  // `saved` = l'état en base, `picks`/`bans` = l'état en cours d'édition. Les
  // garder distincts est ce qui permet de savoir s'il y a quelque chose à
  // enregistrer, et de revenir en arrière sans relire le serveur.
  const [saved, setSaved] = useState<Prefs | null>(null);
  const [picks, setPicks] = useState<string[]>([]);
  const [bans, setBans] = useState<string[]>([]);
  const [slots, setSlots] = useState(HERO_PREFERENCE_SLOTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const apply = useCallback((data: Prefs) => {
    setSaved(data);
    setPicks(data.picks ?? []);
    setBans(data.bans ?? []);
    // Le nombre d'emplacements vient du serveur : le recopier ici ferait mentir
    // l'écran au premier réglage.
    if (typeof data.slots === 'number') setSlots(data.slots);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      apply(
        await adminFetchJson<Prefs>('/api/player/hero-preferences', {
          skipAuthRedirect: true,
        })
      );
    } catch (err) {
      logger.error('[player/hero-preferences] load error:', err);
      setError(t.loadError);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, apply, t]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Un héros déjà employé d'un côté ou de l'autre ne doit plus être offert. */
  const used = useMemo(
    () => new Set<string>([...picks, ...bans]),
    [picks, bans]
  );

  const dirty = useMemo(() => {
    if (!saved) return false;
    const same = (a: string[], b: string[]) =>
      a.length === b.length && a.every((v, i) => v === b[i]);
    return !same(picks, saved.picks ?? []) || !same(bans, saved.bans ?? []);
  }, [picks, bans, saved]);

  const onSave = async () => {
    setSaving(true);
    try {
      // On réaffiche ce que le SERVEUR rend, pas ce qu'on lui a envoyé.
      apply(
        await adminFetchJson<Prefs>('/api/player/hero-preferences', {
          method: 'PUT',
          body: JSON.stringify({ picks, bans }),
        })
      );
      addToast(t.saved, 'success');
    } catch (err) {
      logger.error('[player/hero-preferences] save error:', err);
      addToast((err as Error)?.message || t.saveError, 'error');
    } finally {
      setSaving(false);
    }
  };

  const roleLabel = (role: OverwatchRole) =>
    role === 'Tank'
      ? t.roleTank
      : role === 'Damage'
        ? t.roleDamage
        : t.roleSupport;

  /** Une liste de trois emplacements : les remplis, puis un menu s'il reste de la place. */
  const renderList = (
    kind: 'picks' | 'bans',
    list: string[],
    setList: (next: string[]) => void,
    title: string,
    hint: string,
    addLabel: string
  ) => (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
      <p className="text-sm font-medium text-white">{title}</p>
      <p className="mt-0.5 text-xs text-gray-500">{hint}</p>

      <ul className="mt-3 space-y-2">
        {Array.from({ length: slots }, (_, i) => {
          const hero = list[i];
          if (!hero) {
            return (
              <li
                key={`${kind}-empty-${i}`}
                className="rounded-lg border border-dashed border-white/10 px-3 py-2 text-xs text-gray-600"
              >
                {t.slotEmpty}
              </li>
            );
          }
          const known = getOverwatchHero(hero);
          return (
            <li
              key={`${kind}-${hero}`}
              className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-white">
                {hero}
              </span>
              {known && (
                <span className="shrink-0 text-xs text-gray-500">
                  {roleLabel(known.role)}
                </span>
              )}
              <button
                type="button"
                onClick={() => setList(list.filter((h) => h !== hero))}
                aria-label={format(t.removeAria, { hero })}
                className="shrink-0 rounded-md px-2 py-1 text-xs text-gray-400 hover:bg-white/10 hover:text-white transition"
              >
                &times;
              </button>
            </li>
          );
        })}
      </ul>

      {list.length < slots && (
        <label className="mt-3 block">
          <span className="sr-only">{addLabel}</span>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) setList([...list, e.target.value]);
            }}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-purple-500/50 focus:outline-none"
          >
            <option value="">{t.choosePlaceholder}</option>
            {/* Groupés par rôle, les héros déjà employés étant retirés. */}
            {ROLE_ORDER.map((role) => (
              <optgroup key={role} label={roleLabel(role)}>
                {OVERWATCH_HEROES.filter(
                  (h) => h.role === role && !used.has(h.name)
                ).map((h) => (
                  <option key={h.name} value={h.name}>
                    {h.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      )}
    </div>
  );

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
      <h2 className="text-lg font-semibold">{t.title}</h2>
      <p className="mt-1 max-w-prose text-sm text-gray-400">{t.intro}</p>
      {/* La conséquence visible, dite avant les listes. */}
      <p className="mt-2 max-w-prose text-xs text-gray-500">{t.tcgNote}</p>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-6 flex items-center justify-center py-6">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-purple-400" />
        </div>
      ) : (
        saved && (
          <div className="mt-5 space-y-4">
            {renderList(
              'picks',
              picks,
              setPicks,
              t.picksTitle,
              t.picksHint,
              t.addPick
            )}
            {renderList(
              'bans',
              bans,
              setBans,
              t.bansTitle,
              t.bansHint,
              t.addBan
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => apply(saved)}
                disabled={!dirty || saving}
                className="px-4 py-2 rounded-xl text-sm text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {t.reset}
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={!dirty || saving}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition"
              >
                {saving ? t.saving : t.save}
              </button>
            </div>
          </div>
        )
      )}
    </section>
  );
}
