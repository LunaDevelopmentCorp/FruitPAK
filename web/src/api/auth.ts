import api from "./client";

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: {
    id: string;
    email: string;
    full_name: string;
    phone: string | null;
    role: string;
    is_active: boolean;
    enterprise_id: string | null;
    is_onboarded: boolean;
    permissions: string[];
    assigned_packhouses: string[] | null;
  };
}

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>("/auth/login", payload);
  return data;
}

export async function getMe(): Promise<LoginResponse["user"]> {
  const { data } = await api.get<LoginResponse["user"]>("/auth/me");
  return data;
}
