import React, { useState, useEffect } from "react";
import DashboardPage from "./pages/DashboardPage";
import ProjectDetailPage from "./pages/ProjectDetailPage";
import ChatSessionPage from "./pages/ChatSessionPage";
import AdminPanelPage from "./pages/AdminPanelPage";
import Layout from "./components/Layout";
import { api } from "./api";

export default function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [currentView, setView] = useState("dashboard");
  const [activeProject, setActiveProject] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authError, setAuthError] = useState("");

  // Check auth state on mount and trigger auto-login if needed
  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");

    const triggerAutoLogin = () => {
      setCheckingAuth(true);
      api.login("admin@ragbot.com", "admin123")
        .then((data) => {
          setUser(data.user);
          setToken(data.access_token);
          setAuthError("");
        })
        .catch((err) => {
          console.error("Auto login failed:", err);
          setAuthError("Failed to authenticate with backend API. Please make sure the backend is running.");
        })
        .finally(() => {
          setCheckingAuth(false);
        });
    };

    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
      
      // Verify token is still valid with backend
      api.getCurrentUser()
        .then((userData) => {
          setUser(userData);
          localStorage.setItem("user", JSON.stringify(userData));
          setCheckingAuth(false);
        })
        .catch(() => {
          // Token expired or invalid
          api.logout();
          triggerAutoLogin();
        });
    } else {
      triggerAutoLogin();
    }
  }, []);

  if (checkingAuth) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#0b0f19",
        color: "var(--text-secondary)",
        gap: "1rem"
      }}>
        <div className="typing-indicator">
          <div className="typing-dot"></div>
          <div className="typing-dot"></div>
          <div className="typing-dot"></div>
        </div>
        <div style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>
          Connecting to API server and authenticating...
        </div>
      </div>
    );
  }

  if (authError || !user) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#0b0f19",
        color: "var(--text-secondary)",
        padding: "2rem",
        textAlign: "center"
      }}>
        <div style={{
          backgroundColor: "rgba(239, 68, 68, 0.15)",
          border: "1px solid var(--danger)",
          color: "var(--danger)",
          padding: "1rem 1.5rem",
          borderRadius: "var(--radius-sm)",
          maxWidth: "480px",
          marginBottom: "1.5rem"
        }}>
          {authError || "Authentication required."}
        </div>
        <button 
          onClick={() => window.location.reload()} 
          className="btn btn-primary"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  // Render current active view
  const renderView = () => {
    switch (currentView) {
      case "dashboard":
        return (
          <DashboardPage 
            setView={setView} 
            setActiveProject={setActiveProject} 
          />
        );
      case "project-detail":
        if (!activeProject) {
          setView("dashboard");
          return null;
        }
        return (
          <ProjectDetailPage 
            activeProject={activeProject} 
            setActiveProject={setActiveProject} 
          />
        );
      case "chat":
        if (!activeProject) {
          setView("dashboard");
          return null;
        }
        return (
          <ChatSessionPage 
            activeProject={activeProject} 
          />
        );
      case "admin":
        if (user.role !== "admin") {
          setView("dashboard");
          return null;
        }
        return <AdminPanelPage />;
      default:
        return (
          <DashboardPage 
            setView={setView} 
            setActiveProject={setActiveProject} 
          />
        );
    }
  };

  return (
    <Layout 
      currentView={currentView} 
      setView={setView} 
      activeProject={activeProject} 
      user={user}
    >
      {renderView()}
    </Layout>
  );
}
