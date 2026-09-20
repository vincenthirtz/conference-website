// Unit tests — aucune fonction `SECURITY DEFINER` ne reste ouverte à tout le
// monde.
//
// CE QUI EST ARRIVÉ, ET QUI EXPLIQUE CE FICHIER. Le 2026-09-20, la fonction
// `reassign_captain(p_team_id, p_new_captain, p_tenant)` était SECURITY
// DEFINER, exposée en RPC par PostgREST, et `EXECUTE` était accordé à `PUBLIC`,
// `anon` ET `authenticated`. Son corps ne contrôle pas son appelante : il
// verrouille la ligne d'équipe et réassigne le capitanat.
//
// La clé `anon` est publique par construction — elle part dans le bundle
// navigateur — et les identifiants d'équipe se lisent sur les pages publiques.
// N'importe qui pouvait donc se nommer capitaine de n'importe quelle équipe.
// L'autorisation existait, mais UNE COUCHE TROP HAUT : dans la route
// `pages/api/teams/transfer-captain.ts`, que rien n'obligeait à traverser.
//
// CE N'ÉTAIT PAS UN DÉFAUT DE CONCEPTION, C'ÉTAIT UN OUBLI. La convention du
// dépôt est claire et suivie partout ailleurs : toute migration qui crée une
// fonction SECURITY DEFINER la fait suivre d'un
// `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated`. Vingt et une
// fonctions la respectaient ; une l'avait manquée, et RIEN ne le disait. Ce
// test est ce qui manquait.
//
// POURQUOI UN TEST STATIQUE ET NON UNE REQUÊTE. La suite tourne hors ligne, en
// CI, sans accès à la base : on ne peut pas interroger `pg_proc`. On lit donc
// les MIGRATIONS, qui sont la source de ce que la base finit par contenir.
//
// La conséquence assumée : ce test ne voit pas un droit accordé à la main dans
// la console Supabase, hors migration. C'est le prix d'un contrôle qui tourne à
// chaque commit ; l'état réel se vérifie avec le linter de Supabase
// (`get_advisors`), qui est précisément ce qui a levé le lièvre.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = 'database/migrations';

/**
 * Les fonctions `SECURITY DEFINER` créées par les migrations.
 *
 * On découpe sur `CREATE [OR REPLACE] FUNCTION` et on ne garde que les blocs
 * qui portent `SECURITY DEFINER` avant le corps. Le nom seul suffit : une
 * révocation cite la même signature, et deux surcharges d'un même nom veulent
 * de toute façon le même traitement.
 */
