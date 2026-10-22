
import { Router } from "express";
import type { Request, Response } from "express";

import { supabaseAdmin, supabaseAuth } from "../config/supabaseAuthClient";
import {
  supabaseRequireAuth,
  type AuthenticatedRequest,
} from "../auth/supabaseRequireAuth";

const router = Router();
const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "");

router.post(
  "/register",
  async (req: Request, res: Response): Promise<void> => {
    const { email, password, username } = req.body ?? {};

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      typeof username !== "string" ||
      !email.trim() ||
      !username.trim() ||
      password.length < 8
    ) {
      res.status(400).json({
        message: "Enter an email, username, and password of at least 8 characters.",
      });
      return;
    }

    const { data, error } = await supabaseAuth.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { username: username.trim() } },
    });

    if (error) {
      res.status(400).json({ message: error.message });
      return;
    }

    res.status(201).json({
      message: "Registration submitted. Check your email if confirmation is required.",
      user: data.user
        ? {
            id: data.user.id,
            email: data.user.email,
            username: data.user.user_metadata?.username ?? username.trim(),
          }
        : null,
      session: data.session,
    });
  }
);

router.post(
  "/login",
  async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body ?? {};

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      res.status(400).json({
        message: "Email and password are required.",
      });
      return;
    }

    const { data, error } =
      await supabaseAuth.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

    if (error || !data.user || !data.session) {
      res.status(401).json({
        message: "Invalid credentials or email confirmation required.",
      });
      return;
    }

    res.status(200).json({
      message: "Login successful.",
      user: {
        id: data.user.id,
        email: data.user.email,
        username: data.user.user_metadata?.username ?? data.user.email,
        role: data.user.app_metadata?.role ?? null,
      },
      session: data.session,
    });
  }
);

router.get(
  "/me",
  supabaseRequireAuth,
  (req: AuthenticatedRequest, res: Response): void => {
    res.status(200).json({ user: req.authenticatedUser });
  }
);

router.post(
  "/password-reset",
  async (req: Request, res: Response): Promise<void> => {
    const { email } = req.body ?? {};
    if (typeof email !== "string" || !email.trim()) {
      res.status(400).json({ error: "A valid email address is required." });
      return;
    }

    try {
      const { error } = await supabaseAuth.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${frontendUrl}/reset-password`,
      });

      if (error) {
        console.error("Password recovery request failed:", error.message);
        res.status(503).json({ error: "Password recovery is temporarily unavailable." });
        return;
      }

      res.status(200).json({
        message: "If an account exists for that email, password reset instructions will be sent.",
      });
    } catch (error) {
      console.error("Unexpected password recovery error:", error);
      res.status(503).json({ error: "Password recovery is temporarily unavailable." });
    }
  }
);

router.post(
  "/reset-password",
  async (req: Request, res: Response): Promise<void> => {
    const { accessToken, password } = req.body ?? {};
    if (
      typeof accessToken !== "string" ||
      !accessToken.trim() ||
      typeof password !== "string" ||
      password.length < 8
    ) {
      res.status(400).json({
        error: "A valid reset link and password of at least 8 characters are required.",
      });
      return;
    }

    try {
      const { data, error } = await supabaseAuth.auth.getUser(accessToken);
      if (error || !data.user) {
        res.status(400).json({
          error: "This password reset link is invalid or expired. Request a new one.",
        });
        return;
      }

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        data.user.id,
        { password },
      );
      if (updateError) {
        console.error("Password update failed:", updateError.message);
        res.status(503).json({
          error: "Password could not be updated. Please request a new reset link.",
        });
        return;
      }

      res.status(200).json({
        message: "Password updated. You can now sign in with your new password.",
      });
    } catch (error) {
      console.error("Unexpected password update error:", error);
      res.status(503).json({ error: "Password recovery is temporarily unavailable." });
    }
  }
);

export default router;
