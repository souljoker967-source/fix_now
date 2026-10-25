import * as SecureStore from "expo-secure-store";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Platform } from "react-native";
import API, { setAuthToken } from "../api/api";

export type AccountType = "customer" | "provider";

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  phone: string;
  account_type: AccountType;
};

type SessionContextValue = {
  user: SessionUser | null;
  ready: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<SessionUser>;
  register: (input: {
    name: string;
    email: string;
    phone: string;
    password: string;
    account_type: AccountType;
  }) => Promise<SessionUser>;
  signOut: () => Promise<void>;
  clearError: () => void;
};

const TOKEN_KEY = "fixnow.auth-token";
const SessionContext = createContext<SessionContextValue | null>(null);

function isSessionUser(value: unknown): value is SessionUser {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    Number.isInteger(Number(candidate.id)) &&
    Number(candidate.id) > 0 &&
    typeof candidate.name === "string" &&
    typeof candidate.email === "string" &&
    typeof candidate.phone === "string" &&
    (candidate.account_type === "customer" ||
      candidate.account_type === "provider")
  );
}

async function readToken() {
  return Platform.OS === "web" ? null : SecureStore.getItemAsync(TOKEN_KEY);
}

async function storeToken(token: string | null) {
  if (Platform.OS === "web") return;
  if (token) {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const restoreSession = async () => {
      try {
        const token = await readToken();
        if (!token) return;
        setAuthToken(token);
        const response = await API.get("/auth/me");
        if (!isSessionUser(response.data.user)) {
          throw new Error("The server returned invalid session details.");
        }
        if (active) setUser(response.data.user);
      } catch (restoreError: any) {
        if (restoreError?.response?.status === 401) {
          setAuthToken(null);
          await storeToken(null);
        } else {
          setError(
            restoreError?.response?.data?.message ??
              restoreError?.message ??
              "Unable to restore your session."
          );
        }
      } finally {
        if (active) setReady(true);
      }
    };

    restoreSession();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const interceptorId = API.interceptors.response.use(
      (response) => response,
      (requestError) => {
        if (requestError?.response?.status === 401) {
          setUser(null);
          setAuthToken(null);
          storeToken(null).catch(() => {
            setError("Unable to remove the expired session from secure storage.");
          });
        }
        return Promise.reject(requestError);
      }
    );
    return () => API.interceptors.response.eject(interceptorId);
  }, []);

  const acceptSession = useCallback(async (response: any) => {
    const token = response?.data?.token;
    const sessionUser = response?.data?.user;
    if (typeof token !== "string" || !token || !isSessionUser(sessionUser)) {
      throw new Error("The server did not return a valid authenticated session.");
    }

    try {
      await storeToken(token);
    } catch {
      setAuthToken(null);
      throw new Error("Unable to securely save your session. Please try again.");
    }

    setAuthToken(token);
    setUser(sessionUser);
    setError(null);
    return sessionUser;
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const response = await API.post("/login", { email, password });
      return acceptSession(response);
    },
    [acceptSession]
  );

  const register = useCallback(
    async (input: {
      name: string;
      email: string;
      phone: string;
      password: string;
      account_type: AccountType;
    }) => {
      const response = await API.post("/register", input);
      return acceptSession(response);
    },
    [acceptSession]
  );

  const signOut = useCallback(async () => {
    setUser(null);
    setAuthToken(null);
    setError(null);
    try {
      await storeToken(null);
    } catch {
      setError("Unable to remove the saved session from secure storage.");
      throw new Error("Unable to securely clear your saved session.");
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);
  const value = useMemo(
    () => ({ user, ready, error, signIn, register, signOut, clearError }),
    [user, ready, error, signIn, register, signOut, clearError]
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within a SessionProvider.");
  }
  return context;
}
