// Offre partenaire des circuits féminins et mixtes — les pages /organisateurs/*.
//
// LES PAGES N'ANNONCENT QUE CE QUE LE CODE FAIT : lignes d'offre et palier
// d'arbitrage dérivés du barème (`utils/billing/planFeatures`), jeux du
// registre (`config/games`), durée de l'offre (`config/circuitPartnerOffer`).
// Ces trois modules sont partagés avec conference-api, où la candidature et
// l'accord du plan sont testés (tests/unit/circuitPartners.routes.test.ts).

import { describe, it, expect } from 'vitest';

import { CIRCUIT_PARTNER_OFFER } from '../../config/circuitPartnerOffer';
import { getPlanFeatures, PLAN_LABELS } from '../../utils/billing/planFeatures';
import { GAME_SLUGS } from '../../config/games';
import { getStaticProps as guideProps } from '../../pages/organisateurs/tournoi-feminin-ou-mixte';
import { getStaticProps as circuitsProps } from '../../pages/organisateurs/circuits-feminins';

describe('les pages n’annoncent que ce que le code fait', () => {
  it('guide : les jeux du registre et le premier palier qui ouvre l’arbitrage', async () => {
    const result = (await guideProps({} as any)) as any;
    expect(result.props.games.map((g: any) => g.slug)).toEqual([...GAME_SLUGS]);
    const sold = ['discovery', 'regie', 'circuit', 'editor'] as const;
    const first = sold.find((plan) => getPlanFeatures(plan).arbitration);
    expect(result.props.arbitrationPlan).toBe(PLAN_LABELS[first!]);
  });

  it('offre circuits : une ligne par capacité réellement ouverte par le plan', async () => {
    const result = (await circuitsProps({} as any)) as any;
    const f = getPlanFeatures(CIRCUIT_PARTNER_OFFER.plan);
    expect(result.props.months).toBe(CIRCUIT_PARTNER_OFFER.months);
    expect(result.props.offerLines.includes('offerBot')).toBe(f.discordBot);
    expect(result.props.offerLines.includes('offerApi')).toBe(
      f.apiRead && f.apiWrite
    );
    expect(result.props.offerLines.includes('offerBrand')).toBe(f.whiteLabel);
  });
});
