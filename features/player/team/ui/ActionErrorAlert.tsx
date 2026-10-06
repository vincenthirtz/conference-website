// features/player/team/ui/ActionErrorAlert.tsx — erreur du dernier geste de
// « Gérer mon équipe ». Extrait de PlayerManageTeamScreen (fichier gelé par
// le garde de taille) par le lot P7.

export default function ActionErrorAlert({
  message,
}: {
  message: string | null;
}) {
  if (!message) return null;
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100"
    >
      {message}
    </div>
  );
}
