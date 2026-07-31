// utils/botPlayerLogs — audit trail des actions joueuses côté bot.
//
// `bot_player_actions.tenant_id` est NOT NULL sans default en base. Comme
// l'audit est fire-and-forget (erreur loggée, jamais throw), un payload sans
// tenant partait en 23502 SANS que l'appelant ne s'en aperçoive : la table
// restait vide en silence. Ce spec verrouille la présence du tenant.

import { describe, it, expect, beforeEach } from 'vitest';

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import { logPlayerAction } from '../../utils/botPlayerLogs';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

beforeEach(() => {
  resetSupabaseMock();
});

describe('logPlayerAction', () => {
  it('stamps tenant_id on the inserted row', async () => {
    await logPlayerAction({
      tenantId: TENANT,
      actorAuthUserId: 'user-1',
      actorDiscordUserId: '1234567890',
      action: 'create_team',
      entityType: 'team',
      entityId: 'team-1',
    });

    const rows = (store.bot_player_actions || []) as any[];
    expect(rows.length).toBe(1);
    expect(rows[0].tenant_id).toBe(TENANT);
    expect(rows[0].actor_auth_user_id).toBe('user-1');
    expect(rows[0].action).toBe('create_team');
  });

  it('defaults the optional fields to null', async () => {
    await logPlayerAction({
      tenantId: TENANT,
      actorAuthUserId: 'user-2',
      actorDiscordUserId: '999',
      action: 'leave_team',
    });

    const row = (store.bot_player_actions as any[])[0];
    expect(row.entity_type).toBeNull();
    expect(row.entity_id).toBeNull();
    expect(row.target_auth_user_id).toBeNull();
    expect(row.payload).toBeNull();
  });
});
