import React, { useState } from "react";
import { Globe, Lock, Mail, ArrowRight, Eye, EyeOff } from "lucide-react";
import { api } from "../api";

export default function LoginPage({ onLoginSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      if (isLogin) {
        const response = await api.login(email, password);
        onLoginSuccess(response.user);
      } else {
        const response = await api.signup(email, password);
        onLoginSuccess(response.user);
      }
    } catch (err) {
      setError(err.message || "Authentication failed. Please check credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "radial-gradient(circle at 10% 20%, rgba(13, 148, 136, 0.15) 0%, rgba(9, 15, 25, 0) 40%), radial-gradient(circle at 90% 80%, rgba(99, 102, 241, 0.15) 0%, rgba(9, 15, 25, 0) 40%), var(--bg-primary)",
      padding: "1.5rem"
    }}>
      <div className="glass-panel" style={{
        maxWidth: "420px",
        width: "100%",
        padding: "2.5rem",
        borderRadius: "var(--radius-lg)"
      }}>
        {/* App Logo */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{
            display: "inline-flex",
            background: "linear-gradient(135deg, var(--primary), var(--secondary))",
            padding: "0.75rem",
            borderRadius: "var(--radius-md)",
            color: "#ffffff",
            marginBottom: "1rem",
            boxShadow: "var(--shadow-lg)"
          }}>
            <Globe size={32} />
          </div>
          <h1 style={{ fontSize: "2rem", marginBottom: "0.25rem", fontWeight: "800" }}>
            {isLogin ? "Welcome Back" : "Get Started"}
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
            {isLogin ? "Access your custom Website RAG Knowledgebases" : "Create an account to crawl & chat with websites"}
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div style={{
            backgroundColor: "rgba(239, 68, 68, 0.15)",
            border: "1px solid var(--danger)",
            color: "var(--danger)",
            padding: "0.75rem 1rem",
            borderRadius: "var(--radius-sm)",
            fontSize: "0.875rem",
            marginBottom: "1.5rem"
          }}>
            {error}
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="email">Email Address</label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}>
                <Mail size={16} />
              </span>
              <input
                id="email"
                type="email"
                className="form-input"
                style={{ paddingLeft: "2.5rem" }}
                placeholder="you@domain.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: "1.75rem" }}>
            <label className="form-label" htmlFor="password">Password</label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}>
                <Lock size={16} />
              </span>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                className="form-input"
                style={{ paddingLeft: "2.5rem", paddingRight: "2.5rem" }}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute",
                  right: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-muted)"
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%", padding: "0.875rem", borderRadius: "var(--radius-sm)", marginBottom: "1.5rem" }}
            disabled={loading}
          >
            <span>{loading ? "Authenticating..." : isLogin ? "Sign In" : "Sign Up"}</span>
            {!loading && <ArrowRight size={16} />}
          </button>
        </form>

        {/* Auth Toggle */}
        <div style={{ textAlign: "center", fontSize: "0.875rem", color: "var(--text-secondary)" }}>
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError("");
            }}
            style={{
              background: "none",
              border: "none",
              color: "var(--primary-light)",
              fontWeight: "600",
              cursor: "pointer",
              textDecoration: "underline"
            }}
          >
            {isLogin ? "Create Account" : "Sign In instead"}
          </button>
        </div>

        {/* Demo Credentials Alert */}
        {isLogin && (
          <div style={{
            marginTop: "1.5rem",
            padding: "0.75rem",
            backgroundColor: "var(--bg-tertiary)",
            border: "1px dashed var(--border-color)",
            borderRadius: "var(--radius-sm)",
            fontSize: "0.75rem",
            color: "var(--text-muted)"
          }}>
            <strong>Seed Admin Details:</strong> admin@ragbot.com / admin123
            <br />
            <strong>Seed User Details:</strong> user@ragbot.com / user123
          </div>
        )}
      </div>
    </div>
  );
}
