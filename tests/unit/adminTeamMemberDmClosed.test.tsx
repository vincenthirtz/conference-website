// @vitest-environment happy-dom
//
// Roster admin (lot 3) : « MP fermés » sur la ligne d'une personne dont
// Discord refuse les messages privés (`discordDmClosedAt`, contrat C5), avec
// la date en info-bulle. Champ absent (API pas encore déployée) : rien.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import nsAdminTeamDetail from '@/lib/i18n/locales/admin-fr/adminTeamDetail';
import MemberDmClosedChip, {
  dmClosedAt,
} from '@/features/admin/teams/ui/MemberDmClosedChip';

const t = nsAdminTeamDetail.fr;

afterEach(cleanup);

describe('MemberDmClosedChip', () => {
  it('affiche le badge daté, avec l’explication en info-bulle', () => {
    render(
      <MemberDmClosedChip
        member={{ id: 'm1', discordDmClosedAt: '2026-11-03T21:15:00Z' }}
      />
    );
    const chip = screen.getByTestId('member-dm-closed');
    expect(chip.textContent).toContain('MP fermés');
    expect(chip.textContent).toContain('2026');
    expect(chip.getAttribute('title')).toMatch(
      /^Discord refuse les messages privés de cette personne depuis le /
    );
    expect(t.dmClosedTitle).toContain('{date}');
  });

  it('ne rend rien sans le champ, ou à null', () => {
    const { container, rerender } = render(
      <MemberDmClosedChip member={{ id: 'm1' }} />
    );
    expect(container.textContent).toBe('');
    rerender(
      <MemberDmClosedChip member={{ id: 'm1', discordDmClosedAt: null }} />
    );
    expect(container.textContent).toBe('');
  });

  it('dmClosedAt ignore les valeurs vides ou non textuelles', () => {
    expect(dmClosedAt({ discordDmClosedAt: '' })).toBeNull();
    expect(dmClosedAt({ discordDmClosedAt: 42 })).toBeNull();
    expect(dmClosedAt({ discordDmClosedAt: '2026-11-03' })).toBe('2026-11-03');
  });
});
