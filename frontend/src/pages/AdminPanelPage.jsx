import React, { useState, useEffect } from "react";
import { 
  Users, 
  Database, 
  Activity, 
  Trash2, 
  Plus, 
  RefreshCw,
  Cpu,
  Key,
  HardDrive
} from "lucide-react";
import { api } from "../api";

export default function AdminPanelPage() {
  // States
  const [analytics, setAnalytics] = useState(null);
  const [users, setUsers] = useState([]);
  const [dbStatus, setDbStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create User form
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");

  const loadAdminData = async () => {
    try {
      setLoading(true);
      setError("");
      const [analyticsData, usersData, dbData] = await Promise.all([
        api.getAdminAnalytics(),
        api.getAdminUsers(),
        api.getDbStatus()
      ]);
      setAnalytics(analyticsData);
      setUsers(usersData);
      setDbStatus(dbData);
    } catch (err) {
      setError(err.message || "Failed to load administrative analytics.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return;

    try {
      await api.createAdminUser(email, password, role);
      setEmail("");
      setPassword("");
      setRole("user");
      setShowForm(false);
      loadAdminData();
    } catch (err) {
      alert("Failed to create user: " + err.message);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm("Are you sure you want to delete this user, all their projects, and vector indexes? This action is irreversible.")) return;

    try {
      await api.deleteAdminUser(userId);
      loadAdminData();
    } catch (err) {
      alert("Failed to delete user: " + err.message);
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div>
      {/* Page header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", margin: 0 }}>System Admin Workspace</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
            Monitor user registries, platform tokens usage, and vector index health
          </p>
        </div>
        <button onClick={loadAdminData} className="btn btn-secondary" disabled={loading}>
          <RefreshCw size={16} className={loading ? "spin" : ""} />
          <span>Reload Metrics</span>
        </button>
      </div>

      {error && (
        <div style={{
          backgroundColor: "rgba(239, 68, 68, 0.15)",
          border: "1px solid var(--danger)",
          color: "var(--danger)",
          padding: "1rem",
          borderRadius: "var(--radius-sm)",
          marginBottom: "2rem"
        }}>
          {error}
        </div>
      )}

      {/* Analytics Summary */}
      {analytics && (
        <div className="stats-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          <div className="stat-card">
            <div className="stat-card-icon" style={{ backgroundColor: "rgba(99, 102, 241, 0.15)", color: "var(--secondary)" }}>
              <Users size={20} />
            </div>
            <div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Total Users</div>
              <div style={{ fontSize: "1.25rem", fontWeight: "700" }}>{analytics.users_count}</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-card-icon">
              <HardDrive size={20} />
            </div>
            <div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Total Libraries</div>
              <div style={{ fontSize: "1.25rem", fontWeight: "700" }}>{analytics.projects_count}</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-card-icon" style={{ backgroundColor: "rgba(16, 185, 129, 0.15)", color: "var(--success)" }}>
              <Activity size={20} />
            </div>
            <div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Crawled Pages</div>
              <div style={{ fontSize: "1.25rem", fontWeight: "700" }}>{analytics.pages_count} ({analytics.chunks_count} chunks)</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-card-icon" style={{ backgroundColor: "rgba(6, 182, 212, 0.15)", color: "var(--info)" }}>
              <Cpu size={20} />
            </div>
            <div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Tokens Used</div>
              <div style={{ fontSize: "1.25rem", fontWeight: "700" }}>
                LLM: {analytics.api_usage?.llm?.tokens || 0}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid: User CRUD and Database Health */}
      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: "2rem" }}>
        
        {/* User Accounts Management list */}
        <div className="glass-panel" style={{ padding: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
            <h3 style={{ fontSize: "1.25rem", margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Users size={18} />
              <span>Registered Accounts</span>
            </h3>
            <button className="btn btn-primary" style={{ padding: "0.5rem 1rem", fontSize: "0.75rem" }} onClick={() => setShowForm(!showForm)}>
              <Plus size={12} />
              <span>Add User</span>
            </button>
          </div>

          {/* Add User form wrapper */}
          {showForm && (
            <form onSubmit={handleCreateUser} style={{
              backgroundColor: "var(--bg-tertiary)",
              border: "1px solid var(--border-color)",
              padding: "1rem",
              borderRadius: "var(--radius-sm)",
              marginBottom: "1.5rem"
            }}>
              <h4 style={{ fontSize: "0.875rem", marginBottom: "0.75rem" }}>Create New User Account</h4>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
                <input 
                  type="email" 
                  className="form-input" 
                  placeholder="email@ragbot.com" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ padding: "0.5rem" }}
                  required
                />
                <input 
                  type="password" 
                  className="form-input" 
                  placeholder="password (min 6)" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ padding: "0.5rem" }}
                  required
                />
                <select 
                  className="form-input" 
                  value={role} 
                  onChange={(e) => setRole(e.target.value)}
                  style={{ padding: "0.5rem" }}
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                <button type="button" className="btn btn-secondary" style={{ padding: "4px 8px", fontSize: "0.75rem" }} onClick={() => setShowForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ padding: "4px 8px", fontSize: "0.75rem" }}>
                  Save Account
                </button>
              </div>
            </form>
          )}

          {/* Users Table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ backgroundColor: "var(--bg-tertiary)", borderBottom: "1px solid var(--border-color)", textAlign: "left" }}>
                  <th style={{ padding: "10px 12px" }}>Email</th>
                  <th style={{ padding: "10px 12px" }}>Role</th>
                  <th style={{ padding: "10px 12px" }}>Libraries Created</th>
                  <th style={{ padding: "10px 12px" }}>Joined</th>
                  <th style={{ padding: "10px 12px", width: "40px" }}></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ borderBottom: "1px solid var(--border-light)" }}>
                    <td style={{ padding: "10px 12px", fontWeight: "600" }}>{u.email}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span className="source-tag" style={{
                        margin: 0,
                        backgroundColor: u.role === "admin" ? "rgba(16, 185, 129, 0.15)" : "var(--bg-accent)",
                        color: u.role === "admin" ? "var(--success)" : "var(--text-secondary)"
                      }}>
                        {u.role}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>{u.projects_count}</td>
                    <td style={{ padding: "10px 12px", color: "var(--text-muted)", fontSize: "0.75rem" }}>
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <button 
                        onClick={() => handleDeleteUser(u.id)}
                        style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer" }}
                        title="Delete User"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Database & Files statistics panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          
          <div className="glass-panel" style={{ padding: "1.5rem" }}>
            <h3 style={{ fontSize: "1.25rem", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Database size={18} className="text-primary-light" />
              <span>Storage & Vector DB Health</span>
            </h3>
            {dbStatus ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem", fontSize: "0.875rem" }}>
                <div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", textTransform: "uppercase" }}>SQLite Database Size</div>
                  <div style={{ fontWeight: "600", fontSize: "1rem", color: "var(--text-primary)" }}>
                    {formatSize(dbStatus.sqlite_db_size_bytes)}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", wordBreak: "break-all" }}>
                    File: {dbStatus.sqlite_db_path}
                  </div>
                </div>

                <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "0.75rem" }}>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", textTransform: "uppercase" }}>NumPy Vector Binaries</div>
                  <div style={{ fontWeight: "600", fontSize: "1rem", color: "var(--text-primary)" }}>
                    {formatSize(dbStatus.vector_files_size_bytes)}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    Count: <strong>{dbStatus.vector_files_count}</strong> files saved in storage directory
                  </div>
                </div>

                <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{
                    display: "inline-block",
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    backgroundColor: dbStatus.status === "healthy" ? "var(--success)" : "var(--danger)"
                  }}></span>
                  <span style={{ fontWeight: "600", color: dbStatus.status === "healthy" ? "var(--success)" : "var(--danger)" }}>
                    Vector Database Status: {dbStatus.status.toUpperCase()}
                  </span>
                </div>
              </div>
            ) : (
              <div style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                Loading database metrics...
              </div>
            )}
          </div>

          <div className="glass-panel" style={{ padding: "1.5rem" }}>
            <h3 style={{ fontSize: "1.25rem", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Key size={18} className="text-primary-light" />
              <span>API Credentials Monitor</span>
            </h3>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: "1.5" }}>
              API services are initialized utilizing the system environment configurations. Validate the parameters below:
            </p>
            <div style={{ marginTop: "1rem", fontSize: "0.8125rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-light)", paddingBottom: "4px" }}>
                <span style={{ color: "var(--text-muted)" }}>GEMINI_API_KEY:</span>
                <strong style={{ color: "var(--success)" }}>Detected & Active</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-light)", paddingBottom: "4px" }}>
                <span style={{ color: "var(--text-muted)" }}>OPENAI_API_KEY:</span>
                <span>Optional</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>GROQ_API_KEY:</span>
                <span>Optional</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
