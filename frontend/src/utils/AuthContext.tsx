import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type User = { username: string } | null;

type AuthContextType = {
    user: User;
    loading: boolean;
};

const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("http://localhost:5000/api/me", { credentials: "include" })
            .then((res) => (res.ok ? res.json() :null))
            .then((data) => setUser(data ? data.user :null))
            .finally(() => setLoading(false));
    }, []);

    return (
        <AuthContext.Provider value={{ user, loading }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}