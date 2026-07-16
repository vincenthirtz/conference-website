// pages/admin/teams/new.tsx

import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import LogoUpload from '@/components/admin/LogoUpload';
import { useToast } from '@/components/Toast';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { supabaseAdmin } from '@/utils/supabase';
import {
  loadTeamRolesFromSupabase,
  DEFAULT_TEAM_ROLES,
  type TeamRole,
} from '@/utils/teamRoles';
import { useAdminT } from '@/lib/i18n/useAdminT';

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
  'admin',
  async () => {
    const teamRoles = supabaseAdmin
      ? await loadTeamRolesFromSupabase(supabaseAdmin)
      : DEFAULT_TEAM_ROLES;
    return { teamRoles };
  }
);

function AdminNewTeamPage({ staff, teamRoles }: StaffProps) {
  const t = useAdminT('adminTeamsNew');
  const router = useRouter();
  const { addToast } = useToast();
  const { mutateJson } = useIdempotentMutation();

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

      const json = await mutateJson<CreateTeamResponse>('/api/admin/teams', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      addToast(t.toastCreated, 'success');

      if (json.team?.id) {
        router.push(`/admin/teams/${json.team.id}`);
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errUnexpected);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Head>
        <title>{t.headTitle}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <button
              type="button"
              onClick={() => router.push('/admin/teams')}
              className="mb-4 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
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

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  {t.heading}
                </h1>
                <p className="text-neutral-400 text-sm mt-1">{t.subtitle}</p>
              </div>
            </div>
          </div>

          {/* Messages */}
          {errorMsg && (
            <div className="mb-6 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm flex items-center gap-2">
              <svg
                className="w-5 h-5 text-red-400 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
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

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="grid gap-6 lg:grid-cols-[2fr,1fr]"
          >
            {/* Colonne gauche : infos equipe + membres */}
            <div className="space-y-6">
              {/* Infos equipe */}
              <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-5">
                <h2 className="text-lg font-semibold">{t.mainInfoTitle}</h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-neutral-300 mb-1">
                      {t.nameLabel} <span className="text-red-400">*</span>
                    </label>
                    <input
                      className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t.namePlaceholder}
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">
                        {t.shortNameLabel}
                      </label>
                      <input
                        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        type="text"
                        value={shortName}
                        onChange={(e) => setShortName(e.target.value)}
                        placeholder={t.shortNamePlaceholder}
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">
                        {t.countryLabel}
                      </label>
                      <input
                        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
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
                    <label className="block text-sm text-neutral-300 mb-1">
                      {t.descriptionLabel}
                    </label>
                    <textarea
                      className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm min-h-[100px] resize-y"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={t.descriptionPlaceholder}
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-neutral-300 mb-1">
                      {t.captainEmailLabel}
                    </label>
                    <input
                      className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      type="email"
                      value={captainEmail}
                      onChange={(e) => setCaptainEmail(e.target.value)}
                      placeholder="capitaine@exemple.com"
                    />
                    <p className="mt-1 text-xs text-neutral-500">
                      {t.captainEmailHelp}
                    </p>
                  </div>
                </div>
              </section>

              {/* Membres */}
              <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{t.membersTitle}</h2>
                    <p className="text-sm text-neutral-400 mt-1">
                      {t.membersSubtitle}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addMemberRow}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    {t.add}
                  </button>
                </div>

                <div className="space-y-3">
                  {members.map((member, index) => (
                    <div
                      key={index}
                      className="flex flex-col md:flex-row gap-3 bg-neutral-900/50 border border-neutral-700/50 rounded-xl p-4"
                    >
                      <div className="flex-1">
                        <label className="block text-xs text-neutral-400 mb-1">
                          {t.memberEmailLabel}
                        </label>
                        <input
                          className="w-full px-3 py-2.5 rounded-xl bg-neutral-950/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          type="email"
                          value={member.email}
                          onChange={(e) =>
                            handleMemberChange(index, 'email', e.target.value)
                          }
                          placeholder={t.emailExamplePlaceholder}
                        />
                      </div>
                      <div className="w-full md:w-40">
                        <label className="block text-xs text-neutral-400 mb-1">
                          {t.roleLabel}
                        </label>
                        <select
                          className="w-full px-3 py-2.5 rounded-xl bg-neutral-950/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
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
                          className="p-2.5 rounded-xl hover:bg-red-900/50 text-red-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title={t.removeMemberTitle}
                        >
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
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

                <p className="text-xs text-neutral-500">{t.membersHelp}</p>
              </section>
            </div>

            {/* Colonne droite : resume & actions */}
            <div className="space-y-6">
              <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-4">
                <h2 className="text-lg font-semibold">{t.summaryTitle}</h2>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between gap-4 py-2 border-b border-neutral-700/50">
                    <span className="text-neutral-400">{t.summaryName}</span>
                    <span className="font-medium truncate max-w-[180px] text-right">
                      {name || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4 py-2 border-b border-neutral-700/50">
                    <span className="text-neutral-400">{t.summaryTag}</span>
                    {shortName ? (
                      <span className="font-mono text-xs bg-neutral-900/50 px-2 py-1 rounded-lg border border-neutral-700/50">
                        {shortName}
                      </span>
                    ) : (
                      <span className="text-neutral-500">—</span>
                    )}
                  </div>
                  <div className="flex justify-between gap-4 py-2 border-b border-neutral-700/50">
                    <span className="text-neutral-400">{t.summaryCountry}</span>
                    <span className="text-neutral-200">{country || '—'}</span>
                  </div>
                  <div className="flex justify-between gap-4 py-2 border-b border-neutral-700/50">
                    <span className="text-neutral-400">{t.summaryCaptain}</span>
                    <span className="text-neutral-200 text-xs font-mono truncate max-w-[140px]">
                      {captainEmail || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4 py-2">
                    <span className="text-neutral-400">{t.summaryMembers}</span>
                    <span className="text-neutral-200">
                      {members.filter((m) => m.email.trim().length > 0).length}{' '}
                      / {members.length}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-neutral-500 pt-2">{t.summaryHelp}</p>
              </section>

              <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-4">
                <h2 className="text-lg font-semibold">{t.actionsTitle}</h2>
                <p className="text-sm text-neutral-400">{t.actionsHint}</p>

                <div className="space-y-3 pt-2">
                  <button
                    type="submit"
                    disabled={submitting || !name.trim()}
                    className="w-full px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        {t.creating}
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 4v16m8-8H4"
                          />
                        </svg>
                        {t.submit}
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => router.push('/admin/teams')}
                    className="w-full px-5 py-3 rounded-xl bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-sm font-medium transition-colors"
                  >
                    {t.cancel}
                  </button>
                </div>
              </section>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

export default AdminNewTeamPage;
