
import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helloRoute from "./routes/hello";
import loginRoute from "./routes/login";
import registerRoute from "./routes/register";
import supabaseAuthRoutes from "./routes/supabaseAuthRoutes";
import {
  supabaseRequireAuth,
  supabaseRequireRoles,
  type AuthenticatedRequest,
} from "./auth/supabaseRequireAuth";

const app = express();

app.disable("x-powered-by");
app.use(express.json());
const configuredFrontendOrigin = new URL(
  process.env.FRONTEND_URL || "http://localhost:5173",
).origin;
app.use(cors({
  origin: [
    configuredFrontendOrigin,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
  ],
  credentials: true,
}));
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", supabaseAuthRoutes);
app.use("/api", helloRoute);
app.use("/api", loginRoute);
app.use("/api", registerRoute);

// Any authenticated user
app.get("/api/protected", supabaseRequireAuth, (req, res) => {
  res.json({ message: "Authenticated", user: (req as AuthenticatedRequest).authenticatedUser });
});

// Only staff and administrators
app.get(
  "/api/inventory",
  supabaseRequireAuth,
  supabaseRequireRoles("manager", "inventory_staff"),
  (req, res) => {
    res.json({ message: "Inventory access granted." });
  }
);

// Only administrators
app.get(
  "/api/admin",
  supabaseRequireAuth,
  supabaseRequireRoles("manager"),
  (_req, res) => {
    res.json({ message: "Administrator access granted." });
  }
);

const port = Number(process.env.PORT) || 5000;

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
