// tests/unit/tcgTradesMigration.test.ts
//
// Ce que le mock Supabase ne peut PAS voir : la migration des échanges.
//
// Le mock n'exécute aucune fonction SQL ni aucun CHECK. Les garanties qui
// comptent le plus — atomicité, verrous, possession REVÉRIFIÉE au moment de
// l'acceptation, aucune pièce déplacée, droits d'exécution — vivent dans
// `database/migrations/tcg_card_trades.sql`. Ce fichier les LIT, comme
// `tcgBattlenetVerifiedReward.test.ts` le fait pour sa migration. Il ne prouve
// pas que le SQL s'exécute (aucun Postgres en test unitaire) : il empêche qu'une
// retouche retire en silence un verrou ou une condition.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { TRADEABLE_PACK_SOURCES } from '../../utils/tcg/tradeRules';

const raw = readFileSync(
  path.resolve(__dirname, '../../database/migrations/tcg_card_trades.sql'),
  'utf8'
);
// Les commentaires citent volontiers ce qu'on cherche : on les retire.
const sql = raw.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const flat = sql.replace(/\s+/g, ' ');

/** Le corps d'une fonction, entre `CREATE OR REPLACE FUNCTION public.<nom>(` et son `$$;`. */
function functionBody(name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start, `fonction ${name} absente`).toBeGreaterThanOrEqual(0);
  const open = sql.indexOf('$$', start);
  const close = sql.indexOf('$$', open + 2);
  return sql.slice(start, close + 2);
}

describe('tcg_accept_trade — atomicité et revérification', () => {
  const body = functionBody('tcg_accept_trade');
  const flatBody = body.replace(/\s+/g, ' ');

  it('est SECURITY DEFINER avec un search_path épinglé', () => {
    expect(flatBody).toMatch(
      /SECURITY DEFINER SET search_path = public, pg_temp/
    );
  });

  it('prend les verrous consultatifs des DEUX joueuses AVANT de verrouiller la proposition', () => {
    const firstAdvisory = body.indexOf('pg_advisory_xact_lock');
    const tradeLock = body.search(
      /FROM public\.tcg_trades\s+WHERE id = p_trade_id AND tenant_id = p_tenant_id\s+FOR UPDATE/
    );
    expect(firstAdvisory).toBeGreaterThan(0);
    expect(tradeLock).toBeGreaterThan(firstAdvisory);
    // Deux branches ordonnées × deux verrous.
    expect(body.match(/pg_advisory_xact_lock/g)).toHaveLength(4);
    expect(flatBody).toContain('IF v_proposer::text < v_recipient::text THEN');
  });

  it('rend `already_accepted` AVANT toute écriture (idempotence)', () => {
    const replay = body.indexOf("'already_accepted'");
    const firstWrite = body.search(/\b(INSERT INTO|UPDATE public\.)/);
    expect(replay).toBeGreaterThan(0);
    expect(firstWrite).toBeGreaterThan(replay);
  });

  it('revérifie les cartes OFFERTES sous verrou de ligne : paquet ouvert à la proposante, non recyclée, échangeable, même sujet', () => {
    const block = flatBody.slice(
      flatBody.indexOf("i.side = 'offered' AND p.tenant_id = p_tenant_id"),
      flatBody.indexOf(
        'FOR UPDATE OF pc',
        flatBody.indexOf("i.side = 'offered' AND p.tenant_id = p_tenant_id")
      ) + 16
    );
    expect(block).toContain('p.user_id = v_trade.proposer_id');
    expect(block).toContain('p.opened_at IS NOT NULL');
    expect(block).toContain('public.tcg_pack_source_tradeable(p.source_kind)');
    expect(block).toContain('pc.recycled_at IS NULL');
    expect(block).toContain('pc.subject_kind = i.subject_kind');
    expect(block).toContain(
      'pc.card_user_id IS NOT DISTINCT FROM i.card_user_id'
    );
    expect(block).toContain('FOR UPDATE OF pc');
    // Moins de lignes verrouillées que prévu = caducité, annulée proprement.
    expect(flatBody).toContain('IF v_locked < v_expected THEN');
    expect(flatBody).toContain("resolution_reason = 'offered_unavailable'");
  });

  it('revérifie les cartes DEMANDÉES chez la destinataire, verrouillées, la moins précieuse d’abord', () => {
    const start = flatBody.indexOf('p.user_id = v_trade.recipient_id');
    const block = flatBody.slice(
      start,
      flatBody.indexOf('FOR UPDATE OF pc', start) + 16
    );
    expect(block).toContain('p.opened_at IS NOT NULL');
    expect(block).toContain('public.tcg_pack_source_tradeable(p.source_kind)');
    expect(block).toContain('pc.recycled_at IS NULL');
    expect(block).toContain('public.tcg_rarity_rank(pc.rarity), pc.is_foil');
    expect(block).toContain('LIMIT 1 FOR UPDATE OF pc');
    // Introuvable : on sort SANS rien écrire ni annuler (pas de fuite).
    expect(flatBody).toMatch(
      /IF NOT FOUND THEN RETURN jsonb_build_object\('status', 'requested_unavailable'\); END IF;/
    );
  });

  it('toutes les vérifications précèdent le premier déplacement de carte', () => {
    const firstMove = body.indexOf('UPDATE public.tcg_pack_cards');
    for (const guard of [
      "'daily_limit'",
      "'partner_daily_limit'",
      "'not_eligible'",
      "'stale'",
      "'requested_unavailable'",
    ]) {
      expect(body.indexOf(guard), guard).toBeGreaterThan(0);
      expect(body.indexOf(guard), guard).toBeLessThan(firstMove);
    }
  });

  it('déplace la LIGNE (changement de paquet) dans deux paquets `trade` ouverts, sans jamais toucher aux pièces', () => {
    expect(flatBody).toMatch(
      /INSERT INTO public\.tcg_packs \(tenant_id, user_id, source_kind, source_match_id, granted_at, opened_at\) VALUES \(p_tenant_id, v_trade\.recipient_id, 'trade', NULL, v_now, v_now\)/
    );
    expect(flatBody).toContain(
      'UPDATE public.tcg_pack_cards SET pack_id = v_recipient_pack, position = v_pos'
    );
    expect(flatBody).toContain(
      'UPDATE public.tcg_pack_cards SET pack_id = v_proposer_pack, position = v_i - 1'
    );
    // Pas de copie de carte : aucun INSERT dans tcg_pack_cards.
    expect(sql).not.toMatch(/INSERT INTO public\.tcg_pack_cards/);
    // Carte contre carte : aucune écriture de monnaie, nulle part.
    expect(sql).not.toMatch(/tcg_wallet_entries|tcg_wallets/);
  });

  it('annule en cascade les autres propositions qui offraient une carte déplacée', () => {
    expect(flatBody).toContain("resolution_reason = 'card_unavailable'");
    expect(flatBody).toContain(
      "WHERE i.trade_id = t.id AND i.side = 'offered'"
    );
  });

  it('plafond d’échanges acceptés sur 24 h, pour les deux joueuses', () => {
    expect(
      body.match(/resolved_at > v_now - interval '24 hours'/g)
    ).toHaveLength(2);
    expect(body.match(/>= p_max_accepted_per_day/g)).toHaveLength(2);
  });
});