function definerFunctions(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of readdirSync(MIGRATIONS)) {
    if (!file.endsWith('.sql')) continue;
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    const re =
      /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.([a-z0-9_]+)\s*\(/gi;
    for (const m of sql.matchAll(re)) {
      const name = m[1].toLowerCase();
      // LA DÉCLARATION S'ARRÊTE AU CORPS, et la borne compte : une fenêtre de
      // taille fixe attrapait le `SECURITY DEFINER` de la fonction SUIVANTE du
      // même fichier, et ce test a signalé `tcg_pack_source_tradeable` — qui
      // n'est pas SECURITY DEFINER (vérifié dans `pg_proc`, pas supposé). Un
      // faux positif dans un test de sécurité est un test qu'on finit par
      // désactiver.
      const from = m.index ?? 0;
      const bodyAt = sql.slice(from).search(/\bAS\s+(\$|')/i);
      const head = sql.slice(from, bodyAt === -1 ? from + 1200 : from + bodyAt);
      if (!/SECURITY\s+DEFINER/i.test(head)) continue;
      found.set(name, [...(found.get(name) ?? []), file]);
    }
  }
  return found;
}

/** Les fonctions dont une migration retire EXECUTE au tout-venant. */
function revokedFunctions(): Set<string> {
  const revoked = new Set<string>();
  for (const file of readdirSync(MIGRATIONS)) {
    if (!file.endsWith('.sql')) continue;
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    // `REVOKE ALL` ou `REVOKE EXECUTE`, suivi du nom, puis d'un `FROM` qui
    // cite au moins un des trois rôles ouverts.
    const re =
      /REVOKE\s+(?:ALL|EXECUTE)[^;]*?ON\s+FUNCTION\s+public\.([a-z0-9_]+)\s*\([^;]*?FROM\s+([^;]+);/gi;
    for (const m of sql.matchAll(re)) {
      const roles = m[2].toLowerCase();
      if (/public|anon|authenticated/.test(roles)) {
        revoked.add(m[1].toLowerCase());
      }
    }
  }
  return revoked;
}

/**
 * Fonctions dont l'ouverture est DÉLIBÉRÉE.
 *
 * Vide, et ce n'est pas un oubli : aucune fonction `SECURITY DEFINER` de ce
 * dépôt n'a de raison d'être appelable sans passer par une route qui vérifie
 * qui demande. Ajouter une entrée ici est une décision de sécurité — elle
 * réclame une phrase qui dit pourquoi, juste à côté.
 */
const OUVERTURE_ASSUMEE: ReadonlyArray<{ name: string; why: string }> = [];

describe('fonctions SECURITY DEFINER — aucune ouverte au tout-venant', () => {
  const created = definerFunctions();

  it('trouve bien des migrations à contrôler', () => {
    // Si le dossier est déplacé, le test ne doit pas devenir vert en ne
    // regardant plus rien.
    expect(created.size).toBeGreaterThan(5);
  });

  it('chaque fonction SECURITY DEFINER est révoquée quelque part', () => {
    const revoked = revokedFunctions();
    const allowed = new Set(OUVERTURE_ASSUMEE.map((e) => e.name));

    const manquantes = [...created.keys()]
      .filter((name) => !revoked.has(name) && !allowed.has(name))
      // Le fichier qui la crée, pour n'avoir pas à le chercher.
      .map((name) => `${name} (créée dans ${created.get(name)?.join(', ')})`)
      .sort();

    expect(manquantes).toEqual([]);
  });

  it('toute ouverture assumée porte sa raison', () => {
    for (const entry of OUVERTURE_ASSUMEE) {
      // Une liste d'exceptions sans motif redevient une liste qu'on ne relit
      // pas. Le test refuse une entrée muette.
      expect(entry.why.trim().length).toBeGreaterThan(20);
    }
  });
});

describe('vues — aucune n’ignore la RLS de qui l’interroge', () => {
  /**
   * UNE VUE SANS `security_invoker` S'EXÉCUTE AVEC LES DROITS DE SON
   * PROPRIÉTAIRE : elle traverse la RLS de l'appelante. Les tables de ce
   * schéma ont la RLS activée SANS politique — donc fermées à `anon` — et une
   * telle vue leur ouvre une fenêtre par-dessus cette fermeture.
   *
   * CE TEST EXISTE À CAUSE D'UN ALLER-RETOUR. Une migration avait posé
   * l'option sur `team_stats_view` par `ALTER VIEW` ; une migration
   * ULTÉRIEURE a recréé la vue par `CREATE OR REPLACE VIEW` sans l'option, et
   * l'a donc effacée EN SILENCE. Six mois plus tard, le linter de Supabase
   * l'a signalée comme si elle n'avait jamais été corrigée.
   *
   * D'où la règle vérifiée ici : l'option doit être DANS le `CREATE`, pas dans
   * un `ALTER` à côté. Un `ALTER` se perd à la recréation suivante ; un
   * `CREATE` qui la porte survit au rejeu du script.
   */
  it('chaque CREATE VIEW porte security_invoker', () => {
    const offenders: string[] = [];
    for (const file of readdirSync(MIGRATIONS)) {
      if (!file.endsWith('.sql')) continue;
      const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
      const re =
        /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+public\.([a-z0-9_]+)([\s\S]{0,200})/gi;
      for (const m of sql.matchAll(re)) {
        if (!/security_invoker/i.test(m[2])) {
          offenders.push(`${m[1]} (${file})`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
