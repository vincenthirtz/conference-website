// Le lien de profil social est construit à partir d'une valeur SAISIE À LA
// MAIN — par une joueuse sur son compte, ou par sa capitaine sur la fiche de
// roster. Les deux alimentent la même colonne et le même rendu, donc la même
// entrée doit produire le même lien des deux côtés : c'est ce que ce fichier
// garde.

import { describe, it, expect } from 'vitest';
import {
  TWITCH_HANDLE_MAX,
  isValidTwitchValue,
  safeHref,
  socialHandleLabel,
  socialHref,
} from '../../utils/social/profileHandles';

describe('safeHref', () => {
  it('complète un domaine nu en https', () => {
    expect(safeHref('twitch.tv/pseudo')).toBe('https://twitch.tv/pseudo');
  });

  it('laisse une URL http(s) intacte', () => {
    expect(safeHref('http://exemple.fr/a')).toBe('http://exemple.fr/a');
    expect(safeHref('https://exemple.fr/a')).toBe('https://exemple.fr/a');
  });

  it('rejette les protocoles non http(s)', () => {
    // Un href `javascript:` rendu dans un <a> est une XSS stockée : ces champs
    // sont remplis par des utilisatrices, pas par du staff.
    expect(safeHref('javascript:alert(1)')).toBeUndefined();
    expect(safeHref('data:text/html,<script>')).toBeUndefined();
  });
});

describe('socialHref', () => {
  it('construit le lien Twitch depuis un handle, avec ou sans @', () => {
    expect(socialHref('twitch', 'Pseudo')).toBe('https://twitch.tv/Pseudo');
    expect(socialHref('twitch', '@Pseudo')).toBe('https://twitch.tv/Pseudo');
    expect(socialHref('twitch', '  Pseudo  ')).toBe('https://twitch.tv/Pseudo');
  });

  it('respecte une URL déjà complète plutôt que de la ré-préfixer', () => {
    expect(socialHref('twitch', 'https://twitch.tv/Pseudo')).toBe(
      'https://twitch.tv/Pseudo'
    );
  });

  it('renvoie undefined sur une valeur vide ou réduite à un @', () => {
    expect(socialHref('twitch', null)).toBeUndefined();
    expect(socialHref('twitch', undefined)).toBeUndefined();
    expect(socialHref('twitch', '   ')).toBeUndefined();
    expect(socialHref('twitch', '@')).toBeUndefined();
  });

  it('couvre les autres plateformes de profil', () => {
    expect(socialHref('x', '@Pseudo')).toBe('https://x.com/Pseudo');
    expect(socialHref('youtube', 'Chaine')).toBe('https://youtube.com/@Chaine');
    expect(socialHref('instagram', 'Pseudo')).toBe(
      'https://instagram.com/Pseudo'
    );
    expect(socialHref('tiktok', 'Pseudo')).toBe('https://tiktok.com/@Pseudo');
  });
});

describe('socialHandleLabel', () => {
  it("affiche le pseudo, pas l'URL", () => {
    expect(socialHandleLabel('https://twitch.tv/Pseudo')).toBe('Pseudo');
    expect(socialHandleLabel('https://www.twitch.tv/Pseudo/')).toBe('Pseudo');
    expect(socialHandleLabel('@Pseudo')).toBe('Pseudo');
    expect(socialHandleLabel('Pseudo')).toBe('Pseudo');
  });

  it('renvoie null quand il n’y a rien à afficher', () => {
    expect(socialHandleLabel(null)).toBeNull();
    expect(socialHandleLabel('  ')).toBeNull();
    expect(socialHandleLabel('https://twitch.tv/')).toBeNull();
  });
});

describe('isValidTwitchValue', () => {
  it('accepte un pseudo Twitch', () => {
    expect(isValidTwitchValue('pseudo_twitch')).toBe(true);
    expect(isValidTwitchValue('@pseudo_twitch')).toBe(true);
    expect(isValidTwitchValue('abc')).toBe(true); // 3 caractères : comptes historiques
    expect(isValidTwitchValue('a'.repeat(25))).toBe(true);
  });

  it('accepte une URL twitch.tv, chaîne comme clip', () => {
    expect(isValidTwitchValue('https://twitch.tv/pseudo')).toBe(true);
    expect(isValidTwitchValue('https://www.twitch.tv/pseudo')).toBe(true);
    expect(isValidTwitchValue('https://m.twitch.tv/pseudo')).toBe(true);
    expect(isValidTwitchValue('https://twitch.tv/pseudo/clip/Abc')).toBe(true);
  });

  it('refuse une URL vers un autre domaine', () => {
    // Le champ est étiqueté « Twitch » ; y ranger un lien Discord donnerait un
    // bouton Twitch qui n'ouvre pas Twitch.
    expect(isValidTwitchValue('https://discord.gg/abcd')).toBe(false);
    expect(isValidTwitchValue('https://twitch.tv.evil.com/pseudo')).toBe(false);
    expect(isValidTwitchValue('javascript:alert(1)')).toBe(false);
  });

  it('refuse un pseudo mal formé', () => {
    expect(isValidTwitchValue('')).toBe(false);
    expect(isValidTwitchValue('  ')).toBe(false);
    expect(isValidTwitchValue('ab')).toBe(false);
    expect(isValidTwitchValue('a'.repeat(26))).toBe(false);
    expect(isValidTwitchValue('pseudo twitch')).toBe(false);
    expect(isValidTwitchValue('pseudo-twitch')).toBe(false);
  });

  it('reste sous la longueur stockable', () => {
    expect(TWITCH_HANDLE_MAX).toBe(80);
  });
});
