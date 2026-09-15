export type RoleName = 'FINAL_USER' | 'TECHNICIAN' | 'ADMIN';

export interface CurrentUser {
  sub: string;
  email: string;
  role: RoleName;
  groupId: string | null;
}

export type AuthProvider = 'LOCAL' | 'LDAP' | 'AD' | 'SERVICE' | 'WHATSAPP' | 'SLACK' | 'TEAMS';

/** Forma devuelta por GET /users/me (y /users, /users/:id) — ver SAFE_USER_SELECT en el backend. */
export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  authProvider: AuthProvider;
  groupId: string | null;
  createdAt: string;
  updatedAt: string;
  role: { id: number; name: RoleName };
}
