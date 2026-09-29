// components/TeamCreate/StepRoster.tsx — étape 2 du wizard : roster (capitaine ou manager, invitations)
// (lot P11 : extrait de pages/team/create.tsx à l'identique — mêmes classes,
// mêmes textes).

import { roleRequiresBattleTag } from '@/utils/teams/roleKind';
import { CrownIcon } from './icons';
import type { TeamCreateWizard } from './useTeamCreateWizard';

export default function StepRoster({ w }: { w: TeamCreateWizard }) {
  const {
    t,
    tournamentIdParam,
    members,
    captainIndex,
    setCaptainIndex,
    creatorRole,
    setCreatorRole,
    managerEmail,
    setManagerEmail,
    isManagerMode,
    touched,
    markTouched,
    stepHeadingRef,
    rosterFull,
    rowsFull,
    addMemberRow,
    removeMemberRow,
    handleMemberChange,
    memberEmailError,
    managerEmailError,
    memberBattleTagError,
    filledMemberIdx,
    inputCls,
    labelCls,
    errCls,
  } = w;
  return (
    <section key="step-2" className="wizard-step-enter space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-gray-400">
            {t.rosterEyebrow}
          </p>
          <h2
            ref={stepHeadingRef}
            tabIndex={-1}
            className="text-xl font-semibold outline-none"
          >
            {t.rosterTitle}
          </h2>
        </div>
        <span className="text-xs text-gray-400">{t.rosterMax}</span>
      </div>

      {/* Qui crée l'équipe : capitaine (elle joue) ou manager (il encadre) */}
      <fieldset className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <legend className={labelCls}>{t.creatorRoleLegend}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            {
              value: 'captain' as const,
              label: t.creatorRoleCaptain,
              hint: t.creatorRoleCaptainHint,
            },
            {
              value: 'manager' as const,
              label: t.creatorRoleManager,
              hint: t.creatorRoleManagerHint,
            },
          ].map((opt) => (
            <label
              key={opt.value}
              className={`cursor-pointer rounded-xl border p-3 transition ${
                creatorRole === opt.value
                  ? 'border-[var(--color-violet)]/60 bg-[var(--color-violet)]/10'
                  : 'border-white/10 hover:border-white/30'
              }`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="creator-role"
                  className="sr-only"
                  checked={creatorRole === opt.value}
                  onChange={() => {
                    setCreatorRole(opt.value);
                    markTouched('creatorRole');
                  }}
                />
                <span
                  aria-hidden="true"
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    creatorRole === opt.value
                      ? 'border-[var(--color-violet)] bg-[var(--color-violet)]'
                      : 'border-white/30'
                  }`}
                >
                  {creatorRole === opt.value && (
                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  )}
                </span>
                <span className="text-sm font-semibold text-white">
                  {opt.label}
                </span>
              </span>
              <span className="mt-1 block pl-6 text-[11px] leading-snug text-gray-400">
                {opt.hint}
              </span>
            </label>
          ))}
        </div>

        {isManagerMode && (
          <div className="mt-4">
            <label htmlFor="manager-email" className={labelCls}>
              {t.managerEmailLabel}
            </label>
            <input
              id="manager-email"
              type="email"
              value={managerEmail}
              onChange={(e) => setManagerEmail(e.target.value)}
              onBlur={() => markTouched('managerEmail')}
              aria-invalid={!!(touched.managerEmail && managerEmailError())}
              aria-describedby={
                touched.managerEmail && managerEmailError()
                  ? 'err-manager-email'
                  : 'hint-manager-email'
              }
              className={inputCls}
              placeholder={t.emailPlaceholder}
            />
            {touched.managerEmail && managerEmailError() ? (
              <p id="err-manager-email" className={errCls}>
                {managerEmailError()}
              </p>
            ) : (
              <p
                id="hint-manager-email"
                className="mt-1.5 text-[11px] text-gray-400"
              >
                {t.managerEmailHint}
              </p>
            )}
          </div>
        )}
      </fieldset>

      {isManagerMode && (
        <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs leading-relaxed text-gray-300">
          {t.managerCaptainNote}
        </p>
      )}

      <div className="space-y-3">
        {members.map((member, idx) => {
          const emailErr = touched[`member-${idx}-email`]
            ? memberEmailError(idx)
            : undefined;
          const btErr = touched[`member-${idx}-battleTag`]
            ? memberBattleTagError(idx)
            : undefined;
          return (
            <div
              key={member.id}
              className={`rounded-2xl border bg-white/[0.04] p-4 transition ${
                captainIndex === idx
                  ? 'border-[var(--color-yellow)]/40 ring-1 ring-[var(--color-yellow)]/20'
                  : 'border-white/10'
              }`}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white ring-1 ring-white/15">
                    {member.email.trim()[0]?.toUpperCase() || idx + 1}
                  </span>
                  <span className="text-sm font-semibold text-gray-200">
                    #{idx + 1}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <label
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                      captainIndex === idx
                        ? 'border-[var(--color-yellow)]/60 bg-[var(--color-yellow)]/15 text-[var(--color-yellow)]'
                        : 'border-white/15 text-gray-300 hover:border-white/30'
                    }`}
                  >
                    <input
                      type="radio"
                      name="captain"
                      className="sr-only"
                      checked={captainIndex === idx}
                      onChange={() => {
                        setCaptainIndex(idx);
                        markTouched('captain');
                      }}
                    />
                    <CrownIcon className="h-3 w-3" />
                    {isManagerMode ? t.captainDesignatedLabel : t.captainLabel}
                  </label>
                  {members.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeMemberRow(idx)}
                      className="rounded-full p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
                      aria-label={t.removeMember}
                      title={t.removeMember}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        className="h-4 w-4"
                        aria-hidden="true"
                      >
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label htmlFor={`member-${idx}-email`} className={labelCls}>
                    {t.emailLabel}
                  </label>
                  <input
                    id={`member-${idx}-email`}
                    type="email"
                    value={member.email}
                    onChange={(e) =>
                      handleMemberChange(idx, 'email', e.target.value)
                    }
                    onBlur={() => markTouched(`member-${idx}-email`)}
                    aria-invalid={!!emailErr}
                    aria-describedby={
                      emailErr ? `err-member-${idx}-email` : undefined
                    }
                    className={inputCls}
                    placeholder={t.emailPlaceholder}
                  />
                  {emailErr && (
                    <p id={`err-member-${idx}-email`} className={errCls}>
                      {emailErr}
                    </p>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <label htmlFor={`member-${idx}-role`} className={labelCls}>
                      {t.roleLabel}
                    </label>
                    <select
                      id={`member-${idx}-role`}
                      value={member.role}
                      onChange={(e) =>
                        handleMemberChange(idx, 'role', e.target.value)
                      }
                      className={inputCls}
                    >
                      <option value="player">{t.roleOptionPlayer}</option>
                      <option value="coach">{t.roleOptionCoach}</option>
                      {/* `substitute` et PAS `sub` : c'est la valeur que
                            connaissent validateRole (utils/apiHelpers) et
                            la contrainte CHECK de team_members. `sub`
                            retombait silencieusement sur `player` — la
                            remplaçante était enregistrée titulaire, et
                            `is_substitute` restait faux. */}
                      <option value="substitute">{t.roleOptionSub}</option>
                      {/* L'encadrement peut se déclarer dès la création :
                            la RPC `accept_invitation` honore `manager`
                            depuis accept_invitation_allow_manager.sql, et
                            le rôle ne consomme aucune place de roster. */}
                      <option value="manager">{t.roleOptionManager}</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor={`member-${idx}-specialty`}
                      className={labelCls}
                    >
                      {t.specialtyLabel}
                    </label>
                    <select
                      id={`member-${idx}-specialty`}
                      value={member.specialty}
                      onChange={(e) =>
                        handleMemberChange(idx, 'specialty', e.target.value)
                      }
                      className={inputCls}
                    >
                      <option value="">{t.specialtyNone}</option>
                      <option value="tank">{t.specialtyTank}</option>
                      <option value="dps">{t.specialtyDps}</option>
                      <option value="support">{t.specialtySupport}</option>
                      <option value="flex">{t.specialtyFlex}</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor={`member-${idx}-btag`} className={labelCls}>
                      {t.battleTagLabel}
                      {tournamentIdParam && roleRequiresBattleTag(member.role)
                        ? ' *'
                        : ''}
                    </label>
                    <input
                      id={`member-${idx}-btag`}
                      value={member.battleTag}
                      onChange={(e) =>
                        handleMemberChange(idx, 'battleTag', e.target.value)
                      }
                      onBlur={() => markTouched(`member-${idx}-battleTag`)}
                      aria-invalid={!!btErr}
                      aria-describedby={
                        btErr ? `err-member-${idx}-btag` : undefined
                      }
                      className={inputCls}
                      placeholder={t.battleTagPlaceholder}
                      required={
                        !!tournamentIdParam &&
                        roleRequiresBattleTag(member.role) &&
                        member.email.trim().length > 0
                      }
                    />
                    {btErr ? (
                      <p id={`err-member-${idx}-btag`} className={errCls}>
                        {btErr}
                      </p>
                    ) : (
                      (!tournamentIdParam ||
                        !roleRequiresBattleTag(member.role)) && (
                        <p className="mt-1 text-[10px] text-gray-500">
                          {t.battleTagOptionalNote}
                        </p>
                      )
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!isManagerMode &&
        touched.captain &&
        filledMemberIdx.length > 0 &&
        captainIndex === null && (
          <p className={errCls}>{t.validationCaptainRequired}</p>
        )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => addMemberRow('player')}
          disabled={rosterFull || rowsFull}
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${
            rosterFull || rowsFull
              ? 'cursor-not-allowed border border-white/10 bg-white/5 text-gray-500'
              : 'border border-[var(--color-green)]/40 bg-[var(--color-green)]/10 text-[var(--color-green-light)] hover:bg-[var(--color-green)]/20'
          }`}
        >
          <span aria-hidden="true">+</span>
          {t.addMember}
        </button>
        {/* Bouton SÉPARÉ pour l'encadrement, et pas un simple
              « ajouter » dont on changerait le rôle ensuite : à effectif
              jouant complet, le bouton joueuses est désactivé, et un
              bouton unique désactivé laissait croire qu'on ne pouvait plus
              ajouter personne. C'est exactement le cul-de-sac signalé. */}
        <button
          type="button"
          onClick={() => addMemberRow('coach')}
          disabled={rowsFull}
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${
            rowsFull
              ? 'cursor-not-allowed border border-white/10 bg-white/5 text-gray-500'
              : 'border border-sky-400/40 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20'
          }`}
        >
          <span aria-hidden="true">+</span>
          {t.addStaff}
        </button>
        <p className="text-xs text-gray-400">
          {rosterFull ? t.addStaffHint : t.addMemberHint}
        </p>
      </div>
    </section>
  );
}
