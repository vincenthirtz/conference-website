// components/admin/documents/DrivePrivateKeyForm.tsx
//
// Colle la clé privée du compte de service Google, qui part chiffrée en base
// (`integration_secrets`) plutôt qu'en variable d'environnement.
//
// POURQUOI un écran plutôt qu'une variable : Netlify plafonne l'ENSEMBLE des
// variables d'environnement d'une fonction à 4 Ko en mode compatibilité Lambda.
// La clé pèse 1,7 Ko, et le budget était déjà presque plein : l'y mettre a fait
// échouer la création des dix-neuf fonctions cron, et le déploiement entier
// avec — deux fois, le 2026-09-01.
//
// La valeur n'est JAMAIS renvoyée par le serveur, ni journalisée, ni relue ici
// après enregistrement : on ne peut que la remplacer.

import { useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminDocuments from '@/lib/i18n/locales/admin-fr/adminDocuments';

export default function DrivePrivateKeyForm({
  onStored,
}: {
  onStored: () => void;
}) {
  const t = useAdminT(nsAdminDocuments);
  const { adminFetchJson } = useAdminFetch();
  const { addToast } = useToast();
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await adminFetchJson('/api/admin/documents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privateKey: value }),
      });
      // Vidé sitôt envoyé : laisser une clé privée dans un champ de formulaire
      // la laisse dans le DOM, et dans la restauration de session du navigateur.
      setValue('');
      addToast(t.keySaved, 'success');
      onStored();
    } catch (err) {
      // Le serveur explique les refus qui se corrigent (valeur mal collée,
      // SECRETS_ENC_KEY absente) : un message générique ferait chercher au
      // mauvais endroit.
      const message = err instanceof Error ? err.message : '';
      addToast(message || t.keyError, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <h2 className="text-lg font-semibold text-white">{t.keyTitle}</h2>
      <p className="mt-2 text-sm text-neutral-300">{t.keyIntro}</p>
      <p className="mt-2 text-xs text-neutral-500">{t.keyHowTo}</p>

      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={6}
        spellCheck={false}
        autoComplete="off"
        placeholder={t.keyPlaceholder}
        className="mt-4 w-full rounded-xl border border-white/10 bg-neutral-950 p-3 font-mono text-xs text-neutral-200 placeholder:text-neutral-600 focus:border-purple-500/50 focus:outline-none"
      />

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || value.trim().length === 0}
          className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-500 disabled:opacity-50"
        >
          {saving ? t.keySaving : t.keySave}
        </button>
      </div>

      <p className="mt-4 border-t border-white/10 pt-4 text-xs text-neutral-500">
        {t.keyWhyHere}
      </p>
    </div>
  );
}
