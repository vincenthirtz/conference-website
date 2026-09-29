// components/admin/demandes/DemandeAvatar.tsx
//
// La vignette d'une ligne de la liste des demandes.
//
// Elle porte une distinction qui n'existait pas : toutes les lignes ne sont pas
// des demandes de quelqu'un. Trois écrans écrivent dans `demandes` avec
// `user_id: null` pour PRÉVENIR une équipe — scrim accepté, message aux
// capitaines, ouverture d'un tournoi. Sur ces lignes, la silhouette de personne
// affirmait un auteur absent, en renfort du « Utilisateur inconnu » affiché à
// côté : deux signaux pour un manque qui n'en est pas un.
//
// Une cloche dit ce qui se passe vraiment : cette ligne prévient, elle ne
// demande rien.

import Image from 'next/image';

const PERSON_PATH =
  'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z';
const BELL_PATH =
  'M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9';

export default function DemandeAvatar({
  avatarUrl,
  name,
  isNotification,
}: {
  avatarUrl: string | null;
  name: string | null;
  isNotification: boolean;
}) {
  if (avatarUrl) {
    return (
      <div className="flex-shrink-0">
        <Image
          src={avatarUrl}
          alt={name || 'User'}
          width={48}
          height={48}
          className="w-12 h-12 rounded-[var(--r-ctrl,4px)] object-cover border border-[var(--line,rgba(194,196,201,.12))]"
        />
      </div>
    );
  }

  return (
    <div className="flex-shrink-0">
      <div
        className={`w-12 h-12 rounded-[var(--r-ctrl,4px)] flex items-center justify-center border ${
          isNotification
            ? 'bg-[rgba(180,103,209,.10)] border-[rgba(180,103,209,.4)]'
            : 'bg-[var(--s3,#2f2732)] border-[var(--line,rgba(194,196,201,.12))]'
        }`}
      >
        <svg
          className={`w-6 h-6 ${isNotification ? 'text-[var(--or-200,#eec4ff)]' : 'text-[var(--t4,#807984)]'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d={isNotification ? BELL_PATH : PERSON_PATH}
          />
        </svg>
      </div>
    </div>
  );
}
