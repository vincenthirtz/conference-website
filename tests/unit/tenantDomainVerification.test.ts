// tests/unit/tenantDomainVerification.test.ts
//
// T7 — un domaine propre se prouve.
//
// Avant : `custom_domain` était un champ texte validé en syntaxe seule, et le
// résolveur routait dessus. N'importe quel espace pouvait donc déclarer
// n'importe quel nom d'hôte — y compris celui d'un autre — et se le voir
// router. Une faute de frappe, elle, donnait un site muet sans explication.
//
// Ce que ces tests tiennent :
//   - la preuve TXT autorise, et elle seule ;
//   - le CNAME manquant AVERTIT sans refuser (un apex pointe souvent par A) ;
//   - le résolveur ignore tout domaine non vérifié ;
//   - une zone injoignable ne fait pas passer pour vérifié.

import { describe, it, expect } from 'vitest';
import {
  checkDomain,
  dnsInstructions,
  generateDomainToken,
  PROOF_PREFIX,
} from '../../utils/tenants/domainVerification';

const TOKEN = 'conference-verify=abc123';

/** Faux résolveur DNS : posséder un domaine n'est pas une base de test. */
function resolver(opts: {
  txt?: string[][];
  cname?: string[];
  txtThrows?: boolean;
  cnameThrows?: boolean;
}) {
  return {
    resolveTxt: async () => {
      if (opts.txtThrows) throw new Error('ENOTFOUND');
      return opts.txt ?? [];
    },
    resolveCname: async () => {
      if (opts.cnameThrows) throw new Error('ENODATA');
      return opts.cname ?? [];
    },
  };
}

describe('checkDomain', () => {
  it('vérifie quand la preuve TXT est publiée', async () => {
    const r = await checkDomain(
      'club.example',
      TOKEN,
      resolver({ txt: [[TOKEN]], cname: ['owwomenscup.fr'] })
    );
    expect(r.ok).toBe(true);
    expect(r.proofFound).toBe(true);
    expect(r.routingFound).toBe(true);
  });

  it('recolle un TXT découpé en morceaux', async () => {
    // Un TXT long arrive en tronçons de 255 octets : c'est la concaténation
    // qui fait foi, pas le premier morceau.
    const r = await checkDomain(
      'club.example',
      TOKEN,
      resolver({ txt: [['conference-verify=', 'abc123']] })
    );
    expect(r.proofFound).toBe(true);
  });

  it('vérifie SANS le CNAME, mais le dit', async () => {
    // Un apex pointe souvent par A/ALIAS : en faire un motif de refus
    // bloquerait des domaines parfaitement légitimes.
    const r = await checkDomain(
      'club.example',
      TOKEN,
      resolver({ txt: [[TOKEN]], cnameThrows: true })
    );
    expect(r.ok).toBe(true);
    expect(r.routingFound).toBe(false);
    expect(r.detail).toContain('CNAME');
  });

  it('refuse quand le TXT porte un autre jeton', async () => {
    const r = await checkDomain(
      'club.example',
      TOKEN,
      resolver({ txt: [['conference-verify=autre-chose']] })
    );
    expect(r.ok).toBe(false);
    expect(r.proofFound).toBe(false);
  });

  it('refuse quand la zone est injoignable', async () => {
    // Le cas le plus dangereux : une erreur réseau ne doit JAMAIS valoir
    // preuve.
    const r = await checkDomain(
      'club.example',
      TOKEN,
      resolver({ txtThrows: true })
    );
    expect(r.ok).toBe(false);
    expect(r.detail).toContain(PROOF_PREFIX);
  });
});

describe('jeton et instructions', () => {
  it('génère un jeton préfixé et non devinable', () => {
    const a = generateDomainToken();
    const b = generateDomainToken();
    expect(a).toMatch(/^conference-verify=[0-9a-f]{48}$/);
    expect(a).not.toBe(b);
  });

  it('donne les deux enregistrements, preuve d’abord', () => {
    const records = dnsInstructions('club.example', TOKEN);
    expect(records).toHaveLength(2);
    expect(records[0].type).toBe('TXT');
    expect(records[0].name).toBe(`${PROOF_PREFIX}.club.example`);
    expect(records[0].value).toBe(TOKEN);
    expect(records[1].type).toBe('CNAME');
  });
});
