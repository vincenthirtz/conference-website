import { useEffect, useMemo, useState } from 'react';
import { supabaseClient } from '@/utils/supabase';
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
  const [casters, setCasters] = useState<AvailableCaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const {
          data: { session },
        } = await supabaseClient.auth.getSession();
        const token = session?.access_token;
        if (!token) throw new Error('Session staff manquante.');

        const res = await fetch('/api/admin/cast-members/available-casters', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.error || 'Chargement impossible.');
        }
        if (!cancelled) {
          setCasters(json.items ?? []);
        }
      } catch (err: unknown) {
        logger.error('CastMemberStaffPicker load error', err);
        if (!cancelled) {
          setError((err as Error)?.message || 'Erreur de chargement.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
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
      <label className="block text-sm text-neutral-300 mb-1">
        Compte staff caster lié
      </label>
      <select
        value={value ?? ''}
        onChange={handleChange}
        disabled={disabled || loading}
        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm disabled:opacity-50"
      >
        <option value="">— Aucun (fiche publique seule) —</option>
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
          ? 'Chargement des casters…'
          : error
            ? `Erreur : ${error}`
            : 'Seuls les comptes staff avec le rôle "caster" peuvent être liés. Un caster ne peut être rattaché qu’à une seule fiche.'}
      </p>
    </div>
  );
}
