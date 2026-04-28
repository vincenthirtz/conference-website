// components/admin/MatchHistoryDrawer.tsx
// Drawer reutilisable affichant l'historique staff d'un match.
// S'appuie sur GET /api/admin/matches/[matchId]/history.

import { useEffect, useState } from 'react';

type FormattedLog = {
  id: string;
  created_at: string;
  staff_id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  payload: Record<string, any> | null;
  staff: {
    display_name: string | null;
    role: string;
  } | null;
  readableAction: string;
  readableEntity: string | null;
  date: string;
};

type Props = {
  matchId: string;
  open: boolean;
  onClose: () => void;
};

export default function MatchHistoryDrawer({ matchId, open, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [logs, setLogs] = useState<FormattedLog[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !matchId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetch(`/api/admin/matches/${matchId}/history`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erreur historique');
        if (!cancelled) setLogs(json.logs || []);
      } catch (e: unknown) {
        if (!cancelled)
          setErrorMsg((e as Error).message || 'Erreur historique');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, matchId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        className="flex-1 bg-black/60 backdrop-blur-sm"
      />
      {/* Drawer */}
      <aside className="w-full max-w-md bg-neutral-900 border-l border-neutral-700 flex flex-col">
        <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-700">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-purple-200/80">
              Admin · Historique
            </p>
            <h3 className="text-base font-semibold">Historique du match</h3>
          </div>
          <button
            onClick={onClose}
            className="px-2 py-1 rounded bg-white/10 border border-white/15 text-sm hover:bg-white/15"
          >
            Fermer
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading && (
            <p className="text-sm text-neutral-400">Chargement…</p>
          )}
          {errorMsg && (
            <p className="text-sm text-red-300">{errorMsg}</p>
          )}
          {!loading && !errorMsg && logs.length === 0 && (
            <p className="text-sm text-neutral-500 italic">
              Aucune action staff enregistrée sur ce match.
            </p>
          )}
          {!loading && logs.length > 0 && (
            <ol className="space-y-3">
              {logs.map((log) => {
                const isExpanded = expandedId === log.id;
                const change = describeChange(log);
                return (
                  <li
                    key={log.id}
                    className="rounded-lg border border-white/10 bg-white/5 overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                      className="w-full text-left px-3 py-2 hover:bg-white/5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-purple-200">
                          {log.readableAction}
                        </span>
                        <span className="text-xs text-neutral-500 font-mono">
                          {log.date}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span className="text-xs text-neutral-300 truncate">
                          {log.staff?.display_name || 'Staff inconnu'}
                          {log.staff?.role ? ` · ${log.staff.role}` : ''}
                        </span>
                        {change && (
                          <span className="text-xs text-emerald-200 truncate max-w-[60%] text-right">
                            {change}
                          </span>
                        )}
                      </div>
                    </button>
                    {isExpanded && log.payload && (
                      <pre className="text-[10px] bg-neutral-950 text-neutral-300 p-3 overflow-x-auto whitespace-pre-wrap break-all border-t border-neutral-800">
                        {JSON.stringify(log.payload, null, 2)}
                      </pre>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </aside>
    </div>
  );
}

/**
 * Construit une description courte du changement le plus interessant
 * a partir du payload (score before/after, status before/after, etc.).
 */
function describeChange(log: FormattedLog): string | null {
  const p = log.payload;
  if (!p) return null;

  // update_match (score)
  if (
    typeof p.prev_team1_score === 'number' &&
    typeof p.new_team1_score === 'number'
  ) {
    return `${p.prev_team1_score}-${p.prev_team2_score} → ${p.new_team1_score}-${p.new_team2_score}`;
  }

  if (p.prev_status && p.new_status && p.prev_status !== p.new_status) {
    return `${p.prev_status} → ${p.new_status}`;
  }

  if (p.mode === 'meta' && p.before && p.after) {
    const fields: string[] = [];
    if (p.before.scheduled_at !== p.after.scheduled_at)
      fields.push('horaire');
    if (p.before.status !== p.after.status) fields.push('statut');
    if (p.before.notes !== p.after.notes) fields.push('notes');
    if (p.before.lobby_code !== p.after.lobby_code) fields.push('lobby');
    if (p.before.replay_url !== p.after.replay_url) fields.push('replay');
    if (fields.length > 0) return fields.join(', ');
  }

  if (log.action === 'open_match_dispute' && typeof p.reason === 'string') {
    return `Motif: ${p.reason.slice(0, 40)}${p.reason.length > 40 ? '…' : ''}`;
  }
  if (log.action === 'resolve_match_dispute' && typeof p.resolution === 'string') {
    return `Décision: ${p.resolution.slice(0, 40)}${p.resolution.length > 40 ? '…' : ''}`;
  }
  if (p.cancelled === true) return 'Annulé';
  if (p.hard_delete === true) return 'Suppression DB';

  return null;
}
