// Les comptes de l'association ont UNE source : `config/socials.ts`.
//
// Ils étaient déclarés en cinq endroits — barre flottante, pied de page,
// landing de tournoi, scènes d'overlay, données structurées SEO — et le
// cinquième avait divergé : il pointait vers un compte Twitter et un salon
// Twitch qui ne sont pas ceux de l'asso. « Ajouter un réseau partout »
// supposait donc de connaître les cinq et de n'en oublier aucun.
//
// Ce test garde la propriété qui compte : aucune URL de compte en dur ailleurs
// que dans la source.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SOCIALS, social, socialUrl } from '../../utils/../config/socials';

const REPO = path.resolve(__dirname, '..', '..');

/** Fichiers de code (hors tests, docs et la source elle-même). */
function sourceFiles(): string[] {
  const out: string[] = [];
  const roots = ['components', 'pages', 'lib', 'utils', 'config', 'hooks'];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
  };
  for (const r of roots) {
    const dir = path.join(REPO, r);
    if (fs.existsSync(dir)) walk(dir);
  }
  return out.filter((f) => !f.endsWith(path.join('config', 'socials.ts')));
}

describe('config/socials — source unique', () => {
  it('expose X, avec l’URL demandée', () => {
    expect(socialUrl('x')).toBe('https://x.com/Womens_Cup');
    expect(social('x').name).toBe('X');
  });

  it('chaque compte a une URL absolue et un handle', () => {
    for (const s of SOCIALS) {
      expect(s.href).toMatch(/^https:\/\//);
      expect(s.handle.length).toBeGreaterThan(0);
    }
  });

  it('aucune clé en double', () => {
    const keys = SOCIALS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('aucune URL de compte n’est écrite en dur ailleurs', () => {
    // Les hôtes des réseaux, tels qu'ils apparaîtraient dans une liste
    // dupliquée. Twitch est exclu : plusieurs pages pointent légitimement vers
    // la CHAÎNE (bandeau live, e-mail d'annonce), ce qui n'est pas une liste de
    // réseaux — et le test doit rester sur ce qu'il sait juger.
    const hosts = [
      'tiktok.com/@ow_womenscup',
      'instagram.com/womenscup_asso',
      'x.com/Womens_Cup',
      'twitter.com/OWWomensCup',
    ];

    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        // Les URL de PARTAGE (`twitter.com/intent/tweet?…`) ne sont pas des
        // comptes : elles composent un message pour le visiteur, et n'ont rien
        // à faire dans la liste des réseaux de l'asso.
        if (line.includes('/intent/')) return;
        for (const host of hosts) {
          if (line.includes(host)) {
            offenders.push(`${path.relative(REPO, file)}:${i + 1} → ${host}`);
          }
        }
      });
    }

    expect(
      offenders,
      `URL de compte en dur hors de config/socials.ts :\n  ${offenders.join('\n  ')}`
    ).toEqual([]);
  });
});
