// components/admin/caster/ThemePanel.tsx
//
// Habillage des overlays (lot 5) : sélection du thème actif et édition de ses
// couleurs / polices. Les overlays hébergés lisent `caster_themes` et suivent
// le thème actif en Realtime — un changement se voit à l'antenne sans recharger
// la Browser Source OBS.
//
// PÉRIMÈTRE : couleurs + polices uniquement. Les gabarits (`template`) et le
// repositionnement (`positions`) ne sont PAS appliqués par les overlays React
// (seul le gabarit `default` est porté) — on ne les expose donc pas ici pour ne
// pas promettre un effet qui n'aurait pas lieu. Ces champs sont néanmoins
// PRÉSERVÉS à l'écriture (spread de la data existante) : un thème venu de l'app
// desktop ne les perd pas. Voir docs/CASTER_WEB_COCKPIT.md.

import { useCallback, useEffect, useRef, useState } from 'react';

import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { supabaseClient } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { logCasterAction } from '@/utils/caster/auditClient';
import { normalizeThemeData } from '@/utils/caster/theme';
import type { CasterTheme, CasterThemeColors } from '@/types/casterTheme';

import { inputClass, labelClass } from './fieldClasses';
import nsAdminCasterScenes from '@/lib/i18n/locales/admin-fr/adminCasterScenes';

/** Débounce d'écriture des couleurs : un color picker émet en continu. */
const SAVE_DEBOUNCE_MS = 600;

type Props = {
  themes: CasterTheme[];
  activeId: string | null;
  /** Recharge la liste après une écriture (le Realtime le fait aussi). */
  reload: () => Promise<void>;
};

/** Ordre d'affichage des champs de couleur (libellés résolus dans le rendu). */
const COLOR_KEYS: Array<keyof CasterThemeColors> = [
  'accent1',
  'accent2',
  'accent3',
  'bg',
  'bgCard',
  'text',
  'textMuted',
  'winner',
];

