// features/player/team/service/opening.ts — l'annonce de recrutement de
// l'équipe gérée, posée depuis l'espace capitaine (lot P8).
//
// POURQUOI : jusqu'ici `team_openings` ne se remplissait que par le formulaire
// public SANS COMPTE (captcha, email, lien de retrait par email). Une capitaine
// connectée devait repasser par ce formulaire, et son annonce restait
// orpheline (`team_id` NULL) : l'annuaire refuse — à raison — de rattacher une
// annonce par son NOM (cf. utils/teams/directoryRecruitment.ts, usurpation).
// Ici la session et la permission d'équipe font foi : l'annonce naît
// rattachée à l'équipe, le badge « annonce publiée » devient possible.
//
// CHOIX DE MODÈLE (aucune migration) :
//   - `source = 'web'` : le CHECK de la table n'accepte que web|discord, et
//     `discord` est réservé au bot. Conséquence : `contact_email` est
//     obligatoire (team_openings_contact_check) — on y met l'email DU COMPTE
//     qui publie, jamais une saisie libre : une adresse arbitraire pourrait
//     entrer en collision avec l'annonce publique de quelqu'un d'autre et se
//     l'approprier. L'écran annonce ce partage avant la publication.
//   - Une annonce par équipe : la ligne existante (par `team_id`) est mise à
//     jour, son contact n'est pas réécrit (une co-gérante qui ajuste les
//     postes ne s'approprie pas l'annonce).
//   - Collision 23505 sur l'email (la même personne avait publié sans compte) :
//     on ADOPTE son annonce publique en la rattachant à l'équipe.
//
// Modération : mêmes garde-fous que la publication publique — alerte (non
// bloquante) si le nom d'équipe est sur liste noire ENTITÉS, et événement bot
// `team_opening.published` (même charge, sans contact) à la première
// publication. Le retrait n'émet rien, comme le retrait par lien email.

import type { TablesUpdate } from '@/types/database.generated';
import { emitBotEvent } from '@/utils/botEvents';
import { checkEmailQuality, normalizeEmail } from '@/utils/emailQuality';
import { alertIfEntityBlacklisted } from '@/utils/moderation/entityBlacklist';
import {
  computeTeamOpeningExpiresAt,
  isTeamOpeningActive,
  normalizeOpeningRoles,
  type TeamOpeningRow,
} from '@/utils/teamOpenings';
import { isFreePlayerLevel } from '@/utils/freePlayers';
import type {
  TeamOpeningDto,
  TeamOpeningResponse,
  TeamOpeningUpsertInput,
} from '../openingSchemas';
import {
  deleteTeamOpenings,
  insertTeamOpening,
  readTeamName,
  readTeamOpening,
  updateTeamOpeningById,
  updateWebOpeningByEmail,
} from '../repository/opening';
import { fail, type ManagedTeamContext } from './context';

/** L'appelant authentifié (jamais le sujet inspecté : écritures en `self`). */
export type OpeningActor = { email?: string | null };

export function toTeamOpeningDto(
  row: TeamOpeningRow,
  now: Date = new Date()
): TeamOpeningDto {
  return {
    id: row.id,
    roles: normalizeOpeningRoles(row.roles),
    level: isFreePlayerLevel(row.level) ? row.level : null,
    availability: row.availability?.trim() || null,
    note: row.note?.trim() || null,
    contactDiscord: row.contact_discord?.trim() || null,
    contactEmail: row.contact_email?.trim() || null,
    since: row.marked_at,
    expiresAt: row.expires_at,
    active: isTeamOpeningActive(row, now),
  };
}

/** Email du compte, s'il est utilisable comme contact ; sinon `null`. */
function usableAccountEmail(actor: OpeningActor): string | null {
  if (!actor.email) return null;
  const email = normalizeEmail(actor.email);
  return checkEmailQuality(email).ok ? email : null;
}

export async function getTeamOpening(
  ctx: ManagedTeamContext,
  actor: OpeningActor
): Promise<TeamOpeningResponse> {
  const { row, error } = await readTeamOpening(
    ctx.db,
    ctx.tenantId,
    ctx.team.teamId
  );
  if (error) {
    ctx.logger.error('[api/teams/opening] read error', error);
    throw fail(500, "Impossible de charger l'annonce.");
  }
  return {
    opening: row ? toTeamOpeningDto(row) : null,
    accountEmail: usableAccountEmail(actor),
  };
}

