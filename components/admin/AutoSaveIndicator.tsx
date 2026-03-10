// components/admin/AutoSaveIndicator.tsx
// Small indicator showing last auto-save timestamp.

function formatTime(iso: string | null) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return null;
  }
}

export default function AutoSaveIndicator({
  lastSaved,
}: {
  lastSaved: string | null;
}) {
  const time = formatTime(lastSaved);
  if (!time) return null;

  return (
    <span className="text-xs text-neutral-500">
      Brouillon sauvegarde a {time}
    </span>
  );
}
