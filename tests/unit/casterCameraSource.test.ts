import { describe, expect, it } from 'vitest';

import {
  detectCameraSource,
  isSupportedCameraSource,
} from '@/utils/caster/cameraSource';

describe('detectCameraSource — VDO.Ninja (temps réel)', () => {
  it('reconnaît une URL view et force cleanoutput', () => {
    const s = detectCameraSource('https://vdo.ninja/?view=cam1&bitrate=6000');
    expect(s.kind).toBe('vdoninja');
    expect(s.isFrame).toBe(true);
    expect(s.latency).toBe('sub-second');
    expect(s.url).toContain('view=cam1');
    expect(s.url).toContain('bitrate=6000');
    expect(s.url).toContain('cleanoutput=1');
  });

  it('respecte un cleanoutput déjà présent', () => {
    const s = detectCameraSource('https://vdo.ninja/?view=x&cleanoutput=0');
    expect(s.url).toContain('cleanoutput=0');
    expect(s.url).not.toContain('cleanoutput=1');
  });

  it('accepte les sous-domaines', () => {
    expect(detectCameraSource('https://backup.vdo.ninja/?view=x').kind).toBe(
      'vdoninja'
    );
  });
});

describe('detectCameraSource — Twitch', () => {
  it('transforme une URL de chaîne en URL de player avec parent', () => {
    const s = detectCameraSource(
      'https://twitch.tv/womens_cup',
      'owwomenscup.fr'
    );
    expect(s.kind).toBe('twitch');
    expect(s.isFrame).toBe(true);
    expect(s.url).toContain('player.twitch.tv');
    expect(s.url).toContain('channel=womens_cup');
    expect(s.url).toContain('parent=owwomenscup.fr');
    // Muet : l'audio du programme vient d'OBS, pas de l'iframe.
    expect(s.url).toContain('muted=true');
    expect(s.url).toContain('autoplay=true');
  });

  it('utilise le hostname fourni pour parent (localhost en dev)', () => {
    const s = detectCameraSource('twitch.tv/abc', 'localhost');
    expect(s.url).toContain('parent=localhost');
  });

  it('complète une URL de player déjà formée', () => {
    const s = detectCameraSource(
      'https://player.twitch.tv/?channel=abc',
      'localhost'
    );
    expect(s.kind).toBe('twitch');
    expect(s.url).toContain('channel=abc');
    expect(s.url).toContain('parent=localhost');
  });

  it('rejette les chemins qui ne sont pas une chaîne', () => {
    expect(detectCameraSource('https://twitch.tv/videos/12345').kind).toBe(
      'unknown'
    );
    expect(detectCameraSource('https://twitch.tv/directory/game/x').kind).toBe(
      'unknown'
    );
    expect(detectCameraSource('https://twitch.tv/').kind).toBe('unknown');
  });

  it('accepte une URL popout en extrayant la chaîne', () => {
    const s = detectCameraSource('https://twitch.tv/popout/abc/chat');
    expect(s.kind).toBe('twitch');
    expect(s.url).toContain('channel=abc');
  });
});

describe('detectCameraSource — YouTube', () => {
  it('watch?v= → /embed/ID muet et sans contrôles', () => {
    const s = detectCameraSource('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(s.kind).toBe('youtube');
    expect(s.url).toContain('/embed/dQw4w9WgXcQ');
    expect(s.url).toContain('mute=1');
    expect(s.url).toContain('autoplay=1');
    expect(s.url).toContain('controls=0');
  });

  it('accepte youtu.be, /live/ et /embed/', () => {
    expect(detectCameraSource('https://youtu.be/ABC123').url).toContain(
      '/embed/ABC123'
    );
    expect(detectCameraSource('https://youtube.com/live/LIVE99').url).toContain(
      '/embed/LIVE99'
    );
    expect(
      detectCameraSource('https://www.youtube.com/embed/EMB77').url
    ).toContain('/embed/EMB77');
  });

  it('rejette une URL YouTube sans identifiant', () => {
    expect(detectCameraSource('https://www.youtube.com/').kind).toBe('unknown');
  });
});

describe('detectCameraSource — flux et fichiers directs', () => {
  it('.m3u8 → HLS en <video>', () => {
    const s = detectCameraSource('https://captation.test/live/cam1.m3u8');
    expect(s.kind).toBe('hls');
    expect(s.isFrame).toBe(false);
    expect(s.latency).toBe('high');
    expect(s.url).toBe('https://captation.test/live/cam1.m3u8');
  });

  it('mp4 / webm / mov → fichier en <video>', () => {
    for (const ext of ['mp4', 'webm', 'mov', 'm4v']) {
      const s = detectCameraSource(`https://captation.test/cam.${ext}`);
      expect(s.kind, ext).toBe('file');
      expect(s.isFrame).toBe(false);
      expect(s.latency).toBe('low');
    }
  });

  it('insensible à la casse de l’extension', () => {
    expect(detectCameraSource('https://x.test/CAM.MP4').kind).toBe('file');
    expect(detectCameraSource('https://x.test/LIVE.M3U8').kind).toBe('hls');
  });

  it('ignore une query string après l’extension', () => {
    expect(detectCameraSource('https://x.test/live.m3u8?token=abc').kind).toBe(
      'hls'
    );
  });
});

describe('detectCameraSource — saisies imparfaites et inconnues', () => {
  it('ajoute le schéma manquant', () => {
    expect(detectCameraSource('twitch.tv/abc').kind).toBe('twitch');
    expect(detectCameraSource('vdo.ninja/?view=x').kind).toBe('vdoninja');
    expect(detectCameraSource('//x.test/c.mp4').kind).toBe('file');
  });

  it('tolère les espaces autour', () => {
    expect(detectCameraSource('  https://vdo.ninja/?view=x  ').kind).toBe(
      'vdoninja'
    );
  });

  it('rend unknown sur vide, non-URL ou host non géré', () => {
    for (const raw of [
      '',
      '   ',
      'pas une url du tout !',
      'https://exemple.test/live',
    ]) {
      expect(detectCameraSource(raw).kind, raw).toBe('unknown');
    }
  });
});

describe('isSupportedCameraSource', () => {
  it('reflète la détection', () => {
    expect(isSupportedCameraSource('https://vdo.ninja/?view=x')).toBe(true);
    expect(isSupportedCameraSource('https://exemple.test/rien')).toBe(false);
    expect(isSupportedCameraSource('')).toBe(false);
  });
});
