// features/player/messages/ui/MessagesScreen.tsx — messagerie entre
// capitaines sur l'archétype FIL (lot P15) : boîte de réception, nouvelle
// conversation (choix de l'équipe + premier message), fil d'une conversation.
//
// L'état et la mécanique de rafraîchissement (temps réel + relecture
// silencieuse, sans relevé périodique) vivent dans `useCaptainMessages`,
// inchangés. Lire est ouvert à qui gère l'équipe ; répondre exige
// `send_captain_messages` (sinon un rappel de périmètre, pas un champ mort).

import Head from 'next/head';
import Image from 'next/image';
import { useRouter } from 'next/router';
import TeamPicker from '@/components/player/TeamPicker';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useT } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import nsPlayerMessages from '@/lib/i18n/locales/fr/playerMessages';
import { loginHrefFor } from '@/utils/player/sessionExpiry';
import { isOptimizableImageUrl } from '@/utils/images/optimizableImage';
import {
  Button,
  ButtonLink,
  Card,
  rubanErrBox,
  rubanHelp,
  rubanSpinner,
  rubanStrong,
} from '@/features/ruban';
import { FilView } from '../../_shared/ui';
import { usePlayerErrorText } from '../../_shared/useErrorText';
import { useCaptainMessages } from '../hooks/useCaptainMessages';
import type { ConversationOtherTeam } from '../schemas';
import ComposeForm from './ComposeForm';
import ConversationThread from './ConversationThread';
import InboxList from './InboxList';

const LOGO =
  'h-6 w-6 rounded-full border border-[var(--line,rgba(194,196,201,.12))] object-cover';

/** Logo 24 px : `next/image` pour un hôte déclaré, `<img>` sinon. */
function TeamLogo({ team }: { team: ConversationOtherTeam }) {
  if (!team.logo_url) return null;
  return isOptimizableImageUrl(team.logo_url) ? (
    <Image src={team.logo_url} alt="" width={24} height={24} className={LOGO} />
  ) : (
    // biome-ignore lint/performance/noImgElement: hôte hors `remotePatterns`, `next/image` échouerait
    <img
      src={team.logo_url}
      alt=""
      width={24}
      height={24}
      decoding="async"
      className={LOGO}
    />
  );
}

export default function MessagesScreen() {
  const router = useRouter();
  const t = useT(nsPlayerMessages);
  const locale = useLocale();
  const describe = usePlayerErrorText();
  // Reconnexion qui RAMÈNE ici, conversation ouverte comprise.
  const { loading: authLoading, ready } = usePlayerSession({
    redirectTo: loginHrefFor(router.asPath),
  });
  const m = useCaptainMessages({
    ready,
    describe,
    texts: { loadError: t.loadError, openError: t.openError },
  });

  const head = (
    <Head>
      <title>{`${t.pageTitle} | OW Women's Cup`}</title>
    </Head>
  );

  if (authLoading || m.loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center pt-header">
        <div role="status" aria-label={t.loading} className={rubanSpinner} />
      </div>
    );
  }

  if (!m.hasTeam || !m.canManage) {
    return (
      <>
        {head}
        <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 pt-header text-center">
          <h1 className={`mb-4 text-2xl font-bold ${rubanStrong}`}>
            {t.gateTitle}
          </h1>
          <p className={`mb-6 ${rubanHelp}`}>
            {!m.hasTeam ? t.gateNoTeam : t.gateNotCaptain}
          </p>
          <ButtonLink href="/player" variant="primary">
            {t.backToSpace}
          </ButtonLink>
        </main>
      </>
    );
  }

  const inThread = !!m.activeConvId;
  const inInbox = !inThread && !m.showNewConv;
  const texts = {
    composeLabel: t.composeLabel,
    composePlaceholder: t.composePlaceholder,
    replyLabel: t.replyLabel,
    replyPlaceholder: t.replyPlaceholder,
    send: t.send,
    sending: t.sending,
    sendingShort: t.sendingShort,
    sendError: t.sendError,
  };

  const actions = inInbox ? (
    m.canSend ? (
      <Button
        ref={m.refs.newButtonRef}
        variant="primary"
        onClick={m.newConversation}
      >
        + {t.newButton}
      </Button>
    ) : null
  ) : (
    <Button variant="ghost" onClick={m.backToInbox}>
      &larr; {t.inbox}
    </Button>
  );

  return (
    <div className="pt-header pb-16">
      {head}
      <FilView
        title={t.pageTitle}
        actions={
          <>
            <ButtonLink href="/player" variant="ghost" size="sm">
              &larr; {t.backToSpace}
            </ButtonLink>
            {actions}
          </>
        }
        columns={1}
      >
        <Card padding="none">
          {(m.showNewConv || (inThread && m.otherTeam)) && (
            <div className="flex items-center gap-2 border-b border-[var(--line,rgba(194,196,201,.12))] px-6 py-4">
              {m.showNewConv ? (
                <span className={`text-sm ${rubanHelp}`}>
                  {t.newMessageHeader}
                </span>
              ) : (
                m.otherTeam && (
                  <>
                    <TeamLogo team={m.otherTeam} />
                    <span className={`text-sm font-medium ${rubanStrong}`}>
                      {m.otherTeam.name}
                    </span>
                  </>
                )
              )}
            </div>
          )}

          {inInbox && (
            <InboxList
              conversations={m.conversations}
              loading={m.convLoading}
              error={m.convError}
              locale={locale}
              texts={t}
              onOpen={(id) => void m.openConversation(id)}
            />
          )}

          {m.showNewConv && (
            <div className="p-6" ref={m.refs.newConvRef}>
              {/* Jamais atteignable sans `canSend` (le bouton d'ouverture est
                  masqué) ; gardé par sûreté. */}
              {m.canSend && (
                <ComposeForm
                  variant="new"
                  targetTeamId=""
                  onSend={m.send}
                  describe={describe}
                  texts={texts}
                  renderPicker={(value, onChange) => (
                    <TeamPicker
                      teams={m.teams}
                      value={value}
                      onChange={onChange}
                      loading={m.teamsLoading}
                      accentColor="emerald"
                      label={t.sendTo}
                      emptyLabel={t.noTeamFound}
                      search={m.teamSearch}
                      onSearchChange={m.setTeamSearch}
                      searchPlaceholder={t.searchTeam}
                    />
                  )}
                />
              )}
            </div>
          )}

          {inThread && (
            <ConversationThread
              messages={m.messages}
              myTeamId={m.myTeamId}
              loading={m.msgLoading}
              locale={locale}
              texts={t}
              endRef={m.refs.messagesEndRef}
              footer={
                m.canSend ? (
                  <ComposeForm
                    key={m.activeConvId}
                    variant="reply"
                    targetTeamId={m.otherTeam?.id ?? ''}
                    onSend={m.send}
                    describe={describe}
                    texts={texts}
                    inputRef={m.refs.replyInputRef}
                  />
                ) : (
                  <p
                    className={`border-t border-[var(--line,rgba(194,196,201,.12))] px-4 py-3 ${rubanHelp}`}
                  >
                    {t.readOnlyHint}
                  </p>
                )
              }
            />
          )}

          {m.error && (
            <div
              role="alert"
              aria-live="assertive"
              className={`mx-4 mb-3 ${rubanErrBox}`}
            >
              {m.error}
            </div>
          )}
        </Card>
      </FilView>
    </div>
  );
}
