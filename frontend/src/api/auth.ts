import { api } from "./client";

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export function login(username: string, password: string) {
  return api.post<TokenResponse>("/api/auth/login", { username, password });
}
