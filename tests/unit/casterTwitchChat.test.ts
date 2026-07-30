import { describe, expect, it } from 'vitest';

import {
  anonymousNick,
  buildCheerEvent,
  buildUsernoticeEvent,
  formatChatMessage,
  parseTwitchMessage,
  subPlanLabel,
} from '@/utils/caster/twitchProtocol';
import {
  buildTally,
  normalizeCandidates,
  parseVoteCommand,
  pruneOrphanVotes,
  resolveVoteTarget,
} from '@/utils/caster/mvpTally';

describe('parseTwitchMessage', () => {
  it('parse tags + prefix + command + trailing param', () => {
    const raw =
      '@badges=moderator/1;color=#00FF00;display-name=Alpha;id=abc :alpha!alpha@alpha.tmi.twitch.tv PRIVMSG #womens_cup :salut le chat !';
    const p = parseTwitchMessage(raw);
    expect(p.tags['display-name']).toBe('Alpha');
    expect(p.tags.badges).toBe('moderator/1');
    expect(p.prefix).toBe('alpha!alpha@alpha.tmi.twitch.tv');
    expect(p.command).toBe('PRIVMSG');
    expect(p.params[0]).toBe('#womens_cup');
    expect(p.params[1]).toBe('salut le chat !');
  });

  it('parse une ligne sans tags (PING)', () => {
    const p = parseTwitchMessage('PING :tmi.twitch.tv');
    expect(p.command).toBe('PING');
    expect(p.params[0]).toBe('tmi.twitch.tv');
    expect(p.tags).toEqual({});
  });

  it('conserve les deux-points internes du message', () => {
    const p = parseTwitchMessage(
      ':a!a@a PRIVMSG #c :lien : https://x.test/a:b'
    );
    expect(p.params[1]).toBe('lien : https://x.test/a:b');
  });
});

describe('formatChatMessage', () => {
  it('projette les badges en drapeaux', () => {
    const msg = formatChatMessage(
      parseTwitchMessage(
        '@badges=broadcaster/1,subscriber/12;color=;display-name=Boss;id=1 :boss!boss@boss PRIVMSG #c :hello'
      )
    );
    expect(msg.displayName).toBe('Boss');
    expect(msg.isBroadcaster).toBe(true);
    expect(msg.isMod).toBe(true); // broadcaster ⇒ modération
    expect(msg.isSub).toBe(true);
    expect(msg.isVip).toBe(false);
    expect(msg.color).toBe('#ffffff'); // couleur vide → défaut
    expect(msg.message).toBe('hello');
  });

  it('retombe sur le nick quand display-name est absent', () => {
    const msg = formatChatMessage(
      parseTwitchMessage(':nick!nick@nick PRIVMSG #c :yo')
    );
    expect(msg.displayName).toBe('nick');
    expect(msg.nick).toBe('nick');
  });
});

describe('subPlanLabel', () => {
  it('mappe les paliers', () => {
    expect(subPlanLabel('Prime')).toBe('Prime');
    expect(subPlanLabel('2000')).toBe('2');
    expect(subPlanLabel('3000')).toBe('3');
    expect(subPlanLabel('1000')).toBe('1');
    expect(subPlanLabel(undefined)).toBe('1');
  });
});

describe('buildUsernoticeEvent', () => {
  it('resub avec palier et mois cumulés', () => {
    const e = buildUsernoticeEvent(
      parseTwitchMessage(
        '@msg-id=resub;display-name=Ana;msg-param-sub-plan=2000;msg-param-cumulative-months=7;system-msg=Ana\\sresubbed! :tmi.twitch.tv USERNOTICE #c :gg'
      )
    );
    expect(e.kind).toBe('resub');
    expect(e.tier).toBe('2');
    expect(e.months).toBe(7);
    expect(e.systemMsg).toBe('Ana resubbed!');
    expect(e.message).toBe('gg');
  });

  it('subgift simple et mystery gift', () => {
    const gift = buildUsernoticeEvent(
      parseTwitchMessage(
        '@msg-id=subgift;display-name=Ana;msg-param-sub-plan=1000;msg-param-recipient-display-name=Bea :tmi.twitch.tv USERNOTICE #c'
      )
    );
    expect(gift.kind).toBe('subgift');
    expect(gift.recipient).toBe('Bea');
    expect(gift.giftCount).toBe(1);

    const mystery = buildUsernoticeEvent(
      parseTwitchMessage(
        '@msg-id=submysterygift;display-name=Ana;msg-param-mass-gift-count=5 :tmi.twitch.tv USERNOTICE #c'
      )
    );
    expect(mystery.kind).toBe('subgift');
    expect(mystery.giftCount).toBe(5);
  });

  it('raid avec le compte de viewers', () => {
    const e = buildUsernoticeEvent(
      parseTwitchMessage(
        '@msg-id=raid;display-name=Ana;msg-param-displayName=AnaTV;msg-param-viewerCount=42 :tmi.twitch.tv USERNOTICE #c'
      )
    );
    expect(e.kind).toBe('raid');
    expect(e.displayName).toBe('AnaTV');
    expect(e.viewers).toBe(42);
  });

  it('msg-id inconnu → other en portant system-msg', () => {
    const e = buildUsernoticeEvent(
      parseTwitchMessage(
        '@msg-id=viewermilestone;display-name=Ana;system-msg=Milestone! :tmi.twitch.tv USERNOTICE #c'
      )
    );
    expect(e.kind).toBe('other');
    expect(e.systemMsg).toBe('Milestone!');
  });
});

