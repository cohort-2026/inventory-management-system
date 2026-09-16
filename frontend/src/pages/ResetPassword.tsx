import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

const ResetPassword: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const email =
    location.state?.email || "you@business.com";

  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [message, setMessage] = useState("");

  const handleSubmit = (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    if (otp.length !== 6) {
      setMessage("Please enter the 6-digit OTP.");
      return;
    }

    if (newPassword.length < 6) {
      setMessage(
        "Password must be at least 6 characters."
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setMessage("Password changed successfully!");

    setTimeout(() => {
      navigate("/login");
    }, 1500);
  };

  return (
    <div className="login-container">
      <div className="login-card">

        <h2>▪ INVENTORY APP</h2>

        <p className="welcome">
          Reset your password
        </p>

        <p className="confirmation-text">
          A 6-digit OTP was sent to:
        </p>

        <p className="confirmation-email">
          {email}
        </p>

        <form onSubmit={handleSubmit}>

          <label>OTP</label>

          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={otp}
            onChange={(e) => {
              const value = e.target.value;

              if (/^\d*$/.test(value)) {
                setOtp(value);
              }
            }}
            className="otp-input"
          />

          <label>New Password</label>

          <input
            type="password"
            placeholder="Enter new password"
            value={newPassword}
            onChange={(e) =>
              setNewPassword(e.target.value)
            }
          />

          <label>Confirm Password</label>

          <input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) =>
              setConfirmPassword(e.target.value)
            }
          />

          <button type="submit">
            Reset Password
          </button>

        </form>

        {message && (
          <p className="reset-message">
            {message}
          </p>
        )}

        <Link to="/login" className="back-login">
          ← Back to Sign In
        </Link>

      </div>
    </div>
  );
};

export default ResetPassword;