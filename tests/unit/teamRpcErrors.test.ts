// Unit tests for utils/teams/rpcErrors.ts — the shared mapper that translates
// errors raised by the transactional team RPCs (approve_join_request,
// approve_transfer_request, accept_invitation) into { status, error }.
//
// Order matters: Postgres constraint codes (23505 / 23514) are checked BEFORE
// the message sentinels, per the RPC contract.

import { describe, it, expect } from 'vitest';
import { mapTeamRpcError } from '../../utils/teams/rpcErrors';

describe('mapTeamRpcError', () => {
  it('23505 (unique_violation) → 409 already in a team', () => {
    const r = mapTeamRpcError({ code: '23505', message: 'duplicate key' });
    expect(r.status).toBe(409);
  });

  it('23514 (check/trigger max_players) → 400', () => {
    const r = mapTeamRpcError({ code: '23514', message: 'max_players' });
    expect(r.status).toBe(400);
  });

  it('demande_not_found → 404', () => {
    const r = mapTeamRpcError({ message: 'demande_not_found' });
    expect(r.status).toBe(404);
  });

  it('demande_wrong_type → 400', () => {
    const r = mapTeamRpcError({ message: 'demande_wrong_type' });
    expect(r.status).toBe(400);
  });

  it('demande_not_pending → 409', () => {
    const r = mapTeamRpcError({ message: 'demande_not_pending' });
    expect(r.status).toBe(409);
  });

  it('demande_no_team → 409', () => {
    const r = mapTeamRpcError({ message: 'demande_no_team' });
    expect(r.status).toBe(409);
  });

  it('not_owner → 403', () => {
    const r = mapTeamRpcError({ message: 'not_owner' });
    expect(r.status).toBe(403);
  });

  it('unknown error → 500', () => {
    const r = mapTeamRpcError({ message: 'something unexpected' });
    expect(r.status).toBe(500);
  });

  it('constraint code takes precedence over message', () => {
    // A 23505 with an unrelated message must still map to 409, not the message.
    const r = mapTeamRpcError({ code: '23505', message: 'demande_not_found' });
    expect(r.status).toBe(409);
  });
});
