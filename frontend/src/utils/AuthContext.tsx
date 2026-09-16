
import {
  createContext,
  useContext,
  useState,
  ReactNode,
} from "react";

type User = {
  username: string;
  email: string;
  phone: string;
  role: "admin" | "staff";
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  forgotPassword: (
    email: string,
    phone: string
  ) => Promise<boolean>;
};

const AuthContext = createContext<AuthContextType | undefined>(
  undefined
);

type AuthProviderProps = {
  children: ReactNode;
};

export const AuthProvider = ({
  children,
}: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);

  const login = async (
    email: string,
    password: string
  ): Promise<boolean> => {
    setLoading(true);

    try {
      if (
        email === "admin@example.com" &&
        password === "Admin123"
      ) {
        setUser({
          username: "Admin",
          email: "admin@example.com",
          phone: "0712345678",
          role: "admin",
        });

        return true;
      }

      if (
        email === "staff@example.com" &&
        password === "Staff123"
      ) {
        setUser({
          username: "Staff",
          email: "staff@example.com",
          phone: "0723456789",
          role: "staff",
        });

        return true;
      }

      return false;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
  };

  const forgotPassword = async (
    email: string,
    phone: string
  ): Promise<boolean> => {
    setLoading(true);

    try {
      const users = [
        {
          email: "admin@example.com",
          phone: "0712345678",
        },
        {
          email: "staff@example.com",
          phone: "0723456789",
        },
      ];

      const foundUser = users.find((account) => {
        const emailMatch =
          email.trim() !== "" &&
          account.email.toLowerCase() ===
            email.trim().toLowerCase();

        const phoneMatch =
          phone.trim() !== "" &&
          account.phone === phone.trim();

        return emailMatch || phoneMatch;
      });

      if (!foundUser) {
        return false;
      }

      console.log(
        "Password reset requested for:",
        foundUser.email
      );

      return true;
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        forgotPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error(
      "useAuth must be used inside AuthProvider"
    );
  }

  return context;
};
