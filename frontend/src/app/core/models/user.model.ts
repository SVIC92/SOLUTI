export type RoleName = 'FINAL_USER' | 'TECHNICIAN' | 'ADMIN';

export interface CurrentUser {
  sub: string;
  email: string;
  role: RoleName;
  groupId: string | null;
}
