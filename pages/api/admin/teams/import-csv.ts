// pages/api/admin/teams/import-csv.ts — module features/admin/teams (docs/PLAN-industrialisation-admin.md).

export { default } from '@/features/admin/teams/routes/importCsv';

// Corps CSV jusqu'à 2 Mo (Next lit `config` dans le fichier de page).
export const config = { api: { bodyParser: { sizeLimit: '2mb' } } };
