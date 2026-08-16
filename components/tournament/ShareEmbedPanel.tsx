// components/tournament/ShareEmbedPanel.tsx

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/Toast';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useT, format } from '@/lib/i18n/useT';
import nsShareEmbed from '@/lib/i18n/locales/fr/shareEmbed';

type WidgetKey = 'bracket' | 'standings' | 'schedule' | 'ffa';

type WidgetDef = {
  key: WidgetKey;
  name: string;
  height: number;
};

type EmbedTheme = 'light' | 'dark';

export type ShareEmbedPanelProps = {
  /** Canonical slug when available, otherwise the tournament id. */
  slugOrId: string;
  /** Display name, used in share sheets. Falls back to a generic label. */
  name?: string;
  /** Whether the tournament has an FFA stage (adds the FFA embed widget). */
  hasFfa?: boolean;
  /** Optional visual variant for the trigger button. */
  variant?: 'primary' | 'compact';
  /** Extra classes for the trigger button. */
  className?: string;
};

/** Robust clipboard write with an execCommand fallback for older browsers. */
async function copyText(value: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Public "Partager / Intégrer" panel for tournament pages.
 *
 * Opens an accessible dialog offering:
 *  - the canonical public link (copy + native share sheet)
 *  - a compact X / Bluesky share row
 *  - ready-to-paste iframe embed snippets (bracket / standings / schedule,
 *    plus FFA when the tournament has an FFA stage), sharing a theme toggle.
 *
 * Mirrors the admin snippet format but is fully public and non-PII.
 */
export default function ShareEmbedPanel({
  slugOrId,
  name,
  hasFfa = false,
  variant = 'primary',
  className = '',
}: ShareEmbedPanelProps) {
  const t = useT(nsShareEmbed);
  const { addToast } = useToast();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<EmbedTheme>('dark');
  const [accentOn, setAccentOn] = useState(false);
  const [accent, setAccent] = useState('#8b5cf6');
  const [copiedWidget, setCopiedWidget] = useState<WidgetKey | null>(null);
  const dialogRef = useFocusTrap<HTMLDivElement>();

  // Base URL canonique (pour les snippets iframe à coller sur un site tiers) :
  // env d'abord, sinon l'origine courante. On retire tout slash final pour ne
  // pas produire d'URL `//embed/...` (double slash → 404 côté routeur).
  const [base, setBase] = useState<string>(
    (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/+$/, '')
  );
  useEffect(() => {
    if (!base && typeof window !== 'undefined') {
      setBase(window.location.origin.replace(/\/+$/, ''));
    }
  }, [base]);

  // Base pour le lien « Ouvrir le widget » (prévisualisation) : l'origine
  // réelle où l'utilisateur navigue, pour que l'aperçu s'ouvre sur le MÊME
  // serveur (marche quel que soit le port de dev, indépendamment de l'env).
  const openBase =
    typeof window !== 'undefined'
      ? window.location.origin.replace(/\/+$/, '')
      : base;

  const publicPath = `/tournament/${slugOrId}`;
  const publicUrl = base ? `${base}${publicPath}` : publicPath;
  const shareTitle = name ?? t.genericName;
  const shareText = name ? format(t.shareText, { name }) : t.shareTextGeneric;

  const widgets = useMemo<WidgetDef[]>(() => {
    const list: WidgetDef[] = [
      { key: 'bracket', name: t.bracketName, height: 600 },
      { key: 'standings', name: t.standingsName, height: 480 },
      { key: 'schedule', name: t.scheduleName, height: 520 },
    ];
    if (hasFfa) {
      list.push({ key: 'ffa', name: t.ffaName, height: 480 });
    }
    return list;
  }, [hasFfa, t.bracketName, t.standingsName, t.scheduleName, t.ffaName]);

  // Close on Escape (focus trap handles Tab looping + focus restore).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const handleShare = useCallback(async () => {
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function'
    ) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: publicUrl,
        });
        return;
      } catch (err) {
        // User dismissed the native sheet: no error toast.
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // Otherwise fall back to copy below.
      }
    }
    const ok = await copyText(publicUrl);
    addToast(ok ? t.linkCopied : t.shareError, ok ? 'success' : 'error');
  }, [shareTitle, shareText, publicUrl, addToast, t.linkCopied, t.shareError]);

  const handleCopyLink = useCallback(async () => {
    const ok = await copyText(publicUrl);
    addToast(ok ? t.linkCopied : t.shareError, ok ? 'success' : 'error');
  }, [publicUrl, addToast, t.linkCopied, t.shareError]);

  const handleCopySnippet = useCallback(
    async (snippet: string, key: WidgetKey) => {
      const ok = await copyText(snippet);
      if (ok) {
        setCopiedWidget(key);
        window.setTimeout(
          () => setCopiedWidget((v) => (v === key ? null : v)),
          1500
        );
        addToast(t.snippetCopied, 'success');
      } else {
        addToast(t.shareError, 'error');
      }
    },
    [addToast, t.snippetCopied, t.shareError]
  );

  const encodedUrl = encodeURIComponent(publicUrl);
  const encodedText = encodeURIComponent(shareText);
  const xUrl = `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`;
  const blueskyUrl = `https://bsky.app/intent/compose?text=${encodeURIComponent(
    `${shareText} ${publicUrl}`
  )}`;

  const triggerClass =
    variant === 'compact'
      ? 'inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-gray-200 backdrop-blur-sm transition-all hover:border-purple-400/60 hover:bg-purple-500/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400'
      : 'inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 py-2.5 text-xs font-semibold text-gray-100 backdrop-blur-sm transition-all hover:border-purple-400/60 hover:bg-purple-500/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${triggerClass} ${className}`.trim()}
        aria-haspopup="dialog"
      >
        <svg
          className={variant === 'compact' ? 'h-3.5 w-3.5' : 'h-4 w-4'}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
        </svg>
        {t.button}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={t.dialogTitle}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-white/10 bg-[#0d0a1a] text-white shadow-2xl shadow-purple-900/30 sm:rounded-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <svg
                  className="h-5 w-5 text-purple-300"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
                </svg>
                {t.dialogTitle}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t.close}
                className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-6 px-5 py-5">
              {/* Public link */}
              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {t.linkSectionTitle}
                </h3>
                <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-gray-300">
                    {publicUrl}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="flex-shrink-0 rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                  >
                    {t.copyLink}
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleShare}
                    className="inline-flex items-center gap-2 rounded-md border border-purple-500/40 bg-purple-500/15 px-3 py-1.5 text-sm font-semibold text-purple-200 transition-colors hover:border-purple-400 hover:bg-purple-500/25 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                  >
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7" />
                      <path d="M16 6l-4-4-4 4M12 2v14" />
                    </svg>
                    {t.share}
                  </button>
                  <a
                    href={xUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t.shareOnX}
                    title={t.shareOnX}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/5 text-neutral-300 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                  >
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M18.9 2H22l-7.5 8.6L23 22h-6.9l-5.4-7-6.2 7H1.4l8-9.2L1 2h7l4.9 6.5L18.9 2zm-2.4 18h1.9L7.6 3.9H5.6L16.5 20z" />
                    </svg>
                  </a>
                  <a
                    href={blueskyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t.shareOnBluesky}
                    title={t.shareOnBluesky}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/5 text-neutral-300 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                  >
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M12 10.8C10.9 8.6 7.9 4.5 5.1 3 3.6 2.1 2 2.8 2 5.1c0 1.4.8 5.9 1.3 6.6.7 1.2 2 1.6 3.4 1.4-2 .3-3.7 1-.9 4 3 3.2 4.2-.9 4.2-2.8 0 1.9 1.1 6 4.2 2.8 2.8-3 1.1-3.7-.9-4 1.4.2 2.7-.2 3.4-1.4.5-.7 1.3-5.2 1.3-6.6 0-2.3-1.6-3-3.1-2.1C16.1 4.5 13.1 8.6 12 10.8z" />
                    </svg>
                  </a>
                </div>
              </section>

              {/* Embed snippets */}
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    {t.embedTitle}
                  </h3>
                  <div className="flex items-center gap-2">
                    <div className="inline-flex rounded-lg border border-white/10 bg-black/40 p-0.5">
                      {(['dark', 'light'] as const).map((th) => (
                        <button
                          key={th}
                          type="button"
                          onClick={() => setTheme(th)}
                          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${
                            theme === th
                              ? 'bg-white/15 text-white'
                              : 'text-neutral-400 hover:text-white'
                          }`}
                        >
                          {th === 'dark' ? t.themeDark : t.themeLight}
                        </button>
                      ))}
                    </div>
                    <label
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition-colors ${
                        accentOn
                          ? 'border-purple-400/50 bg-purple-500/10 text-white'
                          : 'border-white/10 bg-black/40 text-neutral-400'
                      }`}
                      title={t.accentToggle}
                    >
                      <input
                        type="checkbox"
                        checked={accentOn}
                        onChange={(e) => setAccentOn(e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-neutral-600 bg-neutral-900 text-purple-500 focus:ring-purple-500/50"
                      />
                      {t.accentToggle}
                      <input
                        type="color"
                        value={accent}
                        disabled={!accentOn}
                        onChange={(e) => {
                          setAccent(e.target.value);
                          setAccentOn(true);
                        }}
                        aria-label={t.accentPickerLabel}
                        className="h-5 w-6 cursor-pointer rounded border-0 bg-transparent p-0 disabled:opacity-40"
                      />
                    </label>
                  </div>
                </div>
                <p className="text-xs text-gray-500">{t.embedDescription}</p>

                <div className="space-y-3">
                  {widgets.map((w) => {
                    // `#` is a URL fragment delimiter — send the bare hex; the
                    // embed parser re-adds it and sanitizes to strict hex.
                    const accentQuery = accentOn
                      ? `&accent=${accent.replace('#', '')}`
                      : '';
                    const embedPath = `/embed/tournament/${slugOrId}/${w.key}?theme=${theme}${accentQuery}`;
                    // Snippet = URL canonique (env) à intégrer sur un site tiers.
                    const snippet = `<iframe src="${base}${embedPath}" width="100%" height="${w.height}" style="border:0;border-radius:12px" loading="lazy" title="${w.name}"></iframe>`;
                    // Lien d'aperçu = origine courante (fonctionne sur n'importe quel port).
                    const url = `${openBase}${embedPath}`;
                    return (
                      <div
                        key={w.key}
                        className="rounded-xl border border-white/10 bg-black/30 p-3"
                      >
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{w.name}</span>
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex flex-shrink-0 items-center gap-1 text-xs text-purple-300 transition-colors hover:text-purple-200"
                          >
                            {t.openWidget}
                            <svg
                              className="h-3.5 w-3.5"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        </div>
                        <div className="relative">
                          <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-white/10 bg-black/50 p-3 pr-20 font-mono text-[11px] text-gray-300">
                            {snippet}
                          </pre>
                          <button
                            type="button"
                            onClick={() => handleCopySnippet(snippet, w.key)}
                            className="absolute right-2 top-2 rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                          >
                            {copiedWidget === w.key ? t.copiedBtn : t.copyBtn}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
