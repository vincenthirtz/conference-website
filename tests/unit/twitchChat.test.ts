// Envoi de message dans le chat d'une chaîne connectée.
// Target: utils/twitchChat.ts
//
// CE QUE CES CAS PROTÈGENT.
//
//   1. NE JAMAIS LEVER. Ce helper est appelé depuis le webhook de drop, dont
//      l'acquittement conditionne la survie de la souscription EventSub : une
//      exception ici ferait retenter Twitch, puis désactiver le canal. Le pire
//      cas acceptable est le silence.
//
//   2. DIRE POURQUOI ÇA N'EST PAS PARTI. `NOT_CONNECTED`, `MISSING_SCOPE` et
//      `FAILED` se distinguent : les deux premiers sont des états de
//      configuration qu'un humain peut corriger, le troisième une panne. Les
//      confondre rendrait le diagnostic impossible depuis les journaux.
//
//   3. NE PAS DÉPASSER LA LIMITE DE TWITCH. Au-delà de 500 caractères l'envoi
//      est rejeté ; on tronque plutôt que de perdre le message entier.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getTokenMock, helixFetchMock } = vi.hoisted(() => ({
  getTokenMock: vi.fn(),
  helixFetchMock: vi.fn(),
}));

vi.mock('@/utils/twitchBroadcaster', () => ({
  getValidBroadcasterToken: getTokenMock,
  helixFetch: helixFetchMock,
  hasScope: (scope: string[], required: string) => scope.includes(required),
}));

import {
  sendTwitchChatMessage,
  CHAT_WRITE_SCOPE,
} from '../../utils/twitchChat';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const admin = {} as never;

function tokenWith(scopes: string[]) {
  return { accessToken: 'tok', broadcasterId: 'bc-1', scope: scopes };
}

beforeEach(() => {
  getTokenMock.mockReset();
  helixFetchMock.mockReset();
});

describe('sendTwitchChatMessage', () => {
  it('envoie le message sous l’identité de la chaîne', async () => {
    // `sender_id` = le diffuseur : nous n'avons pas de compte de bot Twitch, et
    // en créer un demanderait une seconde identité à gérer.
    getTokenMock.mockResolvedValue(tokenWith([CHAT_WRITE_SCOPE]));
    helixFetchMock.mockResolvedValue({ ok: true });

    await expect(
      sendTwitchChatMessage(admin, TENANT, 'coucou')
    ).resolves.toEqual({ sent: true });

    const [, path, init] = helixFetchMock.mock.calls[0];
    expect(path).toBe('/chat/messages');
    const body = JSON.parse((init as { body: string }).body);
    expect(body.broadcaster_id).toBe('bc-1');
    expect(body.sender_id).toBe('bc-1');
    expect(body.message).toBe('coucou');
  });

  it('distingue « aucune chaîne connectée » d’une panne', async () => {
    getTokenMock.mockResolvedValue(null);
    await expect(sendTwitchChatMessage(admin, TENANT, 'x')).resolves.toEqual({
      sent: false,
      reason: 'NOT_CONNECTED',
    });
    expect(helixFetchMock).not.toHaveBeenCalled();
  });

  it('refuse sans le scope, sans appeler Twitch', async () => {
    getTokenMock.mockResolvedValue(tokenWith(['channel:read:redemptions']));
    await expect(sendTwitchChatMessage(admin, TENANT, 'x')).resolves.toEqual({
      sent: false,
      reason: 'MISSING_SCOPE',
    });
    expect(helixFetchMock).not.toHaveBeenCalled();
  });

  it('tronque à 500 caractères plutôt que de faire rejeter l’envoi', async () => {
    getTokenMock.mockResolvedValue(tokenWith([CHAT_WRITE_SCOPE]));
    helixFetchMock.mockResolvedValue({ ok: true });

    await sendTwitchChatMessage(admin, TENANT, 'a'.repeat(900));
    const body = JSON.parse(helixFetchMock.mock.calls[0][2].body);
    expect(body.message).toHaveLength(500);
  });

  it('refuse un message vide sans rien appeler', async () => {
    await expect(sendTwitchChatMessage(admin, TENANT, '   ')).resolves.toEqual({
      sent: false,
      reason: 'FAILED',
    });
    expect(getTokenMock).not.toHaveBeenCalled();
  });

  it('NE LÈVE JAMAIS, même si Twitch jette', async () => {
    // Le point vital : une exception ici remonterait dans le webhook, ferait
    // retenter Twitch, et finirait par désactiver la souscription EventSub.
    getTokenMock.mockResolvedValue(tokenWith([CHAT_WRITE_SCOPE]));
    helixFetchMock.mockRejectedValue(new Error('réseau coupé'));

    await expect(sendTwitchChatMessage(admin, TENANT, 'x')).resolves.toEqual({
      sent: false,
      reason: 'FAILED',
    });
  });

  it('ne lève pas non plus si la résolution du jeton jette', async () => {
    getTokenMock.mockRejectedValue(new Error('déchiffrement impossible'));
    await expect(sendTwitchChatMessage(admin, TENANT, 'x')).resolves.toEqual({
      sent: false,
      reason: 'FAILED',
    });
  });

  it('rend FAILED sur une réponse non-OK', async () => {
    getTokenMock.mockResolvedValue(tokenWith([CHAT_WRITE_SCOPE]));
    helixFetchMock.mockResolvedValue({ ok: false, status: 403 });
    await expect(sendTwitchChatMessage(admin, TENANT, 'x')).resolves.toEqual({
      sent: false,
      reason: 'FAILED',
    });
  });
});
