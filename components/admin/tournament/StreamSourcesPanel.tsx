// components/admin/tournament/StreamSourcesPanel.tsx
//
// « Sources de stream (OBS) » — le panneau d'où une régie copie les URLs à
// coller dans OBS, sur Diffusion › Overlays (il vivait dans l'onglet Outils
// de chaque tournoi jusqu'au 2026-09-28).
//
// Sans cet écran, la fonctionnalité n'existe pas : personne ne devine une URL
// d'overlay. C'est ici que la capacité de plan `matchOverlays` devient quelque
// chose qu'on utilise — et, pour un espace qui ne l'a pas, quelque chose qu'on
// comprend (l'encart nomme l'offre au lieu de cacher le panneau).
//
// TOUTES LES URLS PROPOSÉES VISENT `next` : elles suivent le match du moment,
// donc on les colle une fois pour la journée. C'est le vrai usage d'une régie
// amateur, où personne n'a le temps d'aller rechercher un identifiant entre
// deux rencontres. Figer une source sur un match précis reste possible (la
// note le dit), mais ce n'est pas le défaut.

import { useCallback, useEffect, useRef, useState } from 'react';
import { copyText } from '@/utils/clipboard';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import nsAdminTournamentEmbed from '@/lib/i18n/locales/admin-fr/adminTournamentEmbed';
import type { OverlayPresence } from '@/hooks/useOverlayPresence';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import {
  FAINT,
  MUTED,
  WARN_BOX,
} from '@/features/admin/stages/ui/rubanClasses';

/** Lien d'action à l'allure d'un bouton `ghost` (AdminButton, taille xs). */
const LINK_BTN =
  'inline-flex h-[30px] shrink-0 items-center justify-center rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] px-3 font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.02em] text-[var(--t2,#c7bfca)] transition-colors hover:border-[var(--t4,#807984)] hover:text-[var(--t1,#f4edf7)]';

type Props = {
  /** Slug (ou id) du tournoi, tel qu'il ira dans l'URL. */
  tournamentRef: string;
  /**
   * Id du tournoi : pour ENVOYER un jour à la source « Matchs du jour » déjà
   * collée dans OBS (route admin overlay-day). Absent : aperçu seul.
   */
  tournamentId?: string;
  /** Base absolue du site, déjà résolue par la page. */
  baseUrl: string;
  /** Le palier de l'espace ouvre-t-il les sources par match ? */
  enabled: boolean;
  /** Palier en cours, nommé dans l'encart quand la capacité manque. */
  planLabel: string;
  /** Espace de la Women's Cup : seul à qui le QR de don appartient. */
  showDonation?: boolean;
  /**
   * Signal de présence des overlays (`useOverlayPresence`). Absent ou `null` :
   * aucun badge, plutôt qu'un faux « éteint ».
   */
  presence?: OverlayPresence | null;
};

/** « 12 s », « 3 min », « 2 h » — depuis le dernier signal. */
function agoLabel(
  sec: number,
  t: { agoSeconds: string; agoMinutes: string; agoHours: string }
) {
  if (sec < 60) return t.agoSeconds.replace('{n}', String(sec));
  if (sec < 3600)
    return t.agoMinutes.replace('{n}', String(Math.floor(sec / 60)));
  return t.agoHours.replace('{n}', String(Math.floor(sec / 3600)));
}

/** Les sources, dans l'ordre où une régie les ajoute à sa scène. */
const SOURCES = [
  // LA SOURCE FUSIONNÉE EN PREMIER : c'est celle qu'une régie devrait coller,
  // et les quatre qu'elle remplace deviennent des cas particuliers. Quatre
  // sources navigateur, c'est quatre fois le tour du réseau en boucle pendant
  // six heures — 8 000 requêtes Supabase en une heure le 2026-09-23.
  { key: 'regie', size: '1920×1080' },
  { key: 'scoreboard', size: '1920×250' },
  { key: 'teams', size: '1920×1080' },
  { key: 'maps', size: '600×600' },
  { key: 'countdown', size: '1920×1080' },
  { key: 'waiting', size: '1920×1080' },
  // Pas une source « par match » : elle montre toute la journée, d'où son URL
  // à part (cf. sourceUrl).
  { key: 'day', size: '1920×1080' },
  // Pas liée au tournoi : les scrims publics de tout l'espace.
  { key: 'scrims', size: '1920×1080' },
  { key: 'scrimResult', size: '1920×1080' },
  // Le scrutin MVP du public : pas une source « par match » non plus. Elle
  // suit le vote OUVERT du moment, quel que soit le match — c'est la régie qui
  // l'ouvre depuis le cockpit, et on ne recolle pas une URL entre deux
  // rencontres.
  { key: 'mvpPublic', size: '1920×1080' },
  // Les alertes de LA CHAÎNE (Twitch + dons de l'association) : même règle que
  // le QR de don. Elles se règlent dans le panneau juste en dessous.
  { key: 'alerts', size: '1920×1080' },
  // Les partenaires de l'ASSOCIATION, pas ceux d'un tournoi : même règle que
  // le QR de don, l'espace de l'association est seul à qui ils appartiennent.
  { key: 'partners', size: '1920×160' },
  // Le QR HelloAsso de la Women's Cup : proposé à son seul espace.
  { key: 'don', size: '1920×1080' },
  // Alertes des dons HelloAsso de l'association : même règle que le QR.
  { key: 'donAlert', size: '1920×1080' },
] as const;

