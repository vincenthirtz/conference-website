// features/admin/pilotage/client.ts

import { adminRequest } from '@/utils/admin/adminHttp';
import type { Pilotage } from './schemas';

export const pilotageClient = {
  get: () => adminRequest<Pilotage>('/api/admin/pilotage'),
};
