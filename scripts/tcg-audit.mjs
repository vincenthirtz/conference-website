#!/usr/bin/env node
// scripts/tcg-audit.mjs
//
// L'audit d'intégrité du TCG, rejouable.
//
// POURQUOI CE SCRIPT EXISTE. `docs/TCG.md` § 7 portait ces requêtes en BLOC DE
// CODE, à recopier dans un éditeur SQL le jour où l'on se demanderait si
// l'économie a dérivé. Une requête dans un document est une requête qu'on ne
// lance pas : elle n'a pas de sortie, pas de verdict, et elle vieillit avec le
// schéma sans que rien ne le signale. Les contrôles vivent donc ici.
//
// CE QU'IL VÉRIFIE — et ce sont des invariants d'ARGENT, dans un jeu où la
// monnaie se gagne et ne s'achète pas :
//
//   1. Registre négatif. Le solde affiché est un cache plafonné à 0 ; une somme
//      d'écritures négative est donc INVISIBLE en jeu, et c'est la signature
//      d'une course d'achats gagnée deux fois.
//   2. Cache désaccordé. `tcg_wallets.balance` doit valoir la somme du
//      registre. Un écart veut dire qu'une joueuse voit un solde qui n'est
//      adossé à rien.
//   3. `scrim_win` orphelins. Un gain dont le miroir a disparu ne dit plus à
//      quel scrim il se rattache : plusieurs lignes rapprochées pour la même
//      joueuse sont la signature de la boucle litige → terminé.
//   4. Gains en double sur une même source. La contrainte d'unicité
//      (`source_kind`, `source_ref`) l'interdit ; le vérifier, c'est vérifier
//      que la contrainte est bien là.
//   5. Cartes sans sujet. Le CHECK d'exclusivité le rend impossible ; une
//      ligne qui passe quand même est une corruption, et elle serait SAUTÉE en
//      silence par tous les lecteurs.
//   6. Types de carte inconnus du code. Une carte écrite par une version plus
//      récente — ou par une migration qui a ouvert un type que le code ne sait
//      pas afficher. Invisible en jeu, comme les mascottes l'ont été.
//   7. Photos en attente de purge. Le bucket est PUBLIC : une ligne qui
//      s'accumule est une photo retirée qui reste joignable.
//
// AUCUNE ÉCRITURE. Le script lit, compte, et rend un code de sortie. Réparer
// demande un jugement (un `admin_grant` négatif n'est pas anodin) : ce n'est
// pas à une commande de le prendre.
//
// USAGE : node scripts/tcg-audit.mjs [--json]
//   Lit NEXT_PUBLIC_SUPABASE_URL et NEXT_SUPABASE_SERVICE_ROLE_KEY (ou
//   SUPABASE_SERVICE_ROLE_KEY) depuis l'environnement ou .env.local.
//   Code de sortie : 0 si tout est sain, 1 si au moins un contrôle alerte.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvLocal() {
  let raw;
  try {
    raw = readFileSync(resolve(root, '.env.local'), 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, key, rawValue] = m;
    if (process.env[key]) continue;
    process.env[key] = rawValue.trim().replace(/^["']|["']$/g, '');
  }
}

loadEnvLocal();

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const key =
  process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  '';

if (!url || !key) {
  console.error(
    'tcg-audit: NEXT_PUBLIC_SUPABASE_URL et NEXT_SUPABASE_SERVICE_ROLE_KEY requis.'
  );
  process.exit(2);
}

/**
 * Les types de carte que le code sait afficher.
 *
 * RECOPIÉ À DESSEIN, et c'est le seul endroit du dépôt où ce serait acceptable :
 * un script en `.mjs` ne peut pas importer un `.ts` sans chaîne de compilation,
 * et le contrôle n°6 perdrait tout son sens s'il lisait la même liste que le
 * code qu'il surveille. Ici, la copie EST le témoin.
 */
const KNOWN_KINDS = ['player', 'team', 'map', 'fanart', 'mascot'];

async function rest(path) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      Prefer: 'count=exact',
    },
  });
  if (!res.ok) {
    throw new Error(`${path} → ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/** Somme des écritures par (espace, joueuse), et le solde mis en cache. */
async function walletChecks() {
  const entries = await rest(
    'tcg_wallet_entries?select=tenant_id,user_id,amount,source_kind,source_ref&limit=100000'
  );
  const wallets = await rest(
    'tcg_wallets?select=tenant_id,user_id,balance&limit=100000'
  );

  const ledger = new Map();
  for (const e of entries) {
    const k = `${e.tenant_id}:${e.user_id}`;
    ledger.set(k, (ledger.get(k) ?? 0) + Number(e.amount ?? 0));
  }

  const negative = [...ledger.entries()].filter(([, sum]) => sum < 0);
  const drifted = wallets.filter((w) => {
    const sum = ledger.get(`${w.tenant_id}:${w.user_id}`) ?? 0;
    return Number(w.balance ?? 0) !== Math.max(sum, 0);
  });

  // Deux gains sur la MÊME source. La contrainte d'unicité
  // (`tenant_id`, `user_id`, `source_kind`, `source_ref`) l'interdit : en
  // trouver, c'est découvrir que la contrainte a été perdue quelque part — et
  // qu'une victoire a pu être payée deux fois.
  const seen = new Set();
  const duplicates = [];
  for (const e of entries) {
    if (!e.source_ref) continue;
    const k = `${e.tenant_id}:${e.user_id}:${e.source_kind}:${e.source_ref}`;
    if (seen.has(k)) duplicates.push(k);
    else seen.add(k);
  }

  return { entries: entries.length, negative, drifted, duplicates };
}

async function main() {
  const asJson = process.argv.includes('--json');
  const findings = [];
  const note = (id, label, count, detail) =>
    findings.push({ id, label, count, detail });

  const { entries, negative, drifted, duplicates } = await walletChecks();
  note(
    'ledger_negative',
    'Registres à somme négative (invisibles : le solde est plafonné à 0)',
    negative.length,
    negative.slice(0, 10).map(([k, sum]) => `${k} = ${sum}`)
  );
  note(
    'balance_drift',
    'Soldes en cache désaccordés du registre',
    drifted.length,
    drifted.slice(0, 10).map((w) => `${w.tenant_id}:${w.user_id}`)
  );

  note(
    'duplicate_source',
    'Gains en double sur une même source (contrainte d’unicité perdue)',
    duplicates.length,
    duplicates.slice(0, 10)
  );

  // `scrim_win` dont la référence n'est pas la forme stable `scrim:<id>` : ce
  // sont les gains d'avant la migration, dont le miroir a pu disparaître.
  const legacyScrim = await rest(
    'tcg_wallet_entries?select=user_id,source_ref&source_kind=eq.scrim_win&source_ref=not.like.scrim:*&limit=1000'
  );
  note(
    'scrim_win_legacy_ref',
    'Gains de scrim à référence instable (miroir potentiellement disparu)',
    legacyScrim.length,
    legacyScrim.slice(0, 10).map((r) => `${r.user_id} ← ${r.source_ref}`)
  );

  const cards = await rest(
    'tcg_pack_cards?select=pack_id,position,subject_kind,card_user_id,card_team_id,card_map_slug,card_fanart_id,card_mascot_slug&limit=100000'
  );
  const column = {
    player: 'card_user_id',
    team: 'card_team_id',
    map: 'card_map_slug',
    fanart: 'card_fanart_id',
    mascot: 'card_mascot_slug',
  };
  const orphan = cards.filter((c) => {
    const col = column[c.subject_kind];
    return col ? !c[col] : false;
  });
  const unknown = cards.filter((c) => !KNOWN_KINDS.includes(c.subject_kind));
  note(
    'card_without_subject',
    'Cartes sans sujet (sautées en silence par tous les lecteurs)',
    orphan.length,
    orphan.slice(0, 10).map((c) => `${c.pack_id}:${c.position}`)
  );
  note(
    'card_unknown_kind',
    'Cartes d’un type que le code ne sait pas afficher',
    unknown.length,
    [...new Set(unknown.map((c) => c.subject_kind))].slice(0, 10)
  );

  const purges = await rest(
    'tcg_photo_purges?select=storage_path,attempts,last_error&limit=1000'
  );
  note(
    'photo_purge_pending',
    'Photos retirées encore présentes dans le bucket PUBLIC',
    purges.length,
    purges.slice(0, 10).map((p) => `${p.storage_path} (${p.attempts} essais)`)
  );

  const alerting = findings.filter((f) => f.count > 0);

  if (asJson) {
    console.log(JSON.stringify({ entries, findings }, null, 2));
  } else {
    console.log(`TCG — audit d'intégrité (${entries} écritures au registre)\n`);
    for (const f of findings) {
      const mark = f.count > 0 ? '✗' : '✓';
      console.log(`${mark} ${f.label} : ${f.count}`);
      if (f.count > 0 && f.detail?.length) {
        for (const d of f.detail) console.log(`    ${d}`);
        if (f.count > f.detail.length) {
          console.log(`    … et ${f.count - f.detail.length} de plus`);
        }
      }
    }
    console.log(
      alerting.length === 0
        ? '\nTout est sain.'
        : `\n${alerting.length} contrôle(s) en alerte.`
    );
  }

  process.exit(alerting.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('tcg-audit:', err.message);
  process.exit(2);
});
