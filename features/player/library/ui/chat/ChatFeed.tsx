// features/player/library/ui/chat/ChatFeed.tsx — le fil du chat d'une salle
// (lot 6 de docs/PLAN-womens-library.md). Présentationnel.
//
//   - `role="log"` : une région vivante POLIE — un lecteur d'écran annonce
//     les nouveaux messages sans couper ce qu'il lit ;
//   - TEXTE BRUT : le corps est rendu comme du texte (React l'échappe), sans
//     lien cliquable, sans markdown ; un message masqué par la modération
//     perd son texte et le dit ;
//   - l'heure de chaque message, mon pseudo marqué « toi » ;
//   - « ⋯ » ouvre les gestes POSSIBLES sur ce message (signaler, masquer,
//     mettre en sourdine), en ligne : bouton `aria-expanded`, groupe nommé ;
//   - le fil reste en bas s'il y était (pas de saut si on relit plus haut).

import {
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
} from 'react';
import { format, useT } from '@/lib/i18n/useT';
import { useLang } from '@/lib/i18n/LanguageProvider';
import nsChat from '@/lib/i18n/locales/fr/playerLibraryChat';
import { formatSiteDate } from '@/utils/timezone';
import type { ChatFeedMessage } from '../../realtime/chatState';
import { FOCUS_RING } from '../social/shared';

export type ChatActionKind = 'report' | 'hide' | 'mute';

const TIME: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };

/** Les gestes possibles sur un message, dans l'ordre d'affichage. */
export function actionsFor(
  m: ChatFeedMessage,
  ctx: { selfId: string | null; canHide: boolean; canMute: boolean }
): ChatActionKind[] {
  if (m.hidden) return [];
  const own = ctx.selfId !== null && m.userId === ctx.selfId;
  const out: ChatActionKind[] = [];
  if (!own) out.push('report');
  if (ctx.canHide) out.push('hide');
  if (ctx.canMute && !own) out.push('mute');
  return out;
}

export default function ChatFeed({
  messages,
  selfId,
  canHide,
  canMute,
  openFor,
  onToggle,
  onAction,
  renderPanel,
}: {
  messages: readonly ChatFeedMessage[];
  selfId: string | null;
  canHide: boolean;
  canMute: boolean;
  /** Le message dont les gestes sont dépliés. */
  openFor: string | null;
  onToggle: (messageId: string | null) => void;
  onAction: (
    kind: ChatActionKind,
    message: ChatFeedMessage,
    trigger: HTMLElement
  ) => void;
  /** Le panneau du geste en cours, rendu sous son message. */
  renderPanel: (messageId: string) => ReactNode;
}) {
  const t = useT(nsChat);
  const { lang } = useLang();
  const ids = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);

  const onScroll = () => {
    const el = boxRef.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };

  // Un nouveau message : on suit le bas, si on y était.
  const last = messages[messages.length - 1]?.id ?? null;
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (el && atBottom.current && last !== null) el.scrollTop = el.scrollHeight;
  }, [last]);

  // Le panneau ouvert sur un message disparu (masqué, bloquée) se referme.
  useEffect(() => {
    if (openFor && !messages.some((m) => m.id === openFor && !m.hidden)) {
      onToggle(null);
    }
  }, [messages, openFor, onToggle]);

  if (messages.length === 0) {
    return <p className="text-sm text-[var(--t3,#a39ba6)]">{t.empty}</p>;
  }

  return (
    <div
      ref={boxRef}
      onScroll={onScroll}
      className="max-h-80 overflow-y-auto rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s0,#0b060d)] p-3"
    >
      <ol
        role="log"
        aria-label={t.feedLabel}
        aria-live="polite"
        aria-relevant="additions text"
        className="flex flex-col gap-2"
      >
        {messages.map((m) => {
          const own = selfId !== null && m.userId === selfId;
          const actions = actionsFor(m, { selfId, canHide, canMute });
          const open = openFor === m.id;
          const groupId = `${ids}-actions-${m.id}`;
          // Le panneau d'un geste remplace la liste des gestes.
          const panel = renderPanel(m.id);
          return (
            <li
              key={m.id}
              data-chat-message={m.id}
              data-hidden={m.hidden ? '' : undefined}
              className="flex flex-col gap-1"
            >
              <div className="flex items-start gap-2 text-sm">
                <time
                  dateTime={m.createdAt}
                  className="shrink-0 pt-0.5 text-xs tabular-nums text-[var(--t3,#a39ba6)]"
                >
                  {formatSiteDate(m.createdAt, lang, TIME, '')}
                </time>
                <p className="min-w-0 flex-1 break-words text-[var(--t1,#f4edf7)]">
                  <span className="font-semibold">{m.nickname}</span>
                  {own ? (
                    <span className="text-[var(--t3,#a39ba6)]"> ({t.you})</span>
                  ) : null}
                  <span aria-hidden="true"> : </span>
                  {m.hidden ? (
                    <em className="text-[var(--t3,#a39ba6)]">
                      {t.hiddenMessage}
                    </em>
                  ) : (
                    <span className="whitespace-pre-wrap">{m.body}</span>
                  )}
                </p>
                {actions.length > 0 && (
                  <button
                    type="button"
                    data-chat-toggle={m.id}
                    aria-expanded={open}
                    aria-controls={open && !panel ? groupId : undefined}
                    aria-label={format(t.actions.open, {
                      nickname: m.nickname,
                    })}
                    onClick={() => onToggle(open ? null : m.id)}
                    className={`min-h-8 min-w-8 shrink-0 rounded-[var(--r-ctrl,4px)] px-2 text-[var(--t2,#c7bfca)] hover:bg-white/5 ${FOCUS_RING}`}
                  >
                    <span aria-hidden="true">⋯</span>
                  </button>
                )}
              </div>
              {open && !panel && (
                <div
                  id={groupId}
                  role="group"
                  aria-label={format(t.actions.open, { nickname: m.nickname })}
                  className="flex flex-wrap gap-2 pl-12"
                >
                  {actions.map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      data-chat-action={kind}
                      onClick={(e) => onAction(kind, m, e.currentTarget)}
                      className={`min-h-8 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] px-3 text-xs text-[var(--t1,#f4edf7)] hover:bg-white/5 ${FOCUS_RING}`}
                    >
                      {t.actions[kind]}
                    </button>
                  ))}
                </div>
              )}
              {panel}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
