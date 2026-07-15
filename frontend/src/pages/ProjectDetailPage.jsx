import React, { useState, useEffect, useRef } from "react";
import { 
  Play, 
  Settings, 
  Trash2, 
  RefreshCw, 
  Database, 
  Clock, 
  AlertTriangle,
  Code,
  FileText,
  Save,
  CheckCircle,
  XCircle,
  ExternalLink
} from "lucide-react";
import { api } from "../api";

export default function ProjectDetailPage({ activeProject, setActiveProject }) {
  const projectId = activeProject.id;
  const logEndRef = useRef(null);

  // States
  const [project, setProject] = useState(activeProject);
  const [stats, setStats] = useState(null);
  const [pages, setPages] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Crawler States
  const [crawlUrl, setCrawlUrl] = useState("");
  const [crawling, setCrawling] = useState(false);
  const [crawlLogs, setCrawlLogs] = useState([]);
  const [crawlProgress, setCrawlProgress] = useState(0);

  // Config Form State
  const [name, setName] = useState(activeProject.name);
  const [description, setDescription] = useState(activeProject.description || "");
  const [chunkSize, setChunkSize] = useState(activeProject.chunk_size);
  const [chunkOverlap, setChunkOverlap] = useState(activeProject.chunk_overlap);
  const [embModel, setEmbModel] = useState(activeProject.embedding_model);
  const [llmModel, setLlmModel] = useState(activeProject.llm_model);
  const [depth, setDepth] = useState(activeProject.crawl_depth);
  const [excludes, setExcludes] = useState(activeProject.exclude_patterns || "");
  const [systemPrompt, setSystemPrompt] = useState(activeProject.system_prompt || "");

  // Load stats, pages, and history
  const loadData = async () => {
    try {
      setLoading(true);
      const [projectData, statsData, pagesData, historyData] = await Promise.all([
        api.getProject(projectId),
        api.getProjectStats(projectId),
        api.getProjectPages(projectId),
        api.getCrawlHistory(projectId)
      ]);
      
      setProject(projectData);
      setName(projectData.name);
      setDescription(projectData.description || "");
      setChunkSize(projectData.chunk_size);
      setChunkOverlap(projectData.chunk_overlap);
      setEmbModel(projectData.embedding_model);
      setLlmModel(projectData.llm_model);
      setDepth(projectData.crawl_depth);
      setExcludes(projectData.exclude_patterns || "");
      setSystemPrompt(projectData.system_prompt || "");

      setStats(statsData);
      setPages(pagesData);
      setHistory(historyData);
      
      // Auto-detect if crawl is currently running based on last history status
      if (historyData.length > 0 && historyData[0].status === "running") {
        startProgressStream();
      }
    } catch (err) {
      console.error("Failed to load details: ", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [projectId]);

  // Scroll to bottom of crawler console logs
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [crawlLogs]);

  // Connect to SSE stream
  const startProgressStream = () => {
    setCrawling(true);
    const url = api.getCrawlProgressEventSourceUrl(projectId);
    const eventSource = new EventSource(url);
    
    setCrawlLogs([{ message: "Establishing real-time link...", type: "system" }]);

    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        
        if (data.type === "ping") return;
        
        if (data.type === "status") {
          setCrawlLogs(prev => [...prev, { message: data.message, type: "log" }]);
          if (data.progress) setCrawlProgress(data.progress);
        } else if (data.type === "finished") {
          setCrawlLogs(prev => [...prev, { message: data.message, type: "success" }]);
          setCrawlProgress(100);
          eventSource.close();
          setCrawling(false);
          loadData(); // reload statistics
        } else if (data.type === "failed") {
          setCrawlLogs(prev => [...prev, { message: data.message, type: "error" }]);
          eventSource.close();
          setCrawling(false);
          loadData();
        } else if (data.type === "info") {
          setCrawlLogs(prev => [...prev, { message: data.message, type: "system" }]);
        }
      } catch (err) {
        console.error(err);
      }
    };

    eventSource.onerror = (err) => {
      console.error("SSE connection error: ", err);
      setCrawlLogs(prev => [...prev, { message: "SSE Connection interrupted. Crawl may still be running in background.", type: "warning" }]);
      eventSource.close();
      setCrawling(false);
    };
  };

  const handleUpdateConfig = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    
    try {
      const payload = {
        name,
        description,
        chunk_size: parseInt(chunkSize),
        chunk_overlap: parseInt(chunkOverlap),
        embedding_model: embModel,
        llm_model: llmModel,
        crawl_depth: parseInt(depth),
        exclude_patterns: excludes,
        system_prompt: systemPrompt
      };
      await api.updateProject(projectId, payload);
      setProject({ ...project, ...payload });
      setActiveProject({ ...activeProject, ...payload });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      loadData();
    } catch (err) {
      alert("Failed to save changes: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleStartCrawl = async (e) => {
    e.preventDefault();
    if (!crawlUrl.trim()) return;

    try {
      setCrawlLogs([]);
      setCrawlProgress(0);
      await api.triggerCrawl(projectId, crawlUrl);
      startProgressStream();
    } catch (err) {
      alert("Failed to start crawl: " + err.message);
    }
  };

  const handleDeletePage = async (pageId) => {
    if (!window.confirm("Are you sure you want to delete this page and all its corresponding chunks? This cannot be undone.")) return;

    try {
      await api.deleteProjectPage(projectId, pageId);
      setPages(pages.filter(p => p.id !== pageId));
      // Refresh statistics
      const statsData = await api.getProjectStats(projectId);
      setStats(statsData);
    } catch (err) {
      alert("Failed to delete page: " + err.message);
    }
  };

  const formatSize = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div>
      {/* Page Title */}
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.75rem", margin: 0 }}>Project Control Panel</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
          Configure scrapers, monitor indexing, and review database statistics
        </p>
      </div>

      {/* Metrics Widgets */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-card-icon">
              <FileText size={20} />
            </div>
            <div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Crawled Pages</div>
              <div style={{ fontSize: "1.25rem", fontWeight: "700" }}>{stats.total_pages}</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-card-icon" style={{ color: "var(--secondary)", backgroundColor: "rgba(99, 102, 241, 0.15)" }}>
              <Code size={20} />
            </div>
            <div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Total Chunks</div>
              <div style={{ fontSize: "1.25rem", fontWeight: "700" }}>{stats.total_chunks}</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-card-icon" style={{ color: "var(--success)", backgroundColor: "rgba(16, 185, 129, 0.15)" }}>
              <Database size={20} />
            </div>
            <div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Vector Dimension</div>
              <div style={{ fontSize: "1.25rem", fontWeight: "700" }}>{stats.vector_count} ({stats.vector_dimension}d)</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-card-icon" style={{ color: "var(--info)", backgroundColor: "rgba(6, 182, 212, 0.15)" }}>
              <Clock size={20} />
            </div>
            <div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Storage Size</div>
              <div style={{ fontSize: "1.25rem", fontWeight: "700" }}>{formatSize(stats.storage_size_bytes)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Crawl Control Block & Real-time Console */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem", marginBottom: "2rem" }}>
        
        {/* Scrape Target Input Form */}
        <div className="glass-panel" style={{ padding: "1.5rem" }}>
          <h3 style={{ fontSize: "1.25rem", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Play size={18} className="text-primary-light" />
            <span>Trigger Crawler Job</span>
          </h3>
          <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
            Specify a domain or subpage. The scraper will recursively indexing content up to a depth of <strong>{depth}</strong>.
            *Note: Crawls respect robots.txt rules automatically.
          </p>
          <form onSubmit={handleStartCrawl}>
            <div className="form-group" style={{ marginBottom: "1rem" }}>
              <label className="form-label">Seed Website URL</label>
              <input 
                type="url" 
                className="form-input" 
                placeholder="https://example.com/docs" 
                value={crawlUrl}
                onChange={(e) => setCrawlUrl(e.target.value)}
                disabled={crawling}
                required
              />
            </div>
            <button 
              type="submit" 
              className="btn btn-primary" 
              style={{ width: "100%", height: "42px" }}
              disabled={crawling}
            >
              {crawling ? (
                <>
                  <RefreshCw className="typing-dot" size={16} style={{ animation: "bounce 1.4s infinite ease-in-out" }} />
                  <span>Crawling & Building Vectors...</span>
                </>
              ) : (
                <>
                  <Play size={16} />
                  <span>Crawl & Index Website</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Real-time Crawler Console Log Output */}
        <div className="glass-panel" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", height: "300px" }}>
          <h3 style={{ fontSize: "1.25rem", marginBottom: "0.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Indexer Progress Logs</span>
            {crawling && (
              <span style={{ fontSize: "0.75rem", color: "var(--primary-light)", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                <RefreshCw size={12} style={{ animation: "spin 2s linear infinite" }} />
                <span>Running ({crawlProgress}%)</span>
              </span>
            )}
          </h3>
          <div style={{
            flex: 1,
            backgroundColor: "var(--bg-primary)",
            borderRadius: "var(--radius-sm)",
            padding: "0.75rem",
            fontSize: "0.75rem",
            fontFamily: "var(--font-mono)",
            overflowY: "auto",
            border: "1px solid var(--border-color)",
            color: "var(--text-primary)"
          }}>
            {crawlLogs.length === 0 ? (
              <div style={{ color: "var(--text-muted)", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                Console idle. Start crawl to display real-time activities.
              </div>
            ) : (
              crawlLogs.map((log, idx) => {
                let color = "var(--text-secondary)";
                if (log.type === "success") color = "var(--success)";
                if (log.type === "error") color = "var(--danger)";
                if (log.type === "warning") color = "var(--warning)";
                if (log.type === "system") color = "var(--primary-light)";
                
                return (
                  <div key={idx} style={{ color, marginBottom: "0.25rem", borderLeft: log.type !== "log" ? "2px solid" : "none", paddingLeft: "4px" }}>
                    [{new Date().toLocaleTimeString()}] {log.message}
                  </div>
                );
              })
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>

      {/* Settings configuration and Lists */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 3fr", gap: "2rem" }}>
        
        {/* Settings Update Form */}
        <div className="glass-panel" style={{ padding: "1.5rem" }}>
          <h3 style={{ fontSize: "1.25rem", marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Settings size={18} />
            <span>Project Configurations</span>
          </h3>
          <form onSubmit={handleUpdateConfig}>
            <div className="form-group">
              <label className="form-label">Project Name</label>
              <input type="text" className="form-input" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>

            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea className="form-input" style={{ height: "60px", resize: "none" }} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div className="form-group">
                <label className="form-label">Embedding model</label>
                <select className="form-input" value={embModel} onChange={(e) => setEmbModel(e.target.value)}>
                  <option value="gemini">Gemini Embeddings</option>
                  <option value="openai">OpenAI Embeddings</option>
                  <option value="local">Local Sentence Transformers</option>
                </select>
              </div>
              
              <div className="form-group">
                <label className="form-label">LLM Model</label>
                <select className="form-input" value={llmModel} onChange={(e) => setLlmModel(e.target.value)}>
                  <option value="gemini">Gemini Flash</option>
                  <option value="openai">GPT-4o Mini</option>
                  <option value="groq">Groq Llama 3.3</option>
                  <option value="ollama">Ollama (Local)</option>
                  <option value="openrouter">OpenRouter</option>
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
              <div className="form-group">
                <label className="form-label">Chunk Size</label>
                <input type="number" className="form-input" value={chunkSize} onChange={(e) => setChunkSize(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Overlap</label>
                <input type="number" className="form-input" value={chunkOverlap} onChange={(e) => setChunkOverlap(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Max Depth</label>
                <input type="number" className="form-input" min="1" max="5" value={depth} onChange={(e) => setDepth(e.target.value)} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Exclusion Patterns</label>
              <input type="text" className="form-input" value={excludes} onChange={(e) => setExcludes(e.target.value)} placeholder="e.g. /login, /logout" />
            </div>

            <div className="form-group">
              <label className="form-label">Custom RAG System Prompt Instructions</label>
              <textarea 
                className="form-input" 
                style={{ height: "100px", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }} 
                value={systemPrompt} 
                onChange={(e) => setSystemPrompt(e.target.value)} 
                placeholder="Must contain {context} and {question} template strings, or leave blank for default instructions."
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem", alignItems: "center" }}>
              {saveSuccess && (
                <span style={{ fontSize: "0.875rem", color: "var(--success)", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                  <CheckCircle size={14} /> Saved!
                </span>
              )}
              <button type="submit" className="btn btn-primary" disabled={saving}>
                <Save size={16} />
                <span>{saving ? "Saving..." : "Save Settings"}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Crawled Pages & History Tables */}
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          
          {/* Pages Indexed List */}
          <div className="glass-panel" style={{ padding: "1.5rem" }}>
            <h3 style={{ fontSize: "1.25rem", marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Indexed Pages ({pages.length})</span>
              <button onClick={loadData} className="btn btn-secondary" style={{ padding: "4px 8px" }} title="Reload list">
                <RefreshCw size={12} />
              </button>
            </h3>
            <div style={{ maxHeight: "250px", overflowY: "auto", border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)" }}>
              {pages.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)", fontSize: "0.875rem" }}>
                  No pages crawled yet. Run the crawler job.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
                  <thead>
                    <tr style={{ backgroundColor: "var(--bg-tertiary)", textAlign: "left", borderBottom: "1px solid var(--border-color)" }}>
                      <th style={{ padding: "8px 12px" }}>Title & URL</th>
                      <th style={{ padding: "8px 12px", width: "80px" }}>Size</th>
                      <th style={{ padding: "8px 12px", width: "40px" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pages.map((p) => (
                      <tr key={p.id} style={{ borderBottom: "1px solid var(--border-light)" }}>
                        <td style={{ padding: "8px 12px", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <div style={{ fontWeight: "600", textOverflow: "ellipsis", overflow: "hidden" }}>{p.title}</div>
                          <a href={p.url} target="_blank" rel="noreferrer" style={{ fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "2px" }}>
                            {p.url} <ExternalLink size={10} />
                          </a>
                        </td>
                        <td style={{ padding: "8px 12px", color: "var(--text-secondary)" }}>
                          {p.word_count} words
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <button onClick={() => handleDeletePage(p.id)} style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer" }}>
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Crawl History Logs list */}
          <div className="glass-panel" style={{ padding: "1.5rem" }}>
            <h3 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>Crawl History</h3>
            <div style={{ maxHeight: "250px", overflowY: "auto", border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)" }}>
              {history.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)", fontSize: "0.875rem" }}>
                  No historical crawls recorded.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
                  <thead>
                    <tr style={{ backgroundColor: "var(--bg-tertiary)", textAlign: "left", borderBottom: "1px solid var(--border-color)" }}>
                      <th style={{ padding: "8px 12px" }}>Date</th>
                      <th style={{ padding: "8px 12px" }}>Status</th>
                      <th style={{ padding: "8px 12px" }}>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => {
                      const isSuccess = h.status === "completed";
                      const isRunning = h.status === "running";
                      const dateStr = new Date(h.started_at).toLocaleDateString() + " " + new Date(h.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      
                      return (
                        <tr key={h.id} style={{ borderBottom: "1px solid var(--border-light)" }}>
                          <td style={{ padding: "8px 12px" }}>{dateStr}</td>
                          <td style={{ padding: "8px 12px" }}>
                            {isSuccess ? (
                              <span style={{ color: "var(--success)", display: "inline-flex", alignItems: "center", gap: "2px" }}>
                                <CheckCircle size={12} /> Success
                              </span>
                            ) : isRunning ? (
                              <span style={{ color: "var(--primary-light)", display: "inline-flex", alignItems: "center", gap: "2px" }}>
                                <RefreshCw size={12} style={{ animation: "spin 2s linear infinite" }} /> Running
                              </span>
                            ) : (
                              <span style={{ color: "var(--danger)", display: "inline-flex", alignItems: "center", gap: "2px" }} title={h.error_message}>
                                <XCircle size={12} /> Failed
                              </span>
                            )}
                          </td>
                          <td style={{ padding: "8px 12px", color: "var(--text-secondary)" }}>
                            {isSuccess && <span>{h.pages_crawled} pages ({h.duration}s)</span>}
                            {!isSuccess && !isRunning && <span style={{ color: "var(--danger)", overflow: "hidden", textOverflow: "ellipsis", display: "inline-block", maxWidth: "150px" }} title={h.error_message}>{h.error_message}</span>}
                            {isRunning && <span>Crawling...</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