describe('buildCheerEvent', () => {
  it('construit un cheer quand des bits sont présents', () => {
    const e = buildCheerEvent(
      parseTwitchMessage(
        '@bits=100;display-name=Ana :ana!ana@ana PRIVMSG #c :Cheer100 bravo'
      )
    );
    expect(e).not.toBeNull();
    expect(e!.kind).toBe('cheer');
    expect(e!.bits).toBe(100);
    expect(e!.message).toBe('Cheer100 bravo');
  });

  it('null sans bits', () => {
    expect(
      buildCheerEvent(parseTwitchMessage(':ana!ana@ana PRIVMSG #c :coucou'))
    ).toBeNull();
  });
});

describe('anonymousNick', () => {
  it('produit un nick justinfan de lecture seule', () => {
    expect(anonymousNick(1234)).toBe('justinfan1234');
    expect(anonymousNick()).toMatch(/^justinfan\d+$/);
  });
});

describe('MVP — candidats et votes', () => {
  it('normalizeCandidates accepte label ou name et ignore les vides', () => {
    expect(
      normalizeCandidates([
        { id: 'a', label: 'Alpha' },
        { name: 'Bravo' },
        { label: '   ' },
        null,
      ])
    ).toEqual([
      { id: 'a', label: 'Alpha' },
      { id: '2', label: 'Bravo' },
    ]);
    expect(normalizeCandidates(null)).toEqual([]);
  });

  it('resolveVoteTarget par index 1-based puis par sous-chaîne', () => {
    const list = [
      { id: '1', label: 'Alpha' },
      { id: '2', label: 'Bravo' },
    ];
    expect(resolveVoteTarget(list, '2')).toEqual(list[1]);
    expect(resolveVoteTarget(list, 'alph')).toEqual(list[0]);
    expect(resolveVoteTarget(list, '9')).toBeNull();
    expect(resolveVoteTarget(list, '')).toBeNull();
  });

  it('buildTally compte, calcule les pourcentages et le leader', () => {
    const list = [
      { id: '1', label: 'Alpha' },
      { id: '2', label: 'Bravo' },
    ];
    const votes = new Map([
      ['u1', '1'],
      ['u2', '1'],
      ['u3', '2'],
    ]);
    const tally = buildTally(list, votes);
    expect(tally.total).toBe(3);
    expect(tally.leaderId).toBe('1');
    expect(tally.candidates[0]).toEqual({
      id: '1',
      label: 'Alpha',
      count: 2,
      percent: 67,
    });
    expect(tally.candidates[1].percent).toBe(33);
  });

  it('buildTally sans vote → 0 % et pas de leader', () => {
    const tally = buildTally([{ id: '1', label: 'Alpha' }], new Map());
    expect(tally.total).toBe(0);
    expect(tally.leaderId).toBeNull();
    expect(tally.candidates[0].percent).toBe(0);
  });

  it('pruneOrphanVotes retire les votes de candidats disparus', () => {
    const votes = new Map([
      ['u1', '1'],
      ['u2', 'disparu'],
    ]);
    pruneOrphanVotes(votes, [{ id: '1', label: 'Alpha' }]);
    expect([...votes.keys()]).toEqual(['u1']);
  });

  it('parseVoteCommand reconnaît !vote et !mvp', () => {
    expect(parseVoteCommand('!vote 2')).toBe('2');
    expect(parseVoteCommand('!mvp  Alpha ')).toBe('Alpha');
    expect(parseVoteCommand('!VOTE alpha')).toBe('alpha');
    expect(parseVoteCommand('bonjour')).toBeNull();
    expect(parseVoteCommand('!vote')).toBeNull();
  });
});
