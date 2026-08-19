import { useCallback, useEffect, useState } from "react";
import { login as loginRequest } from "../api/auth";
import { ApiRequestError } from "../api/client";
import { clearToken, getToken, setToken, setUnauthorizedHandler } from "../api/client";

export function useAuth() {
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [error, setError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  // Any 401 from anywhere in the app (expired/invalid token) drops back to the login
  // screen — client.ts calls this instead of every hook checking response status itself.
  useEffect(() => {
    setUnauthorizedHandler(() => setTokenState(null));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setLoggingIn(true);
    setError(null);
    try {
      const res = await loginRequest(username, password);
      setToken(res.access_token);
      setTokenState(res.access_token);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not reach the server.");
    } finally {
      setLoggingIn(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setTokenState(null);
  }, []);

  return { isAuthenticated: token !== null, login, logout, loggingIn, error, clearError: () => setError(null) };
}
