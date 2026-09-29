// pages/admin/teams/new.tsx

import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import LogoUpload from '@/components/admin/LogoUpload';
import { useToast } from '@/components/Toast';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { withAdminQuery } from '@/features/admin/_shared/query';
import { teamsPaths } from '@/features/admin/teams/client';
import { useInvalidateTeamLists } from '@/features/admin/teams/hooks/useTeamsQueries';
import { supabaseAdmin } from '@/utils/supabase';
import {
  loadTeamRolesFromSupabase,
  DEFAULT_TEAM_ROLES,
  type TeamRole,
} from '@/utils/teamRoles';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminTeamsNew from '@/lib/i18n/locales/admin-fr/adminTeamsNew';
import EntityHeader from '@/features/admin/_shared/ui/EntityHeader';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import {
  FicheLayout,
  FicheSection,
  MetaList,
} from '@/features/admin/_shared/ui/Fiche';

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type StaffProps = {
  staff: StaffShape;
  teamRoles: TeamRole[];
};

type CreateTeamResponse = {
  team: {
    id: string;
    name: string;
  };
};

type MemberInput = {
  email: string;
  role: string;
};

export const getServerSideProps = withStaffPage<{ teamRoles: TeamRole[] }>(
  { permission: 'manage_teams' },
  async () => {
    const teamRoles = supabaseAdmin
      ? await loadTeamRolesFromSupabase(supabaseAdmin)
      : DEFAULT_TEAM_ROLES;
    return { teamRoles };
  }
);

