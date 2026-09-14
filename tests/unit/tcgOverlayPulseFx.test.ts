// Unit tests — l'habillage vidéo de l'annonce TCG (le FX « pulse »).
//
// POURQUOI CETTE GARDE EXISTE : le FX est une décoration servie depuis
// `public/`, jouée en `autoPlay muted` dans une source navigateur OBS. Si le
// fichier est renommé, déplacé ou oublié au déploiement, le `<video>` ne trouve
// aucune source et n'affiche RIEN — sans erreur, sans log, sans test rouge.
// L'annonce continue de s'afficher, simplement dépouillée de son habillage, et
// personne ne s'en aperçoit avant de regarder le direct.
//
// On vérifie donc les deux moitiés du lien : le composant cite bien ces
// chemins, ET ces chemins existent sur le disque.
//
// L'ORDRE DES SOURCES EST TESTÉ, lui aussi. La source d'origine est en HEVC,
// que le navigateur embarqué d'OBS ne décode pas ; le VP9 (WebM) y est toujours
// disponible. Le WebM doit donc être proposé EN PREMIER — inverser les deux
// ferait retomber OBS sur un format qu'il pourrait refuser, pour le même
// résultat invisible.

import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';

import TcgAnnouncement from '../../components/overlay/TcgAnnouncement';
import { DEFAULT_OVERLAY_THEME } from '../../utils/tcg/overlayThemeShape';

const labels = {
  dropEyebrow: 'Drop Twitch',
  winEyebrow: 'Victoire',
  dropLine: '{name} a gagné une carte',
  winLine: '{name} a gagné un paquet',
  anonymous: 'une viewer',
};

function render() {
  return renderToString(
    React.createElement(TcgAnnouncement, {
      item: { kind: 'twitch_drop' as const, twitchLogin: 'marina' },
      theme: DEFAULT_OVERLAY_THEME,
      labels,
    })
  );
}

describe('habillage « pulse » de l’annonce TCG', () => {
  const html = render();

  it('cite les deux encodages, WebM en premier', () => {
    const webm = html.indexOf('/overlay/tcg/pulse-horizontal.webm');
    const mp4 = html.indexOf('/overlay/tcg/pulse-horizontal.mp4');

    expect(webm).toBeGreaterThan(-1);
    expect(mp4).toBeGreaterThan(-1);
    // Le premier lu gagne : WebM/VP9 est le seul des deux dont le navigateur
    // embarqué d'OBS est certain de disposer.
    expect(webm).toBeLessThan(mp4);
  });

  it('sert réellement les deux fichiers depuis public/', () => {
    for (const file of ['pulse-horizontal.webm', 'pulse-horizontal.mp4']) {
      const path = resolve(__dirname, '../../public/overlay/tcg', file);
      expect(existsSync(path), `${file} manquant dans public/overlay/tcg`).toBe(
        true
      );
    }
  });

  it('joue sans son, sans boucle et sans interaction', () => {
    // Une source OBS ne reçoit aucun clic : sans `autoPlay muted`, la vidéo
    // resterait figée sur sa première image. Et le motif dure 0,4 s — en
    // boucle, il clignoterait derrière le texte toutes les 400 ms.
    // Insensible à la casse : React rend `autoPlay=""` tel quel, et HTML ne
    // distingue pas la casse des noms d'attributs.
    expect(html).toMatch(/<video[^>]*\bautoplay\b/i);
    expect(html).toMatch(/<video[^>]*\bmuted\b/i);
    expect(html).toMatch(/<video[^>]*\bplaysinline\b/i);
    expect(html).not.toMatch(/<video[^>]*\bloop\b/i);
  });

  it('laisse le texte au centre, au-dessus du FX', () => {
    // La phrase reste rendue en TEXTE (jamais en HTML) et n'est pas masquée par
    // l'habillage : c'est elle qui porte l'information.
    expect(html).toContain('marina a gagné une carte');
    expect(html).toContain('text-center');
  });
});