describe('tcg_propose_trade — anti-abus sous verrou', () => {
  const body = functionBody('tcg_propose_trade');
  const flatBody = body.replace(/\s+/g, ' ');

  it('exige la parité et au moins une carte de chaque côté', () => {
    expect(flatBody).toContain('OR v_n_offered <> v_n_requested');
    expect(flatBody).toContain('IF v_n_offered < 1');
  });

  it('refuse l’échange avec soi-même, vérifie les deux consentements et l’ancienneté', () => {
    expect(flatBody).toContain(
      "IF p_proposer_id = p_recipient_id THEN RETURN jsonb_build_object('status', 'self_trade')"
    );
    expect(flatBody.match(/accepts_proposals/g)?.length).toBeGreaterThanOrEqual(
      2
    );
    expect(body.match(/public\.tcg_trade_eligibility\(/g)).toHaveLength(2);
  });

  it('plafonds par compte, paire unique, délai après refus — tous avant l’insertion', () => {
    const insert = body.indexOf('INSERT INTO public.tcg_trades');
    for (const code of [
      "'too_many_pending'",
      "'recipient_inbox_full'",
      "'already_pending'",
      "'recently_declined'",
      "'offered_not_owned'",
      "'requested_not_available'",
    ]) {
      expect(body.indexOf(code), code).toBeGreaterThan(0);
      expect(body.indexOf(code), code).toBeLessThan(insert);
    }
  });

  it('une carte offerte : possédée, échangeable, non engagée ailleurs, verrouillée', () => {
    expect(flatBody).toContain(
      'p.user_id = p_proposer_id AND p.opened_at IS NOT NULL AND public.tcg_pack_source_tradeable(p.source_kind) AND pc.recycled_at IS NULL'
    );
    expect(flatBody).toMatch(
      /AND NOT EXISTS \( SELECT 1 FROM public\.tcg_trade_items i JOIN public\.tcg_trades t ON t\.id = i\.trade_id WHERE i\.side = 'offered'/
    );
    expect(flatBody).toContain('FOR UPDATE OF pc');
  });

  it('une carte demandée : au moins deux exemplaires ET un échangeable, rien de verrouillé chez elle', () => {
    expect(flatBody).toContain('IF v_count < 2 OR v_tradeable < 1 THEN');
    const requestedBlock = flatBody.slice(
      flatBody.indexOf('p.user_id = p_recipient_id')
    );
    expect(requestedBlock.slice(0, 400)).not.toContain('FOR UPDATE');
  });
});

describe('schéma et droits', () => {
  it('les origines échangeables du SQL sont EXACTEMENT celles de tradeRules', () => {
    const m = flat.match(
      /FUNCTION public\.tcg_pack_source_tradeable\(p_source_kind text\).*?SELECT p_source_kind IN \(([^)]*)\)/
    );
    expect(m).not.toBeNull();
    const values = [...(m?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map(
      (x) => x[1]
    );
    expect(values.sort()).toEqual([...TRADEABLE_PACK_SOURCES].sort());
    // Les cadeaux, séries et drops ne s'échangent pas.
    for (const excluded of ['welcome', 'streak', 'drop']) {
      expect(values).not.toContain(excluded);
    }
  });

  it('élargit les DEUX contraintes de tcg_packs, listes recopiées en entier', () => {
    const kindCheck = flat.match(
      /ADD CONSTRAINT tcg_packs_source_kind_check CHECK \( source_kind IN \(([^)]*)\)/
    );
    const values = [...(kindCheck?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map(
      (x) => x[1]
    );
    expect(values.sort()).toEqual(
      [
        'victory',
        'purchase',
        'welcome',
        'drop',
        'placement',
        'streak',
        'trade',
      ].sort()
    );
    expect(flat).toContain(
      "source_kind IN ('purchase', 'welcome', 'drop', 'placement', 'streak', 'trade') AND source_match_id IS NULL"
    );
  });

  it('opt-in par défaut, pas d’auto-échange, une seule proposition en attente par paire', () => {
    expect(flat).toContain('accepts_proposals boolean NOT NULL DEFAULT false');
    expect(flat).toContain(
      'CONSTRAINT tcg_trades_not_self CHECK (proposer_id <> recipient_id)'
    );
    expect(flat).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS tcg_trades_one_pending_per_pair ON public.tcg_trades (tenant_id, proposer_id, recipient_id) WHERE status = 'pending'"
    );
  });

  it('aucune colonne de texte libre ni de montant dans une proposition', () => {
    const table = flat.slice(
      flat.indexOf('CREATE TABLE IF NOT EXISTS public.tcg_trades ('),
      flat.indexOf(
        'CREATE UNIQUE INDEX IF NOT EXISTS tcg_trades_one_pending_per_pair'
      )
    );
    expect(table).not.toMatch(/\b(message|note|comment|amount|coins)\b/);
    const items = flat.slice(
      flat.indexOf('CREATE TABLE IF NOT EXISTS public.tcg_trade_items ('),
      flat.indexOf('CREATE INDEX IF NOT EXISTS idx_tcg_trade_items_from')
    );
    // Aucune image figée : les faces se relisent (consentement rétroactif).
    expect(items).not.toMatch(/photo|image|url/i);
  });

  it('RLS service_role seule sur les trois tables', () => {
    for (const t of ['tcg_trade_settings', 'tcg_trades', 'tcg_trade_items']) {
      expect(flat).toContain(
        `ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`
      );
      expect(flat).toContain(
        `ON public.${t} FOR ALL TO service_role USING (true) WITH CHECK (true)`
      );
    }
  });

  it('les fonctions sensibles ne sont exécutables que par service_role', () => {
    for (const fn of [
      'tcg_propose_trade',
      'tcg_accept_trade',
      'tcg_trade_eligibility',
    ]) {
      expect(flat).toMatch(
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated`
        )
      );
      expect(flat).toMatch(
        new RegExp(
          `GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO service_role`
        )
      );
    }
  });

  it('la signature révoquée est bien celle déclarée (sinon le REVOKE viserait une fonction inexistante)', () => {
    const declared = functionBody('tcg_accept_trade')
      .slice(0, functionBody('tcg_accept_trade').indexOf(')'))
      .match(/\b(uuid|integer|jsonb)\b/g);
    const revoked = flat
      .match(/REVOKE ALL ON FUNCTION public\.tcg_accept_trade\(([^)]*)\)/)?.[1]
      .split(',')
      .map((s) => s.trim());
    expect(revoked).toEqual(declared);

    const declaredP = functionBody('tcg_propose_trade')
      .slice(0, functionBody('tcg_propose_trade').indexOf(')'))
      .match(/\b(uuid|integer|jsonb)\b/g);
    const revokedP = flat
      .match(/REVOKE ALL ON FUNCTION public\.tcg_propose_trade\(([^)]*)\)/)?.[1]
      .split(',')
      .map((s) => s.trim());
    expect(revokedP).toEqual(declaredP);
  });
});
