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
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import { CARD, CARD_TITLE } from '@/features/admin/stages/ui/rubanClasses';

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
    <div className={`max-w-3xl ${CARD}`}>
      <h2 className={`${CARD_TITLE} font-semibold`}>{t.keyTitle}</h2>
      <p className="mt-2 text-sm text-neutral-300">{t.keyIntro}</p>
      <p className="mt-2 text-xs text-neutral-500">{t.keyHowTo}</p>

      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={6}
        spellCheck={false}
        autoComplete="off"
        placeholder={t.keyPlaceholder}
        className="mt-4 w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] p-3 font-mono text-xs text-[var(--t1,#f4edf7)] placeholder:text-[var(--t4,#807984)] focus:border-[var(--or,#b467d1)] focus:outline-none"
      />

      <div className="mt-4 flex items-center gap-3">
        <AdminButton
          variant="primary"
          size="sm"
          onClick={() => void save()}
          disabled={saving || value.trim().length === 0}
        >
          {saving ? t.keySaving : t.keySave}
        </AdminButton>
      </div>

      <p className="mt-4 border-t border-[var(--line,rgba(194,196,201,.12))] pt-4 text-xs text-[var(--t4,#807984)]">
        {t.keyWhyHere}
      </p>
    </div>
  );
}
