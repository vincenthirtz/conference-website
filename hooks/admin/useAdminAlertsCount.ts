// hooks/admin/useAdminAlertsCount.ts — le compteur « où ça brûle » de la
// coquille admin. Sorti tel quel de l'ancienne barre (AdminTopBar) quand la
// coquille Le Ruban l'a remplacée : la logique n'a pas changé, seul son
// affichage a bougé.

import { useCallback, useEffect, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useRealtimeChannel } from '@/hooks/useRealtimeChannel';
import { useDocumentVisible } from '@/hooks/useDocumentVisible';

export function useAdminAlertsCount(enabled = true): {
  count: number | null;
  tournamentId: string | null;
} {
  const [count, setCount] = useState<number | null>(null);
  const [tournamentId, setTournamentId] = useState<string | null>(null);
  const { adminFetchJson } = useAdminFetch();
  const visible = useDocumentVisible();

  // Bearer automatique + silence sur erreur : un badge absent ne doit jamais
  // casser la coquille. Pas de redirection vers la connexion depuis ici : si
  // la session a expiré, on laisse le badge tel quel.
  const refresh = useCallback(async () => {
    try {
      const json = await adminFetchJson<{
        total?: unknown;
        tournamentId?: unknown;
      }>('/api/admin/alerts-summary', { skipAuthRedirect: true });
      if (typeof json?.total === 'number') setCount(json.total);
      // Le tournoi « en cours » est résolu côté serveur ; il filtre la
      // souscription temps réel ci-dessous.
      setTournamentId(
        typeof json?.tournamentId === 'string' ? json.tournamentId : null
      );
    } catch {
      // silencieux : aucune incidence sur la navigation
    }
  }, [adminFetchJson]);

  // Sondage de secours toutes les 60 s (et premier chargement). Onglet caché =
  // ni sondage ni souscription ; au retour, rafraîchissement IMMÉDIAT.
  useEffect(() => {
    if (!enabled || !visible) return undefined;
    let active = true;
    const run = () => {
      if (active) void refresh();
    };
    run();
    const interval = setInterval(run, 60_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [refresh, visible, enabled]);

  // Réactivité immédiate sur le tournoi courant. FILTRE SERVEUR sur
  // `tournament_id` et surtout pas sur `status=eq.disputed` : les signaux du
  // badge (utils/dashboard/alertsSignals.ts) dépendent aussi de l'horaire et
  // du check-in, et filtrer sur la valeur ferait rater la RÉSOLUTION d'un
  // litige — le badge ne redescendrait jamais. Tant que le premier sondage
  // n'a pas répondu, pas de canal : mieux vaut aucun canal qu'un canal non
  // filtré. `support_tickets` n'est pas publiée (aucune policy SELECT) : ce
  // volet reste porté par le sondage.
  useRealtimeChannel({
    enabled: enabled && visible && !!tournamentId,
    channel: `admin-shell-alerts-matches-${tournamentId ?? 'none'}`,
    table: 'matches',
    event: 'UPDATE',
    filter: tournamentId ? `tournament_id=eq.${tournamentId}` : undefined,
    onChange: refresh,
  });

  return { count, tournamentId };
}
