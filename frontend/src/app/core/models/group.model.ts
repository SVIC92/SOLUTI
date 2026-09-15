/** Forma devuelta por GET /support-groups. */
export interface SupportGroup {
  id: string;
  name: string;
  members?: { id: string; fullName: string }[];
}
