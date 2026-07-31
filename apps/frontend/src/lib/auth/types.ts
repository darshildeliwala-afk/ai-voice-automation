export interface AuthUser {
  id: string;
  email: string;
  workspaceId: string;
  role: string;
}

export interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    workspaceId: string;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
    lastLoginAt: string | null;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
  };
}
