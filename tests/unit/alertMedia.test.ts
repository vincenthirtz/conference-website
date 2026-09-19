// Les fichiers de la boîte d'alertes : lequel sert, et ce que « rien » veut dire.
//
// CE QUI MÉRITE UN TEST ICI, ce sont deux règles qui ne se lisent pas dans les
// types :
//   1. `null` pour l'habillage ne veut PAS dire « aucun habillage » mais
//      « celui du code » — le nœud animé. Confondre les deux laisserait un
//      écran vide en direct au lieu de rétablir le défaut, et c'est exactement
//      ce qu'on risque en « nettoyant » un jour ce module.
//   2. Le fichier DÉPOSÉ prime sur l'URL collée. L'inverse ferait qu'un dépôt
//      reste sans effet tant qu'une vieille URL traîne dans le champ, sans que
//      rien ne l'explique.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Le client Supabase est mocké : on teste une décision, pas un bucket.
const { getPublicUrl } = vi.hoisted(() => ({
  getPublicUrl: vi.fn((path: string) => ({
    data: { publicUrl: `https://cdn.test/${path}` },
  })),
}));
vi.mock('@/utils/supabase', () => ({
  supabaseAdmin: { storage: { from: () => ({ getPublicUrl }) } },
}));

import {
  alertMediaPath,
  alertMediaUrl,
  isAlertFrameKind,
  resolveAlertFrame,
  resolveAlertSoundUrl,
} from '@/utils/overlay/alertMedia';

beforeEach(() => {
  getPublicUrl.mockClear();
});

describe('resolveAlertFrame', () => {
  it('rend l’habillage déposé, avec sa nature', () => {
    expect(
      resolveAlertFrame({
        frame_path: 'stream-alerts/t-abc.png',
        frame_kind: 'image',
      })
    ).toEqual({
      url: 'https://cdn.test/stream-alerts/t-abc.png',
      kind: 'image',
    });
  });

  it('sans dépôt, rend `null` — c’est-à-dire LE NŒUD', () => {
    // `null` = « l'habillage du code ». La source sait quoi en faire ; elle ne
    // doit surtout pas comprendre « n'affiche rien ».
    expect(resolveAlertFrame(null)).toEqual({ url: null, kind: null });
    expect(resolveAlertFrame({})).toEqual({ url: null, kind: null });
  });

  it('ignore un chemin dont la nature est inexploitable', () => {
    // Un habillage à moitié configuré (chemin sans `kind`, ou `kind` inconnu)
    // ne doit pas éteindre le défaut : la source ne saurait pas s'il faut un
    // <img> ou une <video>, et rendrait un cadre vide.
    expect(
      resolveAlertFrame({
        frame_path: 'stream-alerts/t-abc.png',
        frame_kind: null,
      })
    ).toEqual({ url: null, kind: null });
    expect(
      resolveAlertFrame({
        frame_path: 'stream-alerts/t-abc.bin',
        frame_kind: 'hologramme',
      })
    ).toEqual({ url: null, kind: null });
  });
});

describe('resolveAlertSoundUrl', () => {
  it('le fichier DÉPOSÉ prime sur l’URL collée', () => {
    expect(
      resolveAlertSoundUrl({
        sound_path: 'stream-alerts/t-abc.mp3',
        sound_url: 'https://ailleurs.test/vieux.mp3',
      })
    ).toBe('https://cdn.test/stream-alerts/t-abc.mp3');
  });

  it('retirer le fichier fait retomber sur l’URL', () => {
    expect(
      resolveAlertSoundUrl({
        sound_path: null,
        sound_url: 'https://ailleurs.test/son.mp3',
      })
    ).toBe('https://ailleurs.test/son.mp3');
  });

  it('sans rien, la boîte est MUETTE', () => {
    // Le défaut : une source qui se met à faire du bruit toute seule dans une
    // régie est un incident.
    expect(resolveAlertSoundUrl({})).toBeNull();
    expect(resolveAlertSoundUrl(null)).toBeNull();
  });
});

describe('alertMediaUrl / alertMediaPath', () => {
  it('un chemin vide reste vide, sans appeler le stockage', () => {
    expect(alertMediaUrl(null)).toBeNull();
    expect(alertMediaUrl('')).toBeNull();
    expect(getPublicUrl).not.toHaveBeenCalled();
  });

  it('range les dépôts sous un préfixe, un fichier par envoi', () => {
    // Un chemin par dépôt : on n'écrase jamais un fichier encore référencé.
    const a = alertMediaPath('tenant-1', 'aaaa', '.png');
    const b = alertMediaPath('tenant-1', 'bbbb', '.png');
    expect(a).toBe('stream-alerts/tenant-1-aaaa.png');
    expect(a).not.toBe(b);
  });
});

describe('isAlertFrameKind', () => {
  it('ne laisse passer que ce que la source sait rendre', () => {
    expect(isAlertFrameKind('image')).toBe(true);
    expect(isAlertFrameKind('video')).toBe(true);
    expect(isAlertFrameKind('audio')).toBe(false);
    expect(isAlertFrameKind(null)).toBe(false);
  });
});
