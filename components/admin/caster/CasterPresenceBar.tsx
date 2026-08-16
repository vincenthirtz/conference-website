// components/admin/caster/CasterPresenceBar.tsx
//
// Bandeau de présence multi-caster (lot 5) — port de la presence bar du desktop
// (womenscup-caster/src/renderer/tabs/chat.js:renderPresence). Un avatar teinté
// par caster (couleur stable dérivée du nom), le rôle, et la scène qu'il édite.
//
// Les données viennent de useCasterPresence (canal Realtime Presence partagé
// avec l'app desktop) ; ce composant est purement présentationnel.

import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { presenceColor, presenceInitials } from '@/utils/caster/presence';
import type { CasterPresenceUser } from '@/types/caster';
import nsAdminCasterScenes from '@/lib/i18n/locales/admin-fr/adminCasterScenes';

type Props = {
  users: CasterPresenceUser[];
  selfStaffId: string | null;
  /** id de scène → nom lisible (les payloads ne portent que l'id). */
  sceneNameById: Record<string, string>;
  /** Canal Presence souscrit ? false = on n'affiche pas de fausse solitude. */
  connected: boolean;
};

export default function CasterPresenceBar({
  users,
  selfStaffId,
  sceneNameById,
  connected,
}: Props) {
  const t = useAdminT(nsAdminCasterScenes);

  if (!connected) {
    return (
      <span className="text-[11px] text-neutral-500" role="status">
        {t.presenceOffline}
      </span>
    );
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      aria-label={t.presenceTitle}
      data-testid="caster-presence-bar"
    >
      {users.length > 1 && (
        <span
          className="rounded-full border border-neutral-700 bg-neutral-900/70 px-2 py-0.5 text-[11px] text-neutral-300"
          title={format(t.presenceHeadcount, { count: users.length })}
        >
          {`👥 ${users.length}`}
        </span>
      )}

      {users.map((u) => {
        const sceneName = u.activeScene
          ? sceneNameById[u.activeScene] || u.activeScene
          : null;
        const isSelf = u.staffId === selfStaffId;
        return (
          <span
            key={u.staffId}
            className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-900/70 pl-0.5 pr-2 py-0.5"
            title={format(t.presenceUserTooltip, {
              name: u.displayName,
              role: u.role || '—',
              scene: sceneName || t.presenceNoScene,
            })}
          >
            <span
              aria-hidden="true"
              className="h-5 w-5 shrink-0 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
              style={{ background: presenceColor(u.displayName || u.staffId) }}
            >
              {presenceInitials(u.displayName)}
            </span>
            <span className="text-[11px] text-neutral-200 max-w-[14rem] truncate">
              {isSelf
                ? format(t.presenceSelfLabel, { name: u.displayName })
                : u.displayName}
              {sceneName && (
                <span className="text-neutral-500">{` · ${sceneName}`}</span>
              )}
            </span>
          </span>
        );
      })}
    </div>
  );
}