export async function upsertTeamOpening(
  ctx: ManagedTeamContext,
  actor: OpeningActor,
  body: TeamOpeningUpsertInput
): Promise<TeamOpeningResponse> {
  const { db, tenantId } = ctx;
  const teamId = ctx.team.teamId;

  const { name: teamName, error: teamErr } = await readTeamName(
    db,
    tenantId,
    teamId
  );
  if (teamErr) {
    ctx.logger.error('[api/teams/opening] team lookup error', teamErr);
    throw fail(500, 'Publication impossible pour le moment.');
  }
  if (!teamName) throw fail(404, 'Équipe introuvable.');

  const { row: existing, error: readErr } = await readTeamOpening(
    db,
    tenantId,
    teamId
  );
  if (readErr) {
    ctx.logger.error('[api/teams/opening] read error', readErr);
    throw fail(500, 'Publication impossible pour le moment.');
  }

  const nowIso = new Date().toISOString();
  // Champs que la capitaine pilote. Le nom suit l'équipe (renommée depuis la
  // dernière publication → l'annonce suit) ; la péremption repart à 60 jours.
  const content = {
    team_id: teamId,
    team_name: teamName,
    roles: normalizeOpeningRoles(body.roles),
    level: body.level ?? 'unknown',
    availability: body.availability || null,
    note: body.note || null,
    updated_at: nowIso,
    expires_at: computeTeamOpeningExpiresAt(),
  };

  let saved: TeamOpeningRow | null = null;
  let isNew = false;

  if (existing) {
    const patch: TablesUpdate<'team_openings'> = { ...content };
    // Le Discord est modifiable ; l'email de contact, non (cf. en-tête).
    if (body.contactDiscord !== undefined) {
      patch.contact_discord = body.contactDiscord || null;
    }
    const { row, error } = await updateTeamOpeningById(
      db,
      tenantId,
      existing.id,
      patch
    );
    if (error) {
      ctx.logger.error('[api/teams/opening] update error', error);
      throw fail(500, 'Publication impossible pour le moment.');
    }
    saved = row;
  } else {
    const email = usableAccountEmail(actor);
    if (!email) {
      throw fail(
        400,
        'Ton compte n’a pas d’adresse email utilisable comme contact : ajoute-en une à ton profil pour publier une annonce.',
        'NO_CONTACT_EMAIL'
      );
    }
    const withContact = {
      ...content,
      contact_email: email,
      contact_discord: body.contactDiscord || null,
    };
    const { row, error } = await insertTeamOpening(db, {
      ...withContact,
      tenant_id: tenantId,
      source: 'web',
      marked_at: nowIso,
    });
    if (error) {
      if ((error as { code?: string }).code !== '23505') {
        ctx.logger.error('[api/teams/opening] insert error', error);
        throw fail(500, 'Publication impossible pour le moment.');
      }
      // Même personne, annonce publique antérieure : on la rattache.
      const adopted = await updateWebOpeningByEmail(
        db,
        tenantId,
        email,
        withContact
      );
      if (adopted.error) {
        ctx.logger.error('[api/teams/opening] adopt error', adopted.error);
        throw fail(500, 'Publication impossible pour le moment.');
      }
      saved = adopted.row;
    } else {
      saved = row;
      isNew = true;
    }
  }

  void alertIfEntityBlacklisted(db as never, tenantId, 'team_create', {
    name: teamName,
  });

  if (isNew) {
    // Aucune donnée de contact dans l'événement : le bot annonce, il ne
    // distribue pas d'email (même charge que la publication publique).
    void emitBotEvent(
      'team_opening.published',
      {
        teamName,
        roles: content.roles,
        level: content.level,
        availability: content.availability,
        note: content.note,
      },
      tenantId
    ).catch(() => {
      /* déjà journalisé par emitBotEvent ; jamais bloquant */
    });
  }

  return {
    opening: saved ? toTeamOpeningDto(saved) : null,
    accountEmail: usableAccountEmail(actor),
  };
}

/** Clore l'annonce : supprimée, comme le retrait par lien email. */
export async function closeTeamOpening(
  ctx: ManagedTeamContext,
  actor: OpeningActor
): Promise<TeamOpeningResponse> {
  const { error } = await deleteTeamOpenings(
    ctx.db,
    ctx.tenantId,
    ctx.team.teamId
  );
  if (error) {
    ctx.logger.error('[api/teams/opening] delete error', error);
    throw fail(500, 'Le retrait a échoué. Réessaie dans un instant.');
  }
  return { opening: null, accountEmail: usableAccountEmail(actor) };
}
