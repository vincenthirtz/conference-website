import { useEffect, useMemo, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { logger } from '../../utils/logger';

type AvailableCaster = {
  authUserId: string;
  displayName: string | null;
  email: string;
  avatarUrl: string | null;
  linkedCastMemberId: string | null;
};

type Props = {
  value: string | null;
  currentCastMemberId?: string | null;
  onChange: (next: string | null) => void;
  disabled?: boolean;
};

export default function CastMemberStaffPicker({
  value,
  currentCastMemberId,
  onChange,
  disabled,
}: Props) {
  const { adminFetchJson } = useAdminFetch();
  const t = useAdminT('adminCastMemberStaffPicker');
  const [casters, setCasters] = useState<AvailableCaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const json = await adminFetchJson<{ items?: AvailableCaster[] }>(
          '/api/admin/cast-members/available-casters'
        );
        if (!cancelled) {
          setCasters(json.items ?? []);
        }
      } catch (err: unknown) {
        logger.error('CastMemberStaffPicker load error', err);
        if (!cancelled) {
          setError((err as Error)?.message || t.loadError);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectableCasters = useMemo(() => {
    return casters.filter((c) => {
      // Exclure les casters deja lies a une AUTRE fiche
      if (
        c.linkedCastMemberId &&
        c.linkedCastMemberId !== currentCastMemberId
      ) {
        return false;
      }
      return true;
    });
  }, [casters, currentCastMemberId]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    onChange(next === '' ? null : next);
  };

  return (
    <div>
      <label className="block text-sm text-neutral-300 mb-1">{t.label}</label>
      <select
        value={value ?? ''}
        onChange={handleChange}
        disabled={disabled || loading}
        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm disabled:opacity-50"
      >
        <option value="">{t.none}</option>
        {selectableCasters.map((c) => {
          const label =
            c.displayName && c.displayName.trim()
              ? `${c.displayName} (${c.email})`
              : c.email;
          return (
            <option key={c.authUserId} value={c.authUserId}>
              {label}
            </option>
          );
        })}
      </select>
      <p className="text-xs text-neutral-500 mt-1">
        {loading
          ? t.loading
          : error
            ? format(t.errorPrefix, { error })
            : t.hint}
      </p>
    </div>
  );
}
