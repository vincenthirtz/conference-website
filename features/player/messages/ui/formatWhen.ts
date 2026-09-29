// features/player/messages/ui/formatWhen.ts — horodatages de la messagerie
// (lot P15) : relatif dans la boîte (heure, « Hier », jour, date), heure dans
// le fil. Pur.

export function formatConversationDate(
  iso: string,
  locale: string,
  yesterday: string,
  now: Date = new Date()
): string {
  const d = new Date(iso);
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 0) {
    return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1) return yesterday;
  if (diffDays < 7) return d.toLocaleDateString(locale, { weekday: 'short' });
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

export function formatMessageTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });
}
