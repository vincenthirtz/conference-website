// utils/teams/demandeBattleTag.ts
//
// Le BattleTag que l'approbation d'une demande d'adhesion doit poser sur la
// ligne de roster.
//
// Pourquoi ce helper : la RPC transactionnelle `approve_join_request` remplit
// `team_members.battle_tag` avec `demandes.payload.user_battle_tag` et RIEN
// d'autre. Un payload sans tag — le cas de toute demande deposee avant que
// /api/demandes/join ne l'exige, et de tout compte cree via Discord, ou
// personne n'a jamais demande de BattleTag — produit donc une ligne de roster
// vide, que la joueuse decouvre ensuite sous la forme d'un « BattleTag
// manquant » qu'elle croyait avoir renseigne.
//
// Le TRANSFERT n'en a pas besoin et ne doit pas l'utiliser :
// `approve_transfer_request` fait deja
// `coalesce(payload->>'user_battle_tag', <tag de la fiche actuelle>)` — la
// personne est deja sur un roster, son tag existe. Y ajouter cette garde
// bloquerait des transferts parfaitement valides.
//
// L'approbation est le DERNIER moment ou l'information existe encore : le
// profil a peut-etre ete complete depuis le depot, et la capitaine a le tag
// sous les yeux (le GET des demandes l'expose deja via `user.battle_tag`).
// Trois sources, par confiance decroissante :
//
//   1. la correction saisie par la capitaine au moment d'approuver ;
//   2. le payload de la demande ;
//   3. les metadonnees ACTUELLES du compte.
//
// Quand la valeur retenue differe du payload, on REECRIT le payload avant
// d'appeler la RPC : c'est le seul canal qu'elle sait lire.

import { supabaseAdmin } from '../supabase';
import { fetchAdminUserProfiles } from '../adminUserProfiles';
import { BATTLE_TAG_REGEX, roleRequiresBattleTag } from './roleKind';
import { logger } from '../logger';

export const DEMANDE_BATTLE_TAG_INVALID =
  'Format BattleTag invalide (attendu : Pseudo#1234).';

export const DEMANDE_BATTLE_TAG_REQUIRED =
  "Cette personne n'a pas de BattleTag : demande-lui de le renseigner dans son profil, ou saisis-le toi-meme avant d'accepter.";

export type DemandeBattleTagResolution =
  | { ok: true; battleTag: string | null }
  | { ok: false; status: number; error: string; code: string };

function normalize(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() || null : null;
}

/**
 * Resout le BattleTag d'une demande et, si besoin, met le payload a jour.
 *
 * @param role Role vise. Un coach ou une manager n'a rien a fournir
 *             (`roleRequiresBattleTag`) : la resolution reussit avec `null`.
 * @param override Tag saisi par la personne qui approuve (corps de requete).
 */
export async function resolveDemandeBattleTag(params: {
  demandeId: string;
  tenantId: string;
  userId: string | null;
  role: string | null | undefined;
  payload: Record<string, unknown> | null;
  override?: unknown;
}): Promise<DemandeBattleTagResolution> {
  const { demandeId, tenantId, userId, role, payload } = params;

  const override = normalize(params.override);
  if (override && !BATTLE_TAG_REGEX.test(override)) {
    return {
      ok: false,
      status: 400,
      error: DEMANDE_BATTLE_TAG_INVALID,
      code: 'BATTLE_TAG_INVALID',
    };
  }

  const stored = normalize(payload?.user_battle_tag);
  let resolved = override || stored;

  // Le profil a pu etre complete entre le depot et l'approbation.
  if (!resolved && userId) {
    const profiles = await fetchAdminUserProfiles([userId]);
    resolved = normalize(profiles.get(userId)?.battle_tag);
  }

  if (resolved && !BATTLE_TAG_REGEX.test(resolved)) {
    // Un tag mal forme stocke de longue date : la contrainte SQL
    // `team_members_battletag_format` le refuserait au fond de la RPC, avec un
    // message que personne ne peut interpreter. On le dit ici.
    return {
      ok: false,
      status: 400,
      error: DEMANDE_BATTLE_TAG_INVALID,
      code: 'BATTLE_TAG_INVALID',
    };
  }

  if (!resolved && roleRequiresBattleTag(role)) {
    return {
      ok: false,
      status: 400,
      error: DEMANDE_BATTLE_TAG_REQUIRED,
      code: 'BATTLE_TAG_REQUIRED',
    };
  }

  if (resolved !== stored) {
    const { error } = await supabaseAdmin!
      .from('demandes')
      .update({ payload: { ...(payload || {}), user_battle_tag: resolved } })
      .eq('id', demandeId)
      .eq('tenant_id', tenantId);

    if (error) {
      // Sans cette ecriture la RPC reposerait le payload d'origine : mieux vaut
      // refuser que de recreer silencieusement une fiche sans tag.
      logger.error('[demandeBattleTag] payload update error:', error);
      return {
        ok: false,
        status: 500,
        error: "Impossible d'enregistrer le BattleTag de la demande.",
        code: 'BATTLE_TAG_PERSIST_FAILED',
      };
    }
  }

  return { ok: true, battleTag: resolved };
}
