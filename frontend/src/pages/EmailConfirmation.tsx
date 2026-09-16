import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

const EmailConfirmation: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Get email passed from the Register page
  const email =
    location.state?.email || "you@business.com";

  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState("");

  const handleOtpChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = e.target.value;

    // Only allow numbers
    if (/^\d*$/.test(value) && value.length <= 6) {
      setOtp(value);
      setMessage("");
    }
  };

  const handleVerify = (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    if (otp.length !== 6) {
      setMessage("Please enter the 6-digit OTP.");
      return;
    }

    // Temporary verification
    // Later this will connect to your backend
    setMessage("Email verified successfully!");

    setTimeout(() => {
      navigate("/login");
    }, 1500);
  };

  const resendOtp = () => {
    setMessage("A new OTP has been sent to your email.");
  };

  return (
    <div className="login-container">
      <div className="login-card">

        <h2>▪ INVENTORY APP</h2>

        <p className="welcome">
          Confirm your registration
        </p>

        <p className="confirmation-text">
          We sent a 6-digit verification code to:
        </p>

        <p className="confirmation-email">
          {email}
        </p>

        <form onSubmit={handleVerify}>

          <label>Enter OTP</label>

          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={otp}
            onChange={handleOtpChange}
            className="otp-input"
          />

          <button type="submit">
            Verify Email
          </button>

        </form>

        {message && (
          <p className="reset-message">
            {message}
          </p>
        )}

        <p className="resend-text">
          Didn't receive the code?
        </p>

        <button
          type="button"
          className="resend-button"
          onClick={resendOtp}
        >
          Resend OTP
        </button>

        <Link to="/login" className="back-login">
          ← Back to Sign In
        </Link>

      </div>
    </div>
  );
};

export default EmailConfirmation;