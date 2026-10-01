// components/admin/broadcast/TwitchDrivePanels.tsx
//
// Les deux panneaux qui ÉCRIVENT sur Twitch depuis « Twitch & interactions » :
// prédictions et commandes (chat, clip, marqueur, modération).
//
// POURQUOI UN CONTRÔLE ICI. L'écran admet le rôle caster, mais toutes les
// routes de ces panneaux exigent `manage_broadcast`. Contrairement à la santé
// du drop (masquée sur 403) ou au statut d'antenne (liste vide), ces deux-là
// ne se masquaient PAS : une casteuse voyait « Connecter la chaîne », un
// formulaire de prédiction, et une rangée de boutons — qui répondaient tous
// 403 — pendant que le panneau sondait les prédictions toutes les 10 s pour
// rien. Masqués, et donc non montés, tant que la session n'est pas lue.

import { useStaffSession } from '@/hooks/useStaffSession';
import TwitchPredictionsPanel from '@/components/admin/broadcast/TwitchPredictionsPanel';
import TwitchCommandsPanel from '@/components/admin/broadcast/TwitchCommandsPanel';

export default function TwitchDrivePanels() {
  const { staffPermissions, loading } = useStaffSession();
  if (loading || !staffPermissions.includes('manage_broadcast')) return null;
  return (
    <>
      <TwitchPredictionsPanel />
      <TwitchCommandsPanel />
    </>
  );
}
