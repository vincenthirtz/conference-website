// `GET /api/bot/v1/twitch/live?channels=` — les logins demandés nommément.
//
// POURQUOI CE PARAMÈTRE EXISTE. Notre propre chaîne n'est pas dans
// `twitch_channels` : cette table alimente les listes publiques de chaînes
// partenaires (/association, /live), et s'y ajouter nous ferait figurer parmi
// nos propres ambassadrices. Le bot la demande donc explicitement, pour
// l'annoncer dans son salon à lui.
//
// CE QUI MÉRITE UN TEST : ce qui part chez Helix. Un login est repris tel quel
// dans l'appel `helix/streams`, donc le filtre d'entrée est la seule barrière
// entre une query publique et un tiers.

import { describe, it, expect } from 'vitest';
import { parseChannelsParam } from '@/pages/api/bot/v1/twitch/live';

describe('parseChannelsParam', () => {
  it('distingue « rien demandé » de « demandé, mais vide »', () => {
    // `null` = lis la table ; `[]` = l'appelant a demandé des chaînes, aucune
    // n'était valide. Les confondre ferait répondre la liste des ambassadrices
    // à qui demandait une chaîne précise.
    expect(parseChannelsParam(undefined)).toBeNull();
    expect(parseChannelsParam('')).toEqual([]);
    expect(parseChannelsParam('!!!')).toEqual([]);
  });

  it('accepte une liste séparée par des virgules, normalisée', () => {
    expect(parseChannelsParam('Womens_Cup, aru ,NOVA')).toEqual([
      'womens_cup',
      'aru',
      'nova',
    ]);
  });

  it('dédoublonne, quelle que soit la casse', () => {
    expect(parseChannelsParam('aru,ARU,aru')).toEqual(['aru']);
  });

  it('écarte ce qui n’est pas un login Twitch', () => {
    // Espaces, tirets, points, chemins : rien de tout ça ne doit partir chez
    // Helix.
    expect(
      parseChannelsParam('aru,bad name,bad-name,bad.name,../etc/passwd')
    ).toEqual(['aru']);
    // 26 caractères : au-delà de la limite Twitch.
    expect(parseChannelsParam('a'.repeat(26))).toEqual([]);
    expect(parseChannelsParam('a'.repeat(25))).toEqual(['a'.repeat(25)]);
  });

  it('plafonne le nombre de chaînes demandées', () => {
    const many = Array.from({ length: 50 }, (_, i) => `chan${i}`).join(',');
    expect(parseChannelsParam(many)).toHaveLength(20);
  });

  it('accepte aussi le paramètre répété', () => {
    expect(parseChannelsParam(['aru', 'nova,mei'])).toEqual([
      'aru',
      'nova',
      'mei',
    ]);
  });
});
