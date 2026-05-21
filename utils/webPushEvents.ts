// utils/webPushEvents.ts
//
// Liste canonique des event_types supportés par le dispatcher Web Push de la
// PWA /admin. Source de vérité partagée entre :
//   - /api/admin/notifications/prefs (GET + PUT)
//   - le futur dispatcher (`utils/webPushDispatcher` ou cron route)
//   - le front /admin (UI de réglage des préférences)
//
// La table SQL `notification_prefs` n'a PAS de CHECK constraint sur event_type
// (cf. migration database/migrations/create_web_push_tables.sql) car la liste
// évolue souvent. La validation est faite ici, côté API, via zod enum.
//
// Modèle "absent row = enabled = TRUE" (opt-out) : si une row n'existe pas
// dans notification_prefs pour (user_id, event_type), le user reçoit la
// notification. Le GET /prefs fusionne la liste ci-dessous avec les rows
// présentes pour exposer un état exhaustif au front.

export const WEB_PUSH_EVENT_TYPES = [
  'match.starting',
  'match.finished',
  'match.score_reported',
  'cast.assigned',
  'cast.unassigned',
  'scrim.invitation',
  'scrim.confirmed',
  'team.forfeit',
  'news.published',
  'staff.role.changed',
  'checkin.opened',
  'registration.new',
  'helloasso.payment.received',
  'captain.support.opened',
  // Run-of-show : transition d'un segment dans le timeline d'un event.
  // Le dispatcher applique un filtre supplémentaire (cf. shouldPushForEvent)
  // pour ne notifier QUE les transitions vers 'live' d'un segment de type
  // 'match'. Les autres transitions (done, skipped, intro/break/outro...)
  // sont écrites dans l'outbox pour le bot Discord mais ne déclenchent pas
  // de push PWA — l'audience est restreinte aux casters assignés au match
  // (cf. loadCasterUserIdsForMatch dans le dispatcher).
  // Note : cast.hotkey_triggered N'EST PAS ajouté ici — par design, on ne
  // push pas les highlights en temps réel (Discord-only).
  'event_segment.transitioned',
] as const;

export type WebPushEventType = (typeof WEB_PUSH_EVENT_TYPES)[number];

export function isWebPushEventType(value: string): value is WebPushEventType {
  return (WEB_PUSH_EVENT_TYPES as readonly string[]).includes(value);
}

/* ===========================================================================
 * Notification rendering — title / body / deep-link URL
 * ===========================================================================
 *
 * Mapping event_name → (title, body, url) consommé par le dispatcher Web Push.
 * Centralisé ici (à côté de la liste canonique) plutôt qu'inline dans le cron
 * pour pouvoir partager la mise en forme avec un futur in-app feed.
 *
 * Le payload outbox est typé `Record<string, unknown>` côté DB : on extrait
 * les champs défensivement (la forme exacte dépend du producteur, ex.
 * applyMatchScoreAsync, broadcastNews, etc.). Toute valeur manquante tombe
 * en fallback "neutre" pour ne JAMAIS faire crash le dispatcher — un push
 * avec un libellé générique vaut mieux qu'une livraison qui échoue.
 *
 * Les URLs sont relatives ('/admin/...') ; le service worker côté client
 * concatène avec l'origin courante via clients.openWindow.
 */

type EventPayload = Record<string, unknown>;

