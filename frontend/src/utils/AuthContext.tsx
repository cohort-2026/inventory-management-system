import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

type User = { username: string; email: string } | null;
type AuthSession = { accessToken: string };
type ApiUser = { username?: string; email?: string };

type AuthContextType = {
    user: User;
    loading: boolean;
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, username: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
};

const API_URL = `${import.meta.env.VITE_API_URL}/api/auth`;
const SESSION_KEY = "inventory-auth-session";

function readSession(): AuthSession | null {
    try {
        const savedSession = sessionStorage.getItem(SESSION_KEY);
        if (!savedSession) return null;
        const parsed: unknown = JSON.parse(savedSession);
        if (
            typeof parsed === "object" &&
            parsed !== null &&
            "accessToken" in parsed &&
            typeof parsed.accessToken === "string"
        ) {
            return { accessToken: parsed.accessToken };
        }
        sessionStorage.removeItem(SESSION_KEY);
        return null;
    } catch {
        return null;
    }
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
    login: async () => {},
    register: async () => {},
    logout: async () => {}
});

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User>(null);
    const [session, setSession] = useState<AuthSession | null>(readSession);
    const [loading, setLoading] = useState(() => Boolean(readSession()));

    useEffect(() => {
        if (!session) {
            setUser(null);
            setLoading(false);
            return;
        }

        let active = true;
        fetch(`${API_URL}/me`, {
            headers: { Authorization: `Bearer ${session.accessToken}` },
        })
            .then(async (response) => {
                if (!response.ok) {
                    sessionStorage.removeItem(SESSION_KEY);
                    setSession(null);
                    setUser(null);
                    return;
                }
                const result: { user: ApiUser } = await response.json();
                if (active) {
                    const email = result.user.email ?? "";
                    setUser({
                        username: result.user.username || email,
                        email,
                    });
                }
            })
            .catch((error: unknown) => {
                console.error("Unable to restore authentication session:", error);
                if (active) setUser(null);
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, [session]);

    async function login(email: string, password: string) {
        const res = await fetch(`${API_URL}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });

        const result = await res.json();
        if (!res.ok) {
            throw new Error(result.message || "Login failed");
        }

        const authSession = result.session as { access_token?: unknown } | undefined;
        if (typeof authSession?.access_token !== "string" || !result.user) {
            throw new Error("The server returned an invalid login session.");
        }

        const nextSession = { accessToken: authSession.access_token };
        try {
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
        } catch {
            throw new Error("Could not save the sign-in session in this browser.");
        }
        setSession(nextSession);
        setUser({
            username: result.user.username || email,
            email: result.user.email || email,
        });
    }

    async function register(email: string, username: string, password: string) {
        const res = await fetch(`${API_URL}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, username, password }),
        });

        const result = await res.json();
        if (!res.ok) {
            throw new Error(result.message || "Registration failed");
        }
    }

    async function logout() {
        sessionStorage.removeItem(SESSION_KEY);
        setSession(null);
        setUser(null);
    }

    return (
        <AuthContext.Provider value={{ user, loading, login, register, logout }}>
            {children}
        </AuthContext.Provider>
    );
}


export function useAuth() {
    return useContext(AuthContext);
}