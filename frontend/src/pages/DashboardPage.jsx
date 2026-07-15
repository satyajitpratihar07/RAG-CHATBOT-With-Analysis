import React, { useState, useEffect } from "react";
import { Plus, Globe, Settings, MessageSquare, Trash2, Calendar, FileText, Database } from "lucide-react";
import { api } from "../api";

export default function DashboardPage({ setView, setActiveProject }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // New Project Form State
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [chunkSize, setChunkSize] = useState(500);
  const [chunkOverlap, setChunkOverlap] = useState(50);
  const [embModel, setEmbModel] = useState("gemini");
  const [llmModel, setLlmModel] = useState("gemini");
  const [depth, setDepth] = useState(2);
  const [excludes, setExcludes] = useState("");

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const data = await api.getProjects();
      setProjects(data);
    } catch (err) {
      setError(err.message || "Failed to load projects.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      await api.createProject({
        name,
        description,
        chunk_size: parseInt(chunkSize),
        chunk_overlap: parseInt(chunkOverlap),
        embedding_model: embModel,
        llm_model: llmModel,
        crawl_depth: parseInt(depth),
        exclude_patterns: excludes,
      });
      setShowModal(false);
      // Reset form
      setName("");
      setDescription("");
      setChunkSize(500);
      setChunkOverlap(50);
      setEmbModel("gemini");
      setLlmModel("gemini");
      setDepth(2);
      setExcludes("");
      // Refresh
      fetchProjects();
    } catch (err) {
      alert("Failed to create project: " + err.message);
    }
  };

  const handleDeleteProject = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this project and all its indexes? This cannot be undone.")) return;

    try {
      await api.deleteProject(id);
      setProjects(projects.filter(p => p.id !== id));
      setActiveProject(null);
    } catch (err) {
      alert("Failed to delete project: " + err.message);
    }
  };

  const selectProject = (project, targetView) => {
    setActiveProject(project);
    setView(targetView);
  };

  // Metrics aggregations
  const totalPagesCrawled = projects.reduce((sum, p) => sum + (p.crawled_pages || 0), 0);
  const totalCrawlsCompleted = projects.reduce((sum, p) => sum + (p.total_crawls || 0), 0);

  return (
    <div>
      {/* Header and Add Button */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", margin: 0 }}>My Projects</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
            Manage your vector libraries and crawl settings
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} />
          <span>New Project</span>
        </button>
      </div>

      {/* Aggregate Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-icon">
            <Database size={20} />
          </div>
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Total Projects</div>
            <div style={{ fontSize: "1.5rem", fontWeight: "700" }}>{projects.length}</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon" style={{ color: "var(--secondary)", backgroundColor: "rgba(99, 102, 241, 0.15)" }}>
            <FileText size={20} />
          </div>
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Pages Crawled</div>
            <div style={{ fontSize: "1.5rem", fontWeight: "700" }}>{totalPagesCrawled}</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-icon" style={{ color: "var(--success)", backgroundColor: "rgba(16, 185, 129, 0.15)" }}>
            <Calendar size={20} />
          </div>
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Total Index Jobs</div>
            <div style={{ fontSize: "1.5rem", fontWeight: "700" }}>{totalCrawlsCompleted}</div>
          </div>
        </div>
      </div>

      {/* Loading state */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem" }}>
          <div className="typing-indicator" style={{ justifyContent: "center" }}>
            <div className="typing-dot"></div>
            <div className="typing-dot"></div>
            <div className="typing-dot"></div>
          </div>
          <p style={{ marginTop: "1rem", color: "var(--text-secondary)" }}>Loading projects...</p>
        </div>
      ) : error ? (
        <div style={{ backgroundColor: "rgba(239, 68, 68, 0.15)", border: "1px solid var(--danger)", color: "var(--danger)", padding: "1rem", borderRadius: "var(--radius-sm)" }}>
          {error}
        </div>
      ) : projects.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: "center", padding: "4rem 2rem", borderRadius: "var(--radius-lg)" }}>
          <Globe size={48} style={{ color: "var(--text-muted)", marginBottom: "1rem" }} />
          <h3 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>No projects created yet</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: "1.5rem", maxWidth: "400px", margin: "0 auto 1.5rem" }}>
            Create a project knowledge base, crawl URL targets, and unlock context-aware RAG search capabilities instantly.
          </p>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={16} />
            <span>Create Your First Project</span>
          </button>
        </div>
      ) : (
        /* Projects Grid list */
        <div className="card-grid">
          {projects.map((project) => (
            <div 
              key={project.id} 
              className="glass-panel"
              onClick={() => selectProject(project, "project-detail")}
              style={{
                padding: "1.5rem",
                cursor: "pointer",
                transition: "all var(--transition-fast)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                height: "200px"
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-4px)"}
              onMouseLeave={(e) => e.currentTarget.style.transform = "translateY(0)"}
            >
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                  <h3 style={{ fontSize: "1.25rem", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "220px" }}>
                    {project.name}
                  </h3>
                  <button 
                    onClick={(e) => handleDeleteProject(project.id, e)}
                    className="btn"
                    style={{ padding: "4px 8px", color: "var(--danger)", border: "none", backgroundColor: "transparent" }}
                    title="Delete Project"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <p style={{ 
                  color: "var(--text-secondary)", 
                  fontSize: "0.875rem", 
                  display: "-webkit-box", 
                  WebkitLineClamp: 2, 
                  WebkitBoxOrient: "vertical", 
                  overflow: "hidden",
                  marginBottom: "1rem" 
                }}>
                  {project.description || "No description provided."}
                </p>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border-color)", paddingTop: "0.75rem", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                <div>
                  <strong>{project.crawled_pages || 0}</strong> pages indexed
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button 
                    onClick={(e) => { e.stopPropagation(); selectProject(project, "project-detail"); }}
                    className="btn btn-secondary" 
                    style={{ padding: "0.375rem 0.75rem", fontSize: "0.75rem" }}
                  >
                    <Settings size={12} />
                    <span>Settings</span>
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); selectProject(project, "chat"); }}
                    className="btn btn-primary" 
                    style={{ padding: "0.375rem 0.75rem", fontSize: "0.75rem" }}
                  >
                    <MessageSquare size={12} />
                    <span>Chat</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Project Modal */}
      {showModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(11, 15, 25, 0.8)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000
        }}>
          <div className="glass-panel" style={{
            maxWidth: "600px",
            width: "100%",
            padding: "2rem",
            borderRadius: "var(--radius-md)",
            maxHeight: "90vh",
            overflowY: "auto"
          }}>
            <h2 style={{ marginBottom: "1.5rem" }}>Create New Project</h2>
            <form onSubmit={handleCreateProject}>
              <div className="form-group">
                <label className="form-label">Project Name</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. My Website Docs" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea 
                  className="form-input" 
                  style={{ height: "80px", resize: "none" }}
                  placeholder="What is this knowledge base for?" 
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div className="form-group">
                  <label className="form-label">Embedding Model</label>
                  <select className="form-input" value={embModel} onChange={(e) => setEmbModel(e.target.value)}>
                    <option value="gemini">Gemini Embedding (gemini-embedding-001)</option>
                    <option value="openai">OpenAI Embedding (text-embedding-3-small)</option>
                    <option value="local">Local Sentence Transformers</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">LLM Provider</label>
                  <select className="form-input" value={llmModel} onChange={(e) => setLlmModel(e.target.value)}>
                    <option value="gemini">Gemini Flash (gemini-2.5-flash)</option>
                    <option value="openai">OpenAI GPT-4o Mini</option>
                    <option value="groq">Groq (Llama 3.3 70B)</option>
                    <option value="ollama">Ollama (Local Models)</option>
                    <option value="openrouter">OpenRouter (Unified)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
                <div className="form-group">
                  <label className="form-label">Chunk Size (chars)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    value={chunkSize}
                    onChange={(e) => setChunkSize(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Chunk Overlap</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    value={chunkOverlap}
                    onChange={(e) => setChunkOverlap(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Max Crawl Depth</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    min="1" 
                    max="5"
                    value={depth}
                    onChange={(e) => setDepth(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Exclusion URL Patterns (comma-separated)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. /wp-admin, /login, \?ref=.*" 
                  value={excludes}
                  onChange={(e) => setExcludes(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem", marginTop: "2rem" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