function str(payload: EventPayload, key: string): string | null {
  const v = payload[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function pickTeamName(
  payload: EventPayload,
  side: 'A' | 'B' | 'home' | 'away'
): string | null {
  // Couvre les variantes utilisées par les différents emitters
  // (applyMatchScoreAsync utilise teamA / teamB, le bot envoie home/away).
  const keys =
    side === 'A' || side === 'home'
      ? ['teamA_name', 'team_a_name', 'home_name', 'home_team', 'teamA']
      : ['teamB_name', 'team_b_name', 'away_name', 'away_team', 'teamB'];
  for (const k of keys) {
    const v = str(payload, k);
    if (v) return v;
  }
  return null;
}

function matchLabel(payload: EventPayload): string {
  const a = pickTeamName(payload, 'A');
  const b = pickTeamName(payload, 'B');
  if (a && b) return `${a} vs ${b}`;
  return str(payload, 'match_label') || 'Match';
}

function matchUrl(payload: EventPayload): string {
  const matchId = str(payload, 'match_id') || str(payload, 'matchId');
  if (matchId) return `/admin/matches/${matchId}`;
  return '/admin/matches';
}

export type WebPushRendered = {
  title: string;
  body: string;
  url: string;
};

/**
 * Extrait `payload.data` si présent (forme envelope { id, event, tenantId,
 * timestamp, data }), sinon retourne le payload tel quel (forme flat des
 * anciens tests / events sans wrapper). Permet aux mappings ci-dessous
 * d'accepter les deux formes sans avoir à connaître l'emitter.
 */
function unwrap(payload: EventPayload): EventPayload {
  const data = (payload as { data?: unknown }).data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as EventPayload;
  }
  return payload;
}

/**
 * Filtre amont appliqué par le dispatcher AVANT de calculer recipients/render.
 * Renvoie `true` si l'event doit déclencher un push, `false` sinon.
 *
 * Pour la plupart des events de WEB_PUSH_EVENT_TYPES, on retourne `true`
 * inconditionnellement — le filtrage opt-out/audience est fait ailleurs.
 *
 * Cas spéciaux :
 *   - `event_segment.transitioned` : push uniquement si on bascule UN segment
 *     de type 'match' vers 'live'. Les transitions intermédiaires (done,
 *     skipped) et les segments non-match (intro, break, outro, custom) sont
 *     ignorés côté PWA (le bot Discord, lui, traite toutes les transitions).
 */
export function shouldPushForEvent(
  eventName: string,
  payload: EventPayload
): boolean {
  if (eventName === 'event_segment.transitioned') {
    const data = unwrap(payload);
    const toStatus = str(data, 'toStatus');
    if (toStatus !== 'live') return false;
    const segment = (data as { segment?: unknown }).segment;
    if (!segment || typeof segment !== 'object') return false;
    const seg = segment as Record<string, unknown>;
    if (seg.type !== 'match') return false;
    if (typeof seg.matchId !== 'string' || seg.matchId.length === 0) {
      return false;
    }
    return true;
  }
  return true;
}

/**
 * Construit (title, body, url) pour un event de l'outbox.
 * Garanti non-throw : tout payload malformé tombe sur des défauts neutres.
 */
export function renderWebPushPayload(
  eventName: string,
  payload: EventPayload
): WebPushRendered {
  switch (eventName) {
    case 'match.starting':
      return {
        title: 'Match imminent',
        body: `${matchLabel(payload)} commence bientôt.`,
        url: matchUrl(payload),
      };
    case 'match.finished':
      return {
        title: 'Match terminé',
        body: `${matchLabel(payload)} est terminé.`,
        url: matchUrl(payload),
      };
    case 'match.score_reported':
      return {
        title: 'Score reporté',
        body: `${matchLabel(payload)} : un score a été reporté.`,
        url: matchUrl(payload),
      };
    case 'cast.assigned':
      return {
        title: 'Cast assigné',
        body:
          str(payload, 'caster_name') || str(payload, 'display_name')
            ? `${str(payload, 'caster_name') || str(payload, 'display_name')} a été assigné·e au cast.`
            : 'Un caster a été assigné.',
        url: matchUrl(payload),
      };
    case 'cast.unassigned':
      return {
        title: 'Cast retiré',
        body:
          str(payload, 'caster_name') || str(payload, 'display_name')
            ? `${str(payload, 'caster_name') || str(payload, 'display_name')} a été retiré·e du cast.`
            : 'Un caster a été retiré.',
        url: matchUrl(payload),
      };
    case 'scrim.invitation':
      return {
        title: 'Invitation scrim',
        body: str(payload, 'team_name')
          ? `Nouvelle invitation scrim pour ${str(payload, 'team_name')}.`
          : 'Nouvelle invitation scrim.',
        url: str(payload, 'scrim_id')
          ? `/admin/scrims/${str(payload, 'scrim_id')}`
          : '/admin/scrims',
      };
    case 'scrim.confirmed':
      return {
        title: 'Scrim confirmé',
        body: str(payload, 'team_name')
          ? `Scrim confirmé avec ${str(payload, 'team_name')}.`
          : 'Un scrim a été confirmé.',
        url: str(payload, 'scrim_id')
          ? `/admin/scrims/${str(payload, 'scrim_id')}`
          : '/admin/scrims',
      };
    case 'team.forfeit':
      return {
        title: 'Forfait équipe',
        body: str(payload, 'team_name')
          ? `${str(payload, 'team_name')} a déclaré forfait.`
          : 'Une équipe a déclaré forfait.',
        url: str(payload, 'team_id')
          ? `/admin/teams/${str(payload, 'team_id')}`
          : '/admin/teams',
      };
    case 'news.published': {
      const title = str(payload, 'title');
      return {
        title: 'Actualité publiée',
        body: title
          ? `« ${title} » est en ligne.`
          : 'Une actualité est en ligne.',
        url: str(payload, 'slug')
          ? `/news/${str(payload, 'slug')}`
          : '/admin/news',
      };
    }
    case 'staff.role.changed':
      return {
        title: 'Rôle staff modifié',
        body:
          str(payload, 'staff_name') && str(payload, 'new_role')
            ? `${str(payload, 'staff_name')} → ${str(payload, 'new_role')}.`
            : 'Un rôle staff a été modifié.',
        url: '/admin/staff',
      };
    case 'checkin.opened':
      return {
        title: 'Check-in ouvert',
        body: `${matchLabel(payload)} : check-in ouvert.`,
        url: matchUrl(payload),
      };
    case 'registration.new':
      return {
        title: 'Nouvelle inscription',
        body: str(payload, 'team_name')
          ? `${str(payload, 'team_name')} vient de s'inscrire.`
          : 'Nouvelle équipe inscrite.',
        url: '/admin/teams',
      };
    case 'helloasso.payment.received': {
      const amount = payload.amount;
      const amountStr =
        typeof amount === 'number' && Number.isFinite(amount)
          ? `${(amount / 100).toFixed(2)} €`
          : null;
      const team = str(payload, 'team_name') || str(payload, 'payer_name');
      const parts: string[] = [];
      if (amountStr) parts.push(amountStr);
      if (team) parts.push(`de ${team}`);
      return {
        title: 'Paiement reçu',
        body:
          parts.length > 0 ? `Paiement ${parts.join(' ')}.` : 'Paiement reçu.',
        url: '/admin/payments',
      };
    }
    case 'captain.support.opened':
      return {
        title: 'Ticket support',
        body: str(payload, 'team_name')
          ? `Nouveau ticket de ${str(payload, 'team_name')}.`
          : 'Nouveau ticket support.',
        url: str(payload, 'ticket_id')
          ? `/admin/support/${str(payload, 'ticket_id')}`
          : '/admin/support',
      };
    case 'event_segment.transitioned': {
      // Le dispatcher a déjà filtré via shouldPushForEvent : on sait que
      // toStatus === 'live' et segment.type === 'match' (sinon on ne serait
      // pas là). On rend défensivement quand même au cas où la fonction
      // serait appelée hors flux.
      const data = unwrap(payload);
      const segment =
        (data as { segment?: Record<string, unknown> }).segment ?? {};
      const segTitle =
        typeof segment.title === 'string' && segment.title.length > 0
          ? segment.title
          : 'Match';
      const broadcast = (data as { broadcastMessage?: unknown })
        .broadcastMessage;
      const pushTitle =
        broadcast && typeof broadcast === 'object'
          ? (broadcast as Record<string, unknown>).push_title
          : null;
      const pushBody =
        broadcast && typeof broadcast === 'object'
          ? (broadcast as Record<string, unknown>).push_body
          : null;
      return {
        title:
          typeof pushTitle === 'string' && pushTitle.length > 0
            ? pushTitle
            : 'Match en direct',
        body:
          typeof pushBody === 'string' && pushBody.length > 0
            ? pushBody
            : `${segTitle} commence maintenant`,
        // Audience = casters assignés au match. Le cockpit liste leurs
        // segments du jour ; on évite /admin/events/<runId> qui suppose un
        // accès staff.
        url: '/caster/cockpit',
      };
    }
    default:
      // Fallback safe : un event_name inconnu n'arrivera pas (filtré par
      // WEB_PUSH_EVENT_TYPES côté query), mais on protège tout de même.
      return {
        title: 'Nouvelle notification',
        body: eventName,
        url: '/admin',
      };
  }
}
