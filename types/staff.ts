import type { User } from '@supabase/supabase-js';
import type { StaffRole } from './admin';

export type StaffMember = {
  id: string;
  auth_user_id: string;
  email: string;
  role: StaffRole;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
};

export type StaffContext = {
  user: User | null;
  staff: StaffMember | null;
  role: StaffRole | null;
};
