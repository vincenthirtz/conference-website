// Unit tests — le garde-fou qui interdit aux e2e de semer la PRODUCTION.
//
// CE QUE CE FICHIER PROTÈGE. `tests/utils/supabaseTestClient.ts` est le seul
// point d'accès service-role des tests e2e. Il refuse la base de production en
// absolu, et toute autre base distante sauf drapeau explicite. C'est la règle
// la plus dure du dépôt : la franchir n'abîme pas un test, elle écrit dans la
// base réelle du tournoi.
//
// POURQUOI ELLE N'ÉTAIT PAS TESTÉE, ET POURQUOI C'EST LE PROBLÈME. La décision
// vivait dans un `if` exécuté au chargement du module. Pour l'exercer, il
// fallait réimporter le module avec un environnement truqué — donc personne ne
// l'a jamais fait. Une règle qu'on ne peut pas exécuter est une règle dont on
// ne peut pas savoir qu'elle est cassée : un `supabaseUrl` renommé, un ref de
// projet ajouté, une refonte du bloc, et elle devenait décorative en silence.
// La décision est désormais une fonction PURE, et chaque branche est vérifiée
// ici.
//
// CE QUE LES CAS CI-DESSOUS NE COUVRENT PAS, et il faut le dire : ce garde-fou
// protège le SEED DIRECT. Il ne dit rien du serveur Next lancé par Playwright,
// qui lit `.env` et parle donc à la base que `.env` désigne. Cet autre versant
// est tenu par `tests/unit/e2eNoProdWrites.test.ts`.

import { describe, it, expect } from 'vitest';

import {
  seedTargetVerdict,
  isLocalSupabaseUrl,
  PROD_SUPABASE_MARKERS,
} from '../utils/supabaseTestClient';

const KEY = 'service-role-fake';
const PROD_URL = 'https://yhfdhpqgmazfxyyklomp.supabase.co';

describe('garde-fou de seed e2e', () => {
  it('REFUSE la production, même avec le drapeau de dérogation', () => {
    // Le point entier de la règle : aucun override ne débloque la prod.
    for (const allowRemote of [false, true]) {
      const v = seedTargetVerdict(PROD_URL, KEY, allowRemote);
      expect(v.allowed).toBe(false);
      expect(v.allowed === false && v.reason).toBe('production');
    }
  });

  it('reconnaît la prod par chacun de ses marqueurs', () => {
    // Le ref ET le nom du projet. Les deux existent parce que l'URL peut
    // arriver sous l'une ou l'autre forme selon d'où elle est copiée.
    expect(PROD_SUPABASE_MARKERS.length).toBeGreaterThan(0);
    for (const marker of PROD_SUPABASE_MARKERS) {
      const v = seedTargetVerdict(`https://${marker}.supabase.co`, KEY, true);
      expect(v.allowed).toBe(false);
    }
  });

  it('ne fait pas fuiter l’URL complète dans le message', () => {
    // Le message part dans les journaux de CI, qui sont publics sur ce dépôt.
    const v = seedTargetVerdict(PROD_URL, KEY, false);
    expect(v.allowed).toBe(false);
    if (v.allowed === false) {
      expect(v.message).not.toContain('yhfdhpqgmazfxyyklomp');
      expect(v.message).toContain('…');
    }
  });

  it('autorise une Supabase locale, sous toutes ses formes', () => {
    // `kong` est le nom d'hôte du conteneur dans la stack `supabase start` :
    // l'oublier ferait échouer le seed depuis un test lancé DANS le réseau
    // Docker, et pousserait à désactiver le garde-fou pour s'en sortir.
    for (const url of [
      'http://localhost:54321',
      'http://127.0.0.1:54321',
      'http://0.0.0.0:54321',
      'http://[::1]:54321',
      'http://kong:8000',
      'https://db.supabase.internal',
    ]) {
      expect(isLocalSupabaseUrl(url)).toBe(true);
      expect(seedTargetVerdict(url, KEY, false).allowed).toBe(true);
    }
  });

  it('ne confond pas un hôte distant avec un hôte local', () => {
    // Un nom d'hôte qui CONTIENT « localhost » n'est pas local.
    expect(isLocalSupabaseUrl('https://localhost.evil.example.com')).toBe(
      false
    );
    expect(isLocalSupabaseUrl('https://abcdef.supabase.co')).toBe(false);
  });

  it('refuse un autre projet distant sans drapeau, l’autorise avec', () => {
    const other = 'https://abcdefghijklmnopqrst.supabase.co';
    const refused = seedTargetVerdict(other, KEY, false);
    expect(refused.allowed).toBe(false);
    expect(refused.allowed === false && refused.reason).toBe(
      'remote-not-allowed'
    );
    expect(seedTargetVerdict(other, KEY, true).allowed).toBe(true);
  });

  it('sans clé service-role, il n’y a rien à interdire', () => {
    // Aucune écriture n'est possible : le module n'instancie alors aucun
    // client. Lever ici empêcherait simplement de lancer les tests de lecture.
    expect(seedTargetVerdict(PROD_URL, '', false).allowed).toBe(true);
    expect(seedTargetVerdict('', KEY, false).allowed).toBe(true);
  });
});
