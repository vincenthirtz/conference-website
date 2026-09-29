// features/player/team/ui/TeamHeaderBlock.tsx — en-tête de la fiche équipe
// (archétype Fiche : `EntityHeader` du kit) : logo en écusson, nom, sigle,
// lien vers la page publique et, avec `edit_public_page`, vers son édition.

import Image from 'next/image';
import Link from 'next/link';
import { EntityHeader } from '@/features/ruban';
import { isOptimizableImageUrl } from '@/utils/images/optimizableImage';
import type { ManagedTeamInfoDto } from '../schemas';
import type { ManageTeamTexts } from '../hooks/useManageTeamScreen';

function TeamCrest({ team }: { team: ManagedTeamInfoDto }) {
  if (!team.logo_url) return null;
  // `next/image` quand l'hôte est déclaré, `<img>` sinon — un hôte non
  // déclaré ferait échouer `next/image` au rendu.
  return isOptimizableImageUrl(team.logo_url) ? (
    <Image
      src={team.logo_url}
      alt={team.name}
      width={52}
      height={52}
      className="h-full w-full object-cover"
    />
  ) : (
    // biome-ignore lint/performance/noImgElement: hôte hors `remotePatterns`, `next/image` échouerait
    <img
      src={team.logo_url}
      alt={team.name}
      width={52}
      height={52}
      decoding="async"
      className="h-full w-full object-cover"
    />
  );
}

export default function TeamHeaderBlock({
  team,
  canEditPublicPage,
  t,
}: {
  team: ManagedTeamInfoDto;
  canEditPublicPage: boolean;
  t: ManageTeamTexts;
}) {
  const slug = encodeURIComponent(team.slug || team.id);
  return (
    <EntityHeader
      crest={team.logo_url ? <TeamCrest team={team} /> : undefined}
      title={team.name}
      meta={team.short_name || undefined}
      actions={
        <div className="flex flex-col items-end gap-1">
          <Link
            href={`/team/${slug}`}
            className="text-sm text-purple-300 hover:text-purple-200"
          >
            {t.publicPage}
          </Link>
          {/* Lot A3 : le staff corrigeait des logos à la place des équipes,
              alors que le geste existe (page publique → Éditer). */}
          {canEditPublicPage && (
            <Link
              href={`/team/${slug}/edit`}
              className="text-xs text-gray-400 hover:text-white"
            >
              {team.logo_url ? t.editBranding : t.addLogo}
            </Link>
          )}
        </div>
      }
    />
  );
}