export default function ThemePanel({ themes, activeId, reload }: Props) {
  const t = useAdminT(nsAdminCasterScenes);
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();

  // Thème en cours d'édition : par défaut l'actif.
  const [editingId, setEditingId] = useState<string | null>(activeId);
  useEffect(() => {
    setEditingId((cur) => cur ?? activeId);
  }, [activeId]);

  const editing = themes.find((x) => x.id === editingId) ?? null;
  const data = normalizeThemeData(editing?.data as Record<string, unknown>);

  /** Libellés des couleurs — résolus ici : le dict i18n est typé strictement
   *  (pas d'index signature), donc pas d'accès `t[clé dynamique]`. */
  const colorLabels: Record<keyof CasterThemeColors, string> = {
    accent1: t.themeColorAccent1,
    accent2: t.themeColorAccent2,
    accent3: t.themeColorAccent3,
    bg: t.themeColorBg,
    bgCard: t.themeColorBgCard,
    text: t.themeColorText,
    textMuted: t.themeColorTextMuted,
    winner: t.themeColorWinner,
  };

  // Draft local pour ne pas re-render depuis la base à chaque coup de pinceau.
  const [draftColors, setDraftColors] = useState<CasterThemeColors>(
    data.colors
  );
  const [draftFont, setDraftFont] = useState(data.font);
  const [saving, setSaving] = useState(false);
  const lastLoadedId = useRef<string | null>(editingId);

  // Ré-initialise le draft au changement de thème édité (pas à chaque écho
  // Realtime de nos propres écritures).
  useEffect(() => {
    if (lastLoadedId.current === editingId) return;
    lastLoadedId.current = editingId;
    setDraftColors(data.colors);
    setDraftFont(data.font);
  }, [editingId, data.colors, data.font]);

  const dirty = useRef(false);
  const save = useCallback(async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const raw = (editing.data as Record<string, unknown>) || {};
      const { error } = await supabaseClient
        .from('caster_themes')
        // Spread de la data brute d'abord : `template`, `positions`,
        // `headingFont`… survivent même si l'UI web ne les édite pas.
        .update({
          data: { ...raw, colors: draftColors, font: draftFont },
        })
        .eq('id', editing.id);
      if (error) throw new Error(error.message);
      dirty.current = false;
    } catch (err) {
      logger.error('[ThemePanel] save error', err);
      addToast(
        format(t.themeSaveError, { message: (err as Error)?.message || '' }),
        'error'
      );
    } finally {
      setSaving(false);
    }
  }, [editing, draftColors, draftFont, addToast, t]);

  // Auto-save débouncé — armé seulement après une édition réelle.
  useEffect(() => {
    if (!dirty.current) return undefined;
    const timer = setTimeout(() => void save(), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draftColors, draftFont, save]);

  function patchColor(key: keyof CasterThemeColors, value: string) {
    dirty.current = true;
    setDraftColors((c) => ({ ...c, [key]: value }));
  }

  async function activate(id: string) {
    const target = themes.find((x) => x.id === id);
    if (!target || target.is_active) return;
    // Un seul actif : l'index unique partiel refuserait deux `true`, donc on
    // désactive l'ancien AVANT d'activer le nouveau.
    try {
      if (activeId) {
        const { error: offErr } = await supabaseClient
          .from('caster_themes')
          .update({ is_active: false })
          .eq('id', activeId);
        if (offErr) throw new Error(offErr.message);
      }
      const { error } = await supabaseClient
        .from('caster_themes')
        .update({ is_active: true })
        .eq('id', id);
      if (error) throw new Error(error.message);
      await reload();
      addToast(format(t.themeActivated, { name: target.name }), 'success');
      logCasterAction({
        action: 'caster_theme_activate',
        entityId: id,
        details: { name: target.name },
      });
    } catch (err) {
      logger.error('[ThemePanel] activate error', err);
      addToast(
        format(t.themeActivateError, {
          message: (err as Error)?.message || '',
        }),
        'error'
      );
    }
  }

  async function duplicate() {
    if (!editing) return;
    try {
      const { data: created, error } = await supabaseClient
        .from('caster_themes')
        .insert({
          name: format(t.themeCopyName, { name: editing.name }),
          data: editing.data,
          is_active: false,
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      await reload();
      if (created?.id) setEditingId(created.id as string);
      addToast(t.themeDuplicated, 'success');
    } catch (err) {
      logger.error('[ThemePanel] duplicate error', err);
      addToast(
        format(t.themeSaveError, { message: (err as Error)?.message || '' }),
        'error'
      );
    }
  }

  async function remove() {
    if (!editing || editing.is_active) return;
    const ok = await confirm({
      title: t.themeDeleteTitle,
      subtitle: format(t.themeDeleteBody, { name: editing.name }),
      confirmLabel: t.themeDeleteConfirm,
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const { error } = await supabaseClient
        .from('caster_themes')
        .delete()
        .eq('id', editing.id);
      if (error) throw new Error(error.message);
      setEditingId(activeId);
      await reload();
      addToast(t.themeDeleted, 'success');
    } catch (err) {
      logger.error('[ThemePanel] delete error', err);
      addToast(
        format(t.themeSaveError, { message: (err as Error)?.message || '' }),
        'error'
      );
    }
  }

  return (
    <section
      className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4"
      data-testid="caster-theme-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-lg font-bold">{t.themeTitle}</h2>
        {saving && (
          <span className="text-[11px] text-amber-300" role="status">
            {t.saveSaving}
          </span>
        )}
      </div>
      <p className="text-xs text-neutral-500 mb-4">{t.themeIntro}</p>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4 items-start">
        {/* Liste des thèmes + activation */}
        <div className="space-y-2">
          <span className={labelClass}>{t.themeListLabel}</span>
          <ul className="space-y-1">
            {themes.map((th) => {
              const isEditing = th.id === editingId;
              return (
                <li key={th.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditingId(th.id)}
                    aria-current={isEditing ? 'true' : undefined}
                    className={`flex-1 text-left rounded-lg px-2.5 py-2 text-sm truncate transition ${
                      isEditing
                        ? 'bg-purple-600/20 border border-purple-500/40 text-white'
                        : 'border border-transparent text-neutral-300 hover:bg-neutral-800/60'
                    }`}
                  >
                    {th.name}
                  </button>
                  {th.is_active ? (
                    <span className="shrink-0 rounded-full border border-emerald-500/40 bg-emerald-900/30 px-2 py-0.5 text-[10px] uppercase text-emerald-300">
                      {t.themeActiveBadge}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void activate(th.id)}
                      className="shrink-0 rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1 text-[10px] hover:bg-neutral-700"
                    >
                      {t.themeActivate}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => void duplicate()}
              disabled={!editing}
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-[11px] hover:bg-neutral-700 disabled:opacity-40"
            >
              {t.themeDuplicate}
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              disabled={!editing || editing.is_active}
              title={editing?.is_active ? t.themeDeleteActiveHint : undefined}
              className="rounded-lg border border-red-500/40 bg-red-900/30 px-2.5 py-1.5 text-[11px] text-red-200 hover:bg-red-900/50 disabled:opacity-40"
            >
              {t.themeDelete}
            </button>
          </div>
        </div>

        {/* Édition couleurs + police */}
        {editing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {COLOR_KEYS.map((key) => {
                const label = colorLabels[key];
                return (
                  <label key={key} className="block">
                    <span className="block text-[11px] text-neutral-400 mb-1">
                      {label}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={draftColors[key]}
                        onChange={(e) => patchColor(key, e.target.value)}
                        aria-label={label}
                        className="h-8 w-8 shrink-0 cursor-pointer rounded border border-neutral-700 bg-neutral-950 p-0.5"
                      />
                      <input
                        type="text"
                        value={draftColors[key]}
                        onChange={(e) => patchColor(key, e.target.value)}
                        className={`${inputClass} font-mono text-[11px]`}
                      />
                    </span>
                  </label>
                );
              })}
            </div>

            <label className="block max-w-sm">
              <span className={labelClass}>{t.themeFontLabel}</span>
              <input
                type="text"
                value={draftFont}
                onChange={(e) => {
                  dirty.current = true;
                  setDraftFont(e.target.value);
                }}
                placeholder="Segoe UI"
                className={inputClass}
              />
            </label>

            {/* Aperçu : mêmes variables que celles posées sur les overlays. */}
            <div
              className="rounded-xl border border-neutral-800 p-4"
              style={{
                background: draftColors.bg,
                color: draftColors.text,
                fontFamily: `${draftFont}, system-ui, sans-serif`,
              }}
            >
              <p className="text-[11px] uppercase tracking-wider mb-2 opacity-70">
                {t.themePreview}
              </p>
              <div
                className="inline-flex items-stretch overflow-hidden rounded-lg"
                style={{ background: draftColors.bgCard }}
              >
                <span className="px-3 py-2 text-sm font-bold uppercase">
                  {t.themePreviewTeam1}
                </span>
                <span
                  className="px-3 py-2 text-lg font-extrabold"
                  style={{ background: draftColors.accent1, color: '#0b0b14' }}
                >
                  2
                </span>
                <span
                  className="px-2 py-2 text-[11px] self-center"
                  style={{ color: draftColors.textMuted }}
                >
                  VS
                </span>
                <span
                  className="px-3 py-2 text-lg font-extrabold"
                  style={{ background: draftColors.accent2, color: '#0b0b14' }}
                >
                  1
                </span>
                <span className="px-3 py-2 text-sm font-bold uppercase">
                  {t.themePreviewTeam2}
                </span>
              </div>
              <p
                className="mt-2 text-[11px]"
                style={{ color: draftColors.accent3 }}
              >
                {t.themePreviewMap}
              </p>
            </div>

            <p className="text-[11px] text-neutral-600">{t.themeScopeNote}</p>
          </div>
        ) : (
          <p className="text-sm text-neutral-500">{t.themeNone}</p>
        )}
      </div>
      {dialog}
    </section>
  );
}