/** Sources propres à l'association (ses partenaires, son QR, ses dons). */
const DONATION_KEYS: ReadonlySet<string> = new Set([
  // La source fusionnée embarque le QR et les partenaires de l'ASSOCIATION :
  // même règle d'appartenance qu'eux.
  'regie',
  'alerts',
  'partners',
  'don',
  'donAlert',
]);

/** `AAAA-MM-JJ` → `JJ/MM`. */
function shortDay(day: string): string {
  const [, m, d] = day.split('-');
  return `${d}/${m}`;
}

/** Heure de Paris d'un instant ISO, `HH:MM`. */
function shortTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  });
}

/** `AAAA-MM-JJ` du jour, heure de Paris — le jour que la source affiche. */
function parisToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function sourceUrl(baseUrl: string, tournamentRef: string, key: string) {
  const tournament = encodeURIComponent(tournamentRef);
  if (key === 'day') return `${baseUrl}/overlay/day?tournament=${tournament}`;
  if (key === 'scrims') return `${baseUrl}/overlay/scrims`;
  if (key === 'regie') return `${baseUrl}/overlay/regie`;
  if (key === 'scrimResult') return `${baseUrl}/overlay/scrim-result`;
  if (key === 'mvpPublic') return `${baseUrl}/overlay/mvp-public`;
  if (key === 'partners') return `${baseUrl}/overlay/partenaires`;
  if (key === 'alerts') return `${baseUrl}/overlay/alertes`;
  if (key === 'don') return `${baseUrl}/overlay/don`;
  if (key === 'donAlert') return `${baseUrl}/overlay/don-alert`;
  return `${baseUrl}/overlay/match/next?tournament=${tournament}&source=${key}`;
}

