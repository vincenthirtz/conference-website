// components/admin/teams/TeamCommsFields.tsx
//
// « Comment on parle à cette équipe » : son rôle Discord (à qui le bot pingue)
// et la LANGUE de ses messages de match.
//
// La langue pilote les mails de check-in, le lien de check-in, les rappels du
// salon et le MP du bot (`teams.preferred_locale`, cf. utils/checkin). Elle
// vivait en base seulement : Chocomates, équipe internationale, a été déclarée
// forfait le 18/09/2026 après n'avoir reçu que du français.
//
// Extrait de pages/admin/teams/[teamId]/edit.tsx (lot A7 : tout lot qui touche
// un god-component en sort au moins un panneau).

export type TeamLocaleValue = '' | 'fr' | 'en';

const inputClass =
  'w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm';

export default function TeamCommsFields({
  discordRoleId,
  onDiscordRoleIdChange,
  locale,
  onLocaleChange,
  t,
}: {
  discordRoleId: string;
  onDiscordRoleIdChange: (value: string) => void;
  locale: TeamLocaleValue;
  onLocaleChange: (value: TeamLocaleValue) => void;
  t: Record<string, string>;
}) {
  return (
    <>
      <div>
        <label className="block text-sm text-neutral-400 mb-1">
          {t.discordRoleIdLabel}
        </label>
        <input
          type="text"
          value={discordRoleId}
          onChange={(e) => onDiscordRoleIdChange(e.target.value)}
          className={`${inputClass} font-mono`}
          placeholder="1234567890123456789"
        />
        <p className="text-xs text-neutral-500 mt-1">{t.discordRoleIdHelp}</p>
      </div>
      <div>
        <label
          htmlFor="team-preferred-locale"
          className="block text-sm text-neutral-400 mb-1"
        >
          {t.localeLabel}
        </label>
        <select
          id="team-preferred-locale"
          value={locale}
          onChange={(e) => onLocaleChange(e.target.value as TeamLocaleValue)}
          className={inputClass}
        >
          <option value="">{t.localeDefault}</option>
          <option value="fr">{t.localeFr}</option>
          <option value="en">{t.localeEn}</option>
        </select>
        <p className="text-xs text-neutral-500 mt-1">{t.localeHelp}</p>
      </div>
    </>
  );
}
