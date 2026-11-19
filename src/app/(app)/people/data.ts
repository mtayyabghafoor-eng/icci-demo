// Lists the people screens need: person roles and sections. Reads as the
// signed-in admin, so the database's own rules apply.
import type { SupabaseClient } from "@supabase/supabase-js";

export type ListEntry = { id: string; name: string; active: boolean; needs_vetting?: boolean };

export async function loadPeopleLists(supabase: SupabaseClient) {
  const [roles, sections] = await Promise.all([
    supabase.from("person_roles").select("id, name, active, needs_vetting").order("name"),
    supabase.from("sections").select("id, name, active").order("name"),
  ]);
  const r = (roles.data ?? []) as ListEntry[];
  const s = (sections.data ?? []) as ListEntry[];
  return {
    roles: r,
    sections: s,
    roleName: new Map(r.map((x) => [x.id, x.name])),
    sectionName: new Map(s.map((x) => [x.id, x.name])),
  };
}

export const PERSON_COLUMNS = "id, full_name, person_role_id, section_id, phone, email, start_date, active, app_user_id, created_at, updated_at";

export type PersonRow = {
  id: string;
  full_name: string;
  person_role_id: string;
  section_id: string;
  phone: string | null;
  email: string | null;
  start_date: string | null;
  active: boolean;
  /** P2.2: the admin account this person is, if any (set by a Super Admin). */
  app_user_id: string | null;
  created_at: string;
  updated_at: string;
};
