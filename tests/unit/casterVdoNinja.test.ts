// Générateur de liens VDO.Ninja de la scène `camera` (utils/caster/vdoNinja.ts).
//
// Le couple push/view est la seule mise en place réellement temps réel : si les
// deux liens ne pointent pas sur la MÊME salle (une majuscule, un tiret avalé
// par VDO.Ninja d'un côté et pas de l'autre), l'opérateur pousse dans le vide et
// l'antenne affiche un cadre noir. D'où ces tests.

import { describe, it, expect } from 'vitest';

import {
  randomVdoRoomId,
  sanitizeVdoRoomId,
  vdoNinjaLinks,
} from '@/utils/caster/vdoNinja';

describe('sanitizeVdoRoomId', () => {
  it('minusculise et retire tout ce que VDO.Ninja n’accepte pas', () => {
    // VDO.Ninja retire lui-même les non-alphanumériques : on applique la même
    // règle pour que le lien AFFICHÉ soit celui réellement utilisé.
    expect(sanitizeVdoRoomId('Cam-1')).toBe('cam1');
    // Les accents ne passent pas non plus (« é » tombe) — voulu : VDO.Ninja
    // ferait de même, et une salle accentuée serait indictable.
    expect(sanitizeVdoRoomId('  Régie Salle_2 ')).toBe('rgiesalle2');
    expect(sanitizeVdoRoomId('WC/2026?x=1')).toBe('wc2026x1');
  });

  it('renvoie une chaîne vide pour une saisie sans alphanumérique', () => {
    expect(sanitizeVdoRoomId('')).toBe('');
    expect(sanitizeVdoRoomId('---')).toBe('');
    expect(sanitizeVdoRoomId('   ')).toBe('');
  });

  it('borne la longueur (URL lisible, dictable au téléphone)', () => {
    expect(sanitizeVdoRoomId('a'.repeat(80))).toHaveLength(32);
  });
});

describe('randomVdoRoomId', () => {
  it('préfixe reconnaissable + 8 caractères de l’alphabet non ambigu', () => {
    const id = randomVdoRoomId();
    expect(id).toMatch(/^wc[23456789a-z]{8}$/);
    expect(id).toHaveLength(10);
    // Aucun caractère confondable (0/o, 1/l/i) dans la partie tirée.
    expect(id.slice(2)).not.toMatch(/[01loi]/);
  });

  it('aléatoire injectable → tirage déterministe et bornes respectées', () => {
    expect(randomVdoRoomId(() => 0)).toBe('wc22222222');
    // rand() = 1 (borne haute exclue en théorie) ne doit pas sortir de
    // l'alphabet : dernier caractère, pas `undefined`.
    expect(randomVdoRoomId(() => 1)).toBe('wczzzzzzzz');
  });

  it('produit un identifiant normalisé (idempotent par sanitize)', () => {
    const id = randomVdoRoomId();
    expect(sanitizeVdoRoomId(id)).toBe(id);
  });

  it('deux tirages ne collisionnent pas', () => {
    const ids = new Set(Array.from({ length: 50 }, () => randomVdoRoomId()));
    expect(ids.size).toBe(50);
  });
});

describe('vdoNinjaLinks', () => {
  it('dérive push et view de la MÊME salle normalisée', () => {
    const links = vdoNinjaLinks('Cam-1');
    expect(links).toEqual({
      roomId: 'cam1',
      push: 'https://vdo.ninja/?push=cam1',
      view: 'https://vdo.ninja/?view=cam1',
    });
  });

  it('null si l’identifiant est vide après normalisation', () => {
    // Sinon on afficherait `?push=` — un lien qui ne mène nulle part.
    expect(vdoNinjaLinks('')).toBeNull();
    expect(vdoNinjaLinks('###')).toBeNull();
  });

  it('le lien de réception est reconnu par la détection de source', async () => {
    // Contrat de bout en bout : ce que le générateur propose doit être accepté
    // par detectCameraSource (sinon l'éditeur crierait « lien non reconnu »).
    const { detectCameraSource } = await import('@/utils/caster/cameraSource');
    const links = vdoNinjaLinks(randomVdoRoomId());
    const source = detectCameraSource(links!.view, 'localhost');
    expect(source.kind).toBe('vdoninja');
    expect(source.isFrame).toBe(true);
    expect(source.latency).toBe('sub-second');
    // `cleanoutput` est ajouté par la détection, pas par le générateur.
    expect(source.url).toContain('cleanoutput=1');
  });
});
