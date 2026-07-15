import React, { useState, useEffect } from "react";
import { 
  LayoutDashboard, 
  Layers, 
  MessageSquare, 
  ShieldCheck, 
  Sun, 
  Moon, 
  Menu, 
  X, 
  Globe
} from "lucide-react";
import { api } from "../api";

export default function Layout({ 
  children, 
  currentView, 
  setView, 
  activeProject, 
  user
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    // Check local storage or document class for initial theme state
    const isLight = document.body.classList.contains("theme-light");
    setTheme(isLight ? "light" : "dark");
  }, []);

  const toggleTheme = () => {
    if (theme === "dark") {
      document.body.classList.add("theme-light");
      setTheme("light");
    } else {
      document.body.classList.remove("theme-light");
      setTheme("dark");
    }
  };

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  ];

  if (activeProject) {
    navItems.push({ id: "project-detail", label: "Project Settings", icon: Layers });
    navItems.push({ id: "chat", label: "RAG Playground", icon: MessageSquare });
  }

  if (user && user.role === "admin") {
    navItems.push({ id: "admin", label: "Admin Panel", icon: ShieldCheck });
  }

  return (
    <div className="app-container">
      {/* Mobile Header */}
      <div className="header" style={{ display: "none" }}>
        <button 
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="btn btn-secondary"
          style={{ padding: "0.5rem" }}
        >
          {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Globe className="text-primary-light" size={24} />
          <h2 style={{ fontSize: "1.125rem", margin: 0 }}>RAGBot</h2>
        </div>
      </div>

      {/* Sidebar Navigation */}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`} style={{ padding: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "2rem" }}>
          <div style={{
            background: "linear-gradient(135deg, var(--primary), var(--secondary))",
            padding: "0.5rem",
            borderRadius: "var(--radius-sm)",
            color: "#fff"
          }}>
            <Globe size={24} />
          </div>
          <div>
            <h2 style={{ fontSize: "1.25rem", margin: 0, fontWeight: "800", background: "linear-gradient(to right, #0d9488, #6366f1)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              RAGBot
            </h2>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block" }}>Platform v1.0</span>
          </div>
        </div>

        <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setView(item.id);
                  setSidebarOpen(false);
                }}
                className="btn"
                style={{
                  width: "100%",
                  justifyContent: "flex-start",
                  backgroundColor: isActive ? "var(--primary)" : "transparent",
                  color: isActive ? "#ffffff" : "var(--text-secondary)",
                  border: "none",
                  padding: "0.75rem 1rem",
                  borderRadius: "var(--radius-sm)",
                  boxShadow: isActive ? "var(--shadow-glow)" : "none"
                }}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "1rem", marginTop: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis" }}>
              <div style={{ fontSize: "0.875rem", fontWeight: "600" }}>{user?.email}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "capitalize" }}>
                {user?.role}
              </div>
            </div>
            <button 
              onClick={toggleTheme} 
              className="btn btn-secondary" 
              style={{ padding: "0.5rem", borderRadius: "50%", minWidth: "36px", height: "36px" }}
              title="Toggle Theme"
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {/* Top Navbar */}
        <header className="header">
          <div>
            {activeProject ? (
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span className="source-tag" style={{ margin: 0, padding: "0.25rem 0.5rem", backgroundColor: "var(--primary-glow)", color: "var(--primary-light)" }}>
                  Active Project
                </span>
                <h3 style={{ fontSize: "1.125rem", margin: 0 }}>{activeProject.name}</h3>
              </div>
            ) : (
              <h3 style={{ fontSize: "1.125rem", margin: 0 }}>Website RAG Chatbot</h3>
            )}
          </div>
          
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
              API Server Status:
            </span>
            <span style={{
              display: "inline-block",
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: "var(--success)"
            }}></span>
            <span style={{ fontSize: "0.875rem", color: "var(--success)", fontWeight: "600" }}>
              Connected
            </span>
          </div>
        </header>

        {/* Content Body */}
        <div className="content-body">
          {children}
        </div>
      </main>
    </div>
  );
}
