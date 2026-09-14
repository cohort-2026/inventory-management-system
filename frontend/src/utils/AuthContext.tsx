import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { data, useNavigate } from "react-router-dom";

type User = { username: string } | null;

type AuthContextType = {
    user: User;
    loading: boolean;
    login: (username: string, password: string) => Promise<void>;
    register: (username: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
    login: async () => {},
    register: async () => {},
    logout: async () => {}
});

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("http://localhost:5000/api/me", { credentials: "include" })
            .then((res) => (res.ok ? res.json() :null))
            .then((data) => setUser(data ? data.user :null))
            .finally(() => setLoading(false));
    }, []);

    async function login(username: string, password: string) {
        const res = await fetch("http://localhost:5000/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ username, password }),
        });
    
        if (!res.ok) {
          const data = await res.json();
          console.log("Login failed");
          throw new Error(data.error || "Login failed");
        }
    
        setUser({ username });
    }

    async function register(username: string, password: string) {
        const res = await fetch("http://localhost:5000/api/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ username, password }),
        });

        if (!res.ok) {
            const data = await res.json();
            console.log("Registration failed");
            throw new Error(data.error || "Registration failed");
        }

        setUser({ username });
    }

    async function logout() {
        await fetch("http://localhost:5000/api/logout", {
            method: "POST",
            credentials: "include",
        });
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