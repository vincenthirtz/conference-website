// utils/overlay/alertsOverlay.ts — la réponse de `GET /api/overlay/alerts`,
// telle que la source OBS « boîte d'alertes » (`/overlay/alertes`) et la Régie
// (`/overlay/regie`) la lisent. Types seuls : le calcul reste dans la route.
//
// Déclarée ici et non dans la route pour que le site (pages, composants) ne
// tire jamais `pages/api`, même pour un type (lot 4b).

import type { AlertFrameKind } from './alertMedia';
import type { AlertKind, StreamAlert } from './alertBox';
import type { OverlayBranding } from './branding';
import type { OverlayPublicMvpPoll } from './publicMvpFeed';
import type { RegieLayout } from './regieLayout';
import type { TcgOverlayPayload } from '../tcg/overlayPayload';

export type OverlayAlertSettings = {
  enabled: boolean;
  durationMs: number;
  /** Résolu côté route : fichier déposé, sinon URL externe, sinon muet. */
  soundUrl: string | null;
  soundVolume: number;
  accentColor: string | null;
  /**
   * Habillage déposé par la régie. `null` = celui du CODE (le nœud animé), pas
   * « aucun » — la source sait quoi faire de ce `null`.
   */
  frameUrl: string | null;
  frameKind: AlertFrameKind | null;
};

export type OverlayAlertRule = {
  kind: AlertKind;
  enabled: boolean;
  message: string | null;
  minAmount: number | null;
};

export type OverlayAlertsResponse = {
  alerts: StreamAlert[];
  settings: OverlayAlertSettings;
  rules: OverlayAlertRule[];
  branding: OverlayBranding | null;
  /**
   * Le scrutin public À L'ÉCRAN, servi UNIQUEMENT si la source le demande
   * (`?with=mvp`). Absent sinon — une source qui n'affiche pas le vote n'a pas
   * à en payer les requêtes.
   */
  publicMvp?: OverlayPublicMvpPoll | null;
  /**
   * Mise en page de la source Régie (utils/overlay/regieLayout.ts), servie
   * avec le scrutin (`?with=mvp`, que seule la Régie demande) : réglée depuis
   * Diffusion › Overlays, appliquée au rafraîchissement suivant.
   */
  layout?: RegieLayout;
  /**
   * Annonces TCG (drops Twitch, victoires) et leur habillage, servies
   * UNIQUEMENT sur `?with=tcg` (la Régie). Même frontière de confidentialité
   * que `/api/overlay/tcg/<jeton>` — `utils/tcg/overlayFeed.ts` ne laisse
   * sortir qu'un pseudo Twitch et une origine, déjà publics dans le chat, comme
   * les pseudos des alertes servies ici. Le jeton reste celui de la source
   * dédiée ; la Régie, publique par espace, n'en a pas besoin.
   */
  tcg?: TcgOverlayPayload;
  /** L'horloge du SERVEUR : celle du poste de régie peut être fausse. */
  serverTime: string;
};
