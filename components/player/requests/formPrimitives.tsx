// components/player/requests/formPrimitives.tsx
//
// Primitives de présentation partagées par les formulaires de la page
// « Demandes » (transfert / scrim). Extraites de pages/player/requests.tsx
// sans changement de comportement.

import { useT } from '@/lib/i18n/useT';

export function MessageField({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
}) {
  const t = useT('playerRequests');
  return (
    <div>
      <label className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400/80 transition resize-none"
        placeholder={placeholder || t.defaultMsgPlaceholder}
        maxLength={1000}
      />
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      id="requests-error"
      role="alert"
      className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100"
    >
      {message}
    </div>
  );
}

export function SubmitButton({
  disabled,
  loading,
  label,
  color = 'purple',
}: {
  disabled: boolean;
  loading: boolean;
  label: string;
  color?: 'purple' | 'blue';
}) {
  const t = useT('playerRequests');
  const gradient =
    color === 'blue'
      ? 'bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-400 hover:to-cyan-400'
      : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400';

  return (
    <button
      type="submit"
      disabled={disabled}
      className={`w-full px-4 py-3 rounded-xl font-semibold transition ${
        disabled ? 'bg-gray-600 cursor-not-allowed' : gradient
      }`}
    >
      {loading ? t.sending : label}
    </button>
  );
}
