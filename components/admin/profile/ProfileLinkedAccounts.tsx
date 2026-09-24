// components/admin/profile/ProfileLinkedAccounts.tsx
//
// Les blocs du profil joueuse, dans la modale profil du staff : Twitch,
// Discord, carte à collectionner. Un membre du staff peut jouer, streamer,
// avoir sa carte — il avait jusqu'ici le seul bloc BattleTag.
//
// Mêmes composants que /player/profile, rendus sans leur encadré
// (`chrome="bare"`) dans les sections de la modale ; retour sur la modale
// après un flux OAuth (`/admin?profile=1` la rouvre) et login staff sur 401.

import TwitchLinkCard from '@/components/player/TwitchLinkCard';
import DiscordLinkCard from '@/components/player/DiscordLinkCard';
import TcgPhotoCard from '@/components/player/TcgPhotoCard';
import SectionCard from './ProfileSectionCard';

const RETURN_TO = '/admin?profile=1';
const LOGIN_PATH = '/admin/login';

function LinkGlyph() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
      />
    </svg>
  );
}

function CardGlyph() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <rect x="5" y="3" width="14" height="18" rx="2" strokeWidth={1.8} />
      <path strokeLinecap="round" strokeWidth={1.8} d="M9 8h6M9 12h6" />
    </svg>
  );
}

export default function ProfileLinkedAccounts({
  t,
}: {
  t: { twitchHeading: string; discordHeading: string; tcgHeading: string };
}) {
  return (
    <>
      <SectionCard accent="purple" title={t.twitchHeading} icon={<LinkGlyph />}>
        <TwitchLinkCard
          chrome="bare"
          loginPath={LOGIN_PATH}
          returnTo={RETURN_TO}
        />
      </SectionCard>

      <SectionCard accent="blue" title={t.discordHeading} icon={<LinkGlyph />}>
        <DiscordLinkCard
          chrome="bare"
          loginPath={LOGIN_PATH}
          returnTo={RETURN_TO}
        />
      </SectionCard>

      <SectionCard accent="amber" title={t.tcgHeading} icon={<CardGlyph />}>
        <TcgPhotoCard chrome="bare" loginPath={LOGIN_PATH} />
      </SectionCard>
    </>
  );
}
