// Incitation à vérifier son compte Battle.net : la promesse sur la carte, la
// confirmation au retour d'OAuth.
// Target: utils/tcg/battlenetRewardDisplay.ts (logique de la carte
//         `BattlenetVerifyCard`), GET /api/player/battlenet-status (`reward`).
//
// CE QUE CES CAS PROTÈGENT.
//
//   1. LE MONTANT VIENT DE L'API, QUI LE LIT DANS LE REGISTRE. La carte n'écrit
//      aucun nombre, et n'importe pas le registre (qui entraînerait le moteur de
//      rating dans le bundle) : on le vérifie sur son source.
//   2. ON NE PROMET PAS CE QUI NE SERA PAS TENU : compte déjà lié, récompense
//      déjà reçue, registre illisible → aucune phrase.
//   3. LE « +N PIÈCES » EXIGE LE PARAMÈTRE EXACT posé par le callback, et un
//      montant rendu par l'API.
//
// Rendre le composant demanderait un routeur et une bibliothèque DOM que la
// politique zéro dépendance interdit : la logique de rendu est donc extraite
// en fonctions pures, et c'est elle qui est testée.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  TCG_REWARD_BATTLENET,
  TCG_REWARD_QUERY_PARAM,
  creditedRewardCoins,
  normalizeRewardOffer,
  rewardHintCoins,
  withBattlenetRewardParam,
} from '../../utils/tcg/battlenetRewardDisplay';
import { BATTLENET_VERIFIED_COINS } from '../../utils/tcg/earnSources';
import { format } from '../../lib/i18n/useT';
import frVerify from '../../lib/i18n/locales/fr/battlenetVerify';
import enVerify from '../../lib/i18n/locales/en/battlenetVerify';

const offer = (claimable: boolean) => ({
  coins: BATTLENET_VERIFIED_COINS,
  claimable,
});

describe('la phrase de la carte', () => {
  const unlinked = {
    configured: true,
    linked: false,
    reward: offer(true),
  };

  it('annonce le montant de l’API à qui n’a pas encore vérifié', () => {
    expect(rewardHintCoins(unlinked)).toBe(BATTLENET_VERIFIED_COINS);
    // Et le texte l'interpole, dans les deux langues.
    expect(format(frVerify.fr.rewardHint, { coins: 100 })).toContain('100');
    expect(format(enVerify.rewardHint, { coins: 100 })).toContain('100');
  });

  it('se tait si déjà lié, déjà reçue, non activée ou feature dormante', () => {
    expect(rewardHintCoins({ ...unlinked, linked: true })).toBeNull();
    expect(rewardHintCoins({ ...unlinked, reward: offer(false) })).toBeNull();
    expect(rewardHintCoins({ ...unlinked, reward: null })).toBeNull();
    // API plus ancienne, sans le champ.
    expect(rewardHintCoins({ configured: true, linked: false })).toBeNull();
    expect(rewardHintCoins({ ...unlinked, configured: false })).toBeNull();
    expect(rewardHintCoins(null)).toBeNull();
  });

  it('refuse un montant aberrant plutôt que de l’afficher', () => {
    expect(normalizeRewardOffer({ coins: 0, claimable: true })).toBeNull();
    expect(normalizeRewardOffer({ coins: 1.5, claimable: true })).toBeNull();
    expect(normalizeRewardOffer({ coins: '100', claimable: true })).toBeNull();
    expect(normalizeRewardOffer({ coins: 100 })).toBeNull();
  });

  it('n’écrit aucun montant et n’importe pas le registre côté client', () => {
    const source = readFileSync(
      path.resolve(
        __dirname,
        '../../components/player/BattlenetVerifyCard.tsx'
      ),
      'utf8'
    );
    expect(source).not.toMatch(/earnSources|economy|grantBattlenetVerified/);
    expect(source).toContain('rewardHintCoins');
    expect(source).not.toContain(String(BATTLENET_VERIFIED_COINS));
  });
});

describe('le retour d’OAuth', () => {
  it('pose le paramètre de façon additive', () => {
    expect(withBattlenetRewardParam('/player/profile?battlenet=verified')).toBe(
      '/player/profile?battlenet=verified&tcg=battlenet_reward'
    );
    expect(withBattlenetRewardParam('/x')).toBe('/x?tcg=battlenet_reward');
    expect(`${TCG_REWARD_QUERY_PARAM}=${TCG_REWARD_BATTLENET}`).toBe(
      'tcg=battlenet_reward'
    );
  });

  it('confirme « +N pièces » seulement avec le paramètre exact et un montant d’API', () => {
    const status = { configured: true, linked: true, reward: offer(false) };
    // Déjà reçue (c'est le cas juste après le crédit) : le montant reste connu.
    expect(creditedRewardCoins('battlenet_reward', status)).toBe(
      BATTLENET_VERIFIED_COINS
    );
    expect(creditedRewardCoins(undefined, status)).toBeNull();
    expect(creditedRewardCoins('other', status)).toBeNull();
    expect(creditedRewardCoins(['battlenet_reward'], status)).toBeNull();
    expect(
      creditedRewardCoins('battlenet_reward', { ...status, reward: null })
    ).toBeNull();
    expect(format(frVerify.fr.toastRewardCredited, { coins: 100 })).toContain(
      '+100'
    );
  });
});