export default function StreamSourcesPanel({
  tournamentRef,
  tournamentId,
  baseUrl,
  enabled,
  planLabel,
  showDonation = false,
  presence = null,
}: Props) {
  const t = useAdminT(nsAdminTournamentEmbed);
  const [copied, setCopied] = useState<string | null>(null);
  // Jour testé pour « Matchs du jour » : la source montre AUJOURD'HUI, donc
  // rien un jour sans match — impossible de la régler avant la soirée.
  const [testDay, setTestDay] = useState<string>(() => parisToday());
  // Jour FORCÉ côté serveur : la source déjà collée dans OBS le suit.
  const { adminFetchJson } = useAdminFetch();
  const [forced, setForced] = useState<{
    date: string | null;
    expiresAt: string | null;
    active: boolean;
  } | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const overlayDayUrl = tournamentId
    ? `/api/admin/tournament/${tournamentId}/overlay-day`
    : null;

  useEffect(() => {
    if (!overlayDayUrl || !enabled) return;
    adminFetchJson<typeof forced>(overlayDayUrl)
      .then(setForced)
      .catch(() => setForced(null));
  }, [overlayDayUrl, enabled, adminFetchJson]);

  const sendDay = useCallback(
    async (date: string | null) => {
      if (!overlayDayUrl) return;
      setSending(true);
      setSendError(null);
      try {
        setForced(
          await adminFetchJson<typeof forced>(overlayDayUrl, {
            method: 'PUT',
            body: JSON.stringify({ date }),
          })
        );
      } catch (err) {
        setSendError((err as Error)?.message || t.daySendError);
      } finally {
        setSending(false);
      }
    },
    [overlayDayUrl, adminFetchJson, t]
  );
  // Le QR de don et les alertes de don sont ceux de l'association.
  const sources = SOURCES.filter(
    (s) => showDonation || !DONATION_KEYS.has(s.key)
  );

  // Un seul minuteur, annulé au démontage : changer de tournoi démonte le
  // panneau (clé), et un `setCopied` tardif visait un composant disparu.
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    []
  );
  const copy = async (value: string, key: string) => {
    // Repli hors contexte sécurisé compris. Un échec est DIT : en silence, on
    // croyait avoir copié et on collait l'ancienne URL dans OBS.
    const ok = await copyText(value);
    setCopied(ok ? key : `${key}:failed`);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(null), ok ? 1500 : 4000);
  };

  if (!enabled) {
    return (
      <div className={WARN_BOX}>
        <h3 className="text-sm font-semibold">{t.sourcesTitle}</h3>
        <p className="mt-1 text-xs">
          {t.sourcesLockedBody.replace('{plan}', planLabel)}
        </p>
        <a
          href="/organisateurs#offres"
          target="_blank"
          rel="noopener noreferrer"
          className={`mt-3 ${LINK_BTN}`}
        >
          {t.sourcesLockedCta}
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className={`text-xs ${MUTED}`}>{t.sourcesDescription}</p>

      <div className="space-y-2">
        {sources.map((s) => {
          const url = sourceUrl(baseUrl, tournamentRef, s.key);
          const label = t[`source_${s.key}_name` as keyof typeof t] as string;
          const desc = t[`source_${s.key}_desc` as keyof typeof t] as string;
          return (
            <div
              key={s.key}
              className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4"
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[var(--t1,#f4edf7)]">
                    {label}
                  </div>
                  <div className={`mt-0.5 text-xs ${FAINT}`}>{desc}</div>
                </div>
                <span className="flex shrink-0 items-center gap-1.5">
                  {presence && (
                    // AFFICHÉE OU PAS : l'URL collée dans OBS ne le disait
                    // jamais (source masquée, OBS fermé, URL de travers).
                    <Chip tone={presence.isLive(s.key) ? 'live' : 'neutral'}>
                      {presence.isLive(s.key)
                        ? t.presenceLive
                        : presence.secondsAgo(s.key) === null
                          ? t.presenceNever
                          : t.presenceStale.replace(
                              '{ago}',
                              agoLabel(presence.secondsAgo(s.key) ?? 0, t)
                            )}
                    </Chip>
                  )}
                  <span className="rounded-[3px] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] px-2 py-0.5 font-mono text-[10px] text-[var(--t3,#a39ba6)]">
                    {s.size}
                  </span>
                </span>
              </div>
              <div className="relative">
                <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] p-3 pr-40 font-mono text-[11px] text-[var(--t2,#c7bfca)]">
                  {url}
                </pre>
                <div className="absolute right-2 top-2 flex gap-1.5">
                  {/* VÉRIFIER AVANT DE COLLER : seule « Matchs du jour » avait
                      un aperçu ; les autres ne se voyaient qu'une fois dans
                      OBS, en direct. */}
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${t.openBtn} — ${label}`}
                    className={LINK_BTN}
                  >
                    {t.openBtn}
                  </a>
                  <AdminButton
                    variant="secondary"
                    size="xs"
                    className="bg-[var(--s1,#100812)]"
                    onClick={() => copy(url, s.key)}
                  >
                    <span aria-live="polite">
                      {copied === s.key ? t.copiedBtn : t.copyBtn}
                    </span>
                  </AdminButton>
                </div>
              </div>
              {copied === `${s.key}:failed` && (
                <p role="alert" className="mt-1.5 text-xs text-[#ffd9a3]">
                  {t.copyFailed}
                </p>
              )}
              {s.key === 'day' && (
                // TEST SUR UN AUTRE JOUR. L'URL à coller reste celle du jour
                // (ci-dessus) ; ce bouton n'ouvre qu'un aperçu daté, sur fond
                // sombre (`preview=1`).
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label
                    htmlFor="day-overlay-test-date"
                    className={`text-xs ${MUTED}`}
                  >
                    {t.dayTestLabel}
                  </label>
                  <input
                    id="day-overlay-test-date"
                    type="date"
                    value={testDay}
                    onChange={(e) => setTestDay(e.target.value)}
                    className="h-[30px] rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-2 text-xs text-[var(--t1,#f4edf7)] [color-scheme:dark]"
                  />
                  <a
                    href={`${url}&date=${encodeURIComponent(testDay)}&preview=1`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-disabled={!testDay}
                    className={`${LINK_BTN} ${
                      testDay ? '' : 'pointer-events-none opacity-40'
                    }`}
                  >
                    {t.dayTestBtn}
                  </a>
                  {overlayDayUrl && (
                    <AdminButton
                      variant="primary"
                      size="xs"
                      onClick={() => void sendDay(testDay)}
                      disabled={!testDay || sending}
                    >
                      {t.daySendBtn}
                    </AdminButton>
                  )}
                  <span className={`text-[11px] ${FAINT}`}>
                    {t.dayTestHint}
                  </span>
                  {overlayDayUrl && (
                    <div className="flex w-full flex-wrap items-center gap-2 text-[11px]">
                      {forced?.active && forced.date ? (
                        <>
                          <Chip tone="live">
                            {format(t.dayForcedStatus, {
                              day: shortDay(forced.date),
                              until: forced.expiresAt
                                ? shortTime(forced.expiresAt)
                                : '—',
                            })}
                          </Chip>
                          <AdminButton
                            size="xs"
                            onClick={() => void sendDay(null)}
                            disabled={sending}
                          >
                            {t.dayResetBtn}
                          </AdminButton>
                        </>
                      ) : (
                        <span className={FAINT}>{t.dayLiveStatus}</span>
                      )}
                      {sendError && (
                        <span className="text-[var(--err,#ff6b6b)]">
                          {sendError}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className={`text-[11px] leading-relaxed ${FAINT}`}>{t.sourcesHint}</p>
    </div>
  );
}
