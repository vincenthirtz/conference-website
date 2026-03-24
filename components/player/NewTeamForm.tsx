import { useMemo } from 'react';

type TeamMember = {
  email: string;
  battleTag: string;
  displayName: string;
};

type Props = {
  teamName: string;
  onTeamNameChange: (value: string) => void;
  members: TeamMember[];
  onAddMember: () => void;
  onUpdateMember: (index: number, field: keyof TeamMember, value: string) => void;
  onRemoveMember: (index: number) => void;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BATTLETAG_RE = /^.+#\d{4,}$/;

function validateMember(member: TeamMember, index: number, allMembers: TeamMember[]) {
  const errors: Partial<Record<keyof TeamMember, string>> = {};

  if (member.email && !EMAIL_RE.test(member.email)) {
    errors.email = 'Email invalide';
  }

  // Check duplicate emails
  if (
    member.email &&
    allMembers.some(
      (m, i) => i !== index && m.email.toLowerCase() === member.email.toLowerCase()
    )
  ) {
    errors.email = 'Email déjà utilisé par un autre membre';
  }

  if (member.battleTag && !BATTLETAG_RE.test(member.battleTag)) {
    errors.battleTag = 'Format attendu : Pseudo#1234';
  }

  // Check duplicate battletags
  if (
    member.battleTag &&
    allMembers.some(
      (m, i) =>
        i !== index &&
        m.battleTag &&
        m.battleTag.toLowerCase() === member.battleTag.toLowerCase()
    )
  ) {
    errors.battleTag = 'BattleTag déjà utilisé par un autre membre';
  }

  return errors;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-xs text-red-400 mt-1">{message}</p>
  );
}

export default function NewTeamForm({
  teamName,
  onTeamNameChange,
  members,
  onAddMember,
  onUpdateMember,
  onRemoveMember,
}: Props) {
  const memberErrors = useMemo(
    () => members.map((m, i) => validateMember(m, i, members)),
    [members]
  );

  return (
    <>
      <div>
        <label
          htmlFor="teamName"
          className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2"
        >
          Nom de l&apos;equipe *
        </label>
        <input
          id="teamName"
          type="text"
          value={teamName}
          onChange={(e) => onTeamNameChange(e.target.value)}
          className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400/80 transition"
          placeholder="Ex: Les Licornes de l'Espace"
          maxLength={100}
        />
      </div>

      {/* Membres */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium tracking-[0.12em] uppercase text-gray-300">
            Joueuses (optionnel)
          </label>
          <span className="text-xs text-gray-500">{members.length}/5</span>
        </div>

        <p className="text-xs text-gray-500 mb-3">
          Ajoute les joueuses de ton equipe. Elles recevront une invitation.
        </p>

        <div className="space-y-3">
          {members.map((member, index) => {
            const errors = memberErrors[index];
            return (
              <div
                key={index}
                className="rounded-xl border border-white/10 bg-black/40 p-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400">
                    Joueuse {index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveMember(index)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Retirer
                  </button>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  <div>
                    <input
                      type="email"
                      placeholder="Email *"
                      value={member.email}
                      onChange={(e) =>
                        onUpdateMember(index, 'email', e.target.value)
                      }
                      className={`w-full rounded-lg border bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-400/60 ${
                        errors.email
                          ? 'border-red-500/50'
                          : 'border-white/10'
                      }`}
                    />
                    <FieldError message={errors.email} />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="BattleTag (Pseudo#1234)"
                      value={member.battleTag}
                      onChange={(e) =>
                        onUpdateMember(index, 'battleTag', e.target.value)
                      }
                      className={`w-full rounded-lg border bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-400/60 ${
                        errors.battleTag
                          ? 'border-red-500/50'
                          : 'border-white/10'
                      }`}
                    />
                    <FieldError message={errors.battleTag} />
                  </div>
                  <input
                    type="text"
                    placeholder="Pseudo"
                    value={member.displayName}
                    onChange={(e) =>
                      onUpdateMember(index, 'displayName', e.target.value)
                    }
                    className="rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-400/60"
                  />
                </div>
              </div>
            );
          })}

          {members.length < 5 && (
            <button
              type="button"
              onClick={onAddMember}
              className="w-full px-4 py-3 rounded-xl border border-dashed border-white/20 text-sm text-gray-400 hover:border-purple-400/50 hover:text-purple-300 transition"
            >
              + Ajouter une joueuse
            </button>
          )}
        </div>
      </div>
    </>
  );
}
