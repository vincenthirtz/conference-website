// Normalisation de `caster_scenes.data` pour la scène `camera` (overlay OBS).
//
// La colonne est un jsonb écrit par plusieurs producteurs (cockpit web,
// duplication de scène, saisie partielle, versions antérieures) : aucune clé
// n'est garantie et l'overlay part à l'antenne. On vérifie donc que TOUTE
// entrée rend une vue complète, et que les défauts sont ceux qui ne peuvent pas
// nuire au direct (vignette, son coupé).
//
// Seule la fonction pure est testée : le rendu des overlays est validé en
// navigateur (aucun overlay caster n'a de smoke de rendu ici).

import { describe, it, expect } from 'vitest';
import { normalizeCameraData } from '@/components/overlay/caster/CasterCameraOverlay';

describe('normalizeCameraData', () => {
  it('rend une vue complète et inoffensive pour une data vide', () => {
    for (const raw of [null, undefined, {}]) {
      expect(normalizeCameraData(raw)).toEqual({
        url: '',
        label: '',
        fit: 'cover',
        shape: 'rounded',
        mirror: false,
        // Défauts « qui ne peuvent pas nuire » : pas de plein cadre inattendu,
        // pas d'écho audio avec le son du programme.
        layout: 'corner',
        corner: 'br',
        audio: false,
      });
    }
  });

  it('conserve une configuration complète valide', () => {
    expect(
      normalizeCameraData({
        url: 'https://vdo.ninja/?view=abc',
        label: 'Caméra scène',
        fit: 'contain',
        shape: 'circle',
        mirror: true,
        layout: 'fullscreen',
        corner: 'tl',
        audio: true,
      })
    ).toEqual({
      url: 'https://vdo.ninja/?view=abc',
      label: 'Caméra scène',
      fit: 'contain',
      shape: 'circle',
      mirror: true,
      layout: 'fullscreen',
      corner: 'tl',
      audio: true,
    });
  });

  it('trime url et label (copier-coller du lien de l’opérateur)', () => {
    const d = normalizeCameraData({
      url: '  https://vdo.ninja/?view=abc \n',
      label: '  Régie  ',
    });
    expect(d.url).toBe('https://vdo.ninja/?view=abc');
    expect(d.label).toBe('Régie');
  });

  it('accepte `rect` comme alias de `square` (vocabulaire de la scène webcam)', () => {
    expect(normalizeCameraData({ shape: 'rect' }).shape).toBe('square');
  });

  it('retombe sur les défauts pour des valeurs hors énumération', () => {
    const d = normalizeCameraData({
      url: 42,
      label: { fr: 'x' },
      fit: 'stretch',
      shape: 'triangle',
      mirror: 'yes',
      layout: 'pip',
      corner: 'middle',
      audio: 1,
    });
    expect(d).toEqual({
      url: '',
      label: '',
      fit: 'cover',
      shape: 'rounded',
      mirror: false,
      layout: 'corner',
      corner: 'br',
      audio: false,
    });
  });

  it('n’active mirror/audio que sur un vrai booléen true', () => {
    expect(
      normalizeCameraData({ mirror: 'true', audio: 'true' })
    ).toMatchObject({ mirror: false, audio: false });
    expect(normalizeCameraData({ mirror: true, audio: true })).toMatchObject({
      mirror: true,
      audio: true,
    });
  });

  it('accepte les quatre coins', () => {
    for (const corner of ['tl', 'tr', 'bl', 'br'] as const) {
      expect(normalizeCameraData({ corner }).corner).toBe(corner);
    }
  });
});