function AdminNewTeamPage({ teamRoles }: StaffProps) {
  const t = useAdminT(nsAdminTeamsNew);
  const router = useRouter();
  const { addToast } = useToast();
  const { mutateJson } = useIdempotentMutation();
  const invalidateTeamLists = useInvalidateTeamLists();

  // Infos equipe
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [country, setCountry] = useState('');
  const [description, setDescription] = useState('');
  const [captainEmail, setCaptainEmail] = useState('');

  const defaultRole = teamRoles[0]?.value || 'player';

  // Membres
  const [members, setMembers] = useState<MemberInput[]>([
    { email: '', role: defaultRole },
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleMemberChange = (
    index: number,
    field: keyof MemberInput,
    value: string
  ) => {
    setMembers((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const addMemberRow = () => {
    setMembers((prev) => [...prev, { email: '', role: defaultRole }]);
  };

  const removeMemberRow = (index: number) => {
    setMembers((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const payload = {
        name,
        short_name: shortName || null,
        logo_url: logoUrl || null,
        country: country || null,
        description: description || null,
        captain_email: captainEmail || null,
        members: members
          .filter((m) => m.email.trim().length > 0)
          .map((m) => ({
            email: m.email.trim(),
            role: m.role.trim() || defaultRole,
          })),
      };

      const json = await mutateJson<CreateTeamResponse>(teamsPaths.list, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      addToast(t.toastCreated, 'success');
      void invalidateTeamLists();

      if (json.team?.id) {
        router.push(`/admin/teams/${json.team.id}`);
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errUnexpected);
    } finally {
      setSubmitting(false);
    }
  };

  const formId = 'team-new-form';
  const inputClass =
    'w-full px-3 py-2.5 rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] text-[var(--t1,#f4edf7)] focus:outline-none focus:ring-2 focus:ring-[var(--or,#b467d1)] text-sm';
  const labelClass = 'block text-sm text-[var(--t2,#c7bfca)] mb-1';
  const filledMembers = members.filter((m) => m.email.trim().length > 0).length;

  return (
    <>
      <Head>
        <title>{t.headTitle}</title>
      </Head>

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <button
          type="button"
          onClick={() => router.push('/admin/teams')}
          className="mb-3 inline-flex items-center gap-2 text-sm text-[var(--t3,#a39ba6)] transition-colors hover:text-[var(--t1,#f4edf7)]"
        >
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
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          {t.backToList}
        </button>

        <EntityHeader
          crest={
            shortName.trim()
              ? shortName.trim().slice(0, 3).toUpperCase()
              : name.trim()
                ? name.trim().slice(0, 3).toUpperCase()
                : undefined
          }
          title={name.trim() || t.heading}
          meta={t.subtitle}
          actions={
            <>
              <AdminButton
                onClick={() => router.push('/admin/teams')}
                disabled={submitting}
              >
                {t.cancel}
              </AdminButton>
              <AdminButton
                variant="primary"
                type="submit"
                form={formId}
                disabled={submitting || !name.trim()}
              >
                {submitting ? t.creating : t.submit}
              </AdminButton>
            </>
          }
        />

        {/* Messages */}
        {errorMsg && (
          <div className="mb-6 flex items-center gap-2 rounded-[var(--r-ctrl,4px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] px-4 py-3 text-sm text-[var(--t1,#f4edf7)]">
            <svg
              className="w-5 h-5 flex-shrink-0 text-[var(--err,#ff6b6b)]"
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            {errorMsg}
          </div>
        )}

        <form id={formId} onSubmit={handleSubmit}>
          <FicheLayout
            main={
              <>
                {/* Infos equipe */}
                <FicheSection title={t.mainInfoTitle}>
                  <div className="space-y-4">
                    <div>
                      <label className={labelClass}>
                        {t.nameLabel}{' '}
                        <span className="text-[var(--err,#ff6b6b)]">*</span>
                      </label>
                      <input
                        className={inputClass}
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t.namePlaceholder}
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className={labelClass}>{t.shortNameLabel}</label>
                        <input
                          className={inputClass}
                          type="text"
                          value={shortName}
                          onChange={(e) => setShortName(e.target.value)}
                          placeholder={t.shortNamePlaceholder}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>{t.countryLabel}</label>
                        <input
                          className={inputClass}
                          type="text"
                          value={country}
                          onChange={(e) => setCountry(e.target.value)}
                          placeholder={t.countryPlaceholder}
                        />
                      </div>
                    </div>

                    <LogoUpload
                      value={logoUrl}
                      onChange={setLogoUrl}
                      label={t.logoLabel}
                    />

                    <div>
                      <label className={labelClass}>{t.descriptionLabel}</label>
                      <textarea
                        className={`${inputClass} min-h-[100px] resize-y`}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder={t.descriptionPlaceholder}
                      />
                    </div>

                    <div>
                      <label className={labelClass}>
                        {t.captainEmailLabel}
                      </label>
                      <input
                        className={inputClass}
                        type="email"
                        value={captainEmail}
                        onChange={(e) => setCaptainEmail(e.target.value)}
                        placeholder="capitaine@exemple.com"
                      />
                      <p className="mt-1 text-xs text-[var(--t4,#807984)]">
                        {t.captainEmailHelp}
                      </p>
                    </div>
                  </div>
                </FicheSection>

                {/* Membres */}
                <FicheSection
                  title={t.membersTitle}
                  aside={
                    <AdminButton
                      variant="secondary"
                      size="xs"
                      onClick={addMemberRow}
                    >
                      {t.add}
                    </AdminButton>
                  }
                >
                  <p className="-mt-3 mb-4 text-sm text-[var(--t3,#a39ba6)]">
                    {t.membersSubtitle}
                  </p>
                  <div className="space-y-3">
                    {members.map((member, index) => (
                      <div
                        key={index}
                        className="flex flex-col gap-3 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] p-4 md:flex-row"
                      >
                        <div className="flex-1">
                          <label className="mb-1 block text-xs text-[var(--t3,#a39ba6)]">
                            {t.memberEmailLabel}
                          </label>
                          <input
                            className={`${inputClass} bg-[var(--s1,#100812)]`}
                            type="email"
                            value={member.email}
                            onChange={(e) =>
                              handleMemberChange(index, 'email', e.target.value)
                            }
                            placeholder={t.emailExamplePlaceholder}
                          />
                        </div>
                        <div className="w-full md:w-40">
                          <label className="mb-1 block text-xs text-[var(--t3,#a39ba6)]">
                            {t.roleLabel}
                          </label>
                          <select
                            className={`${inputClass} bg-[var(--s1,#100812)]`}
                            value={member.role}
                            onChange={(e) =>
                              handleMemberChange(index, 'role', e.target.value)
                            }
                          >
                            {teamRoles.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-end">
                          <button
                            type="button"
                            disabled={members.length === 1}
                            onClick={() => removeMemberRow(index)}
                            className="rounded-[var(--r-ctrl,4px)] p-2.5 text-[var(--err,#ff6b6b)] transition-colors hover:bg-[rgba(255,107,107,.08)] disabled:cursor-not-allowed disabled:opacity-30"
                            title={t.removeMemberTitle}
                          >
                            <svg
                              className="w-5 h-5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <p className="mt-4 text-xs text-[var(--t4,#807984)]">
                    {t.membersHelp}
                  </p>
                </FicheSection>
              </>
            }
            aside={
              <FicheSection eyebrow title={t.summaryTitle}>
                <MetaList
                  items={[
                    { label: t.summaryName, value: name || '—' },
                    { label: t.summaryTag, value: shortName || '—' },
                    { label: t.summaryCountry, value: country || '—' },
                    { label: t.summaryCaptain, value: captainEmail || '—' },
                    {
                      label: t.summaryMembers,
                      value: `${filledMembers} / ${members.length}`,
                    },
                  ]}
                />
                <p className="mt-4 text-xs text-[var(--t4,#807984)]">
                  {t.summaryHelp}
                </p>
                <p className="mt-2 text-xs text-[var(--t4,#807984)]">
                  {t.actionsHint}
                </p>
              </FicheSection>
            }
          />
        </form>
      </div>
    </>
  );
}

export default withAdminQuery(AdminNewTeamPage);
