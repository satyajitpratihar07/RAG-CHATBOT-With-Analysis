import React, { useState, useEffect, useRef } from "react";
import { 
  MessageSquare, 
  Plus, 
  Send, 
  Trash2, 
  BookOpen, 
  ExternalLink, 
  ArrowRight,
  Info,
  ChevronRight
} from "lucide-react";
import { api } from "../api";

export default function ChatSessionPage({ activeProject }) {
  const projectId = activeProject.id;
  
  // State
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [query, setQuery] = useState("");
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [streaming, setStreaming] = useState(false);
  
  // Session creation form
  const [newSessionTitle, setNewSessionTitle] = useState("");
  
  // Side-drawer citation preview
  const [selectedCitation, setSelectedCitation] = useState(null);

  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadSessions();
  }, [projectId]);

  useEffect(() => {
    if (activeSession) {
      loadMessages(activeSession.id);
    } else {
      setMessages([]);
    }
  }, [activeSession]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streaming]);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  const loadSessions = async (selectFirst = true) => {
    try {
      setLoadingSessions(true);
      const data = await api.getChatSessions(projectId);
      setSessions(data);
      if (selectFirst && data.length > 0) {
        setActiveSession(data[0]);
      } else if (data.length === 0) {
        setActiveSession(null);
      }
    } catch (err) {
      console.error("Failed to load sessions: ", err);
    } finally {
      setLoadingSessions(false);
    }
  };

  const loadMessages = async (sessionId) => {
    try {
      setLoadingMessages(true);
      const data = await api.getChatMessages(sessionId);
      setMessages(data);
    } catch (err) {
      console.error("Failed to load messages: ", err);
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleCreateSession = async (e) => {
    e.preventDefault();
    const title = newSessionTitle.trim() || `Chat Session #${sessions.length + 1}`;
    
    try {
      const data = await api.createChatSession(projectId, title);
      setNewSessionTitle("");
      await loadSessions(false);
      
      // Select the newly created session
      setActiveSession(data);
    } catch (err) {
      alert("Failed to create session: " + err.message);
    }
  };

  const handleDeleteSession = async (sessionId, e) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this chat session and its history?")) return;

    try {
      await api.deleteChatSession(sessionId);
      const remaining = sessions.filter(s => s.id !== sessionId);
      setSessions(remaining);
      if (activeSession && activeSession.id === sessionId) {
        setActiveSession(remaining.length > 0 ? remaining[0] : null);
      }
    } catch (err) {
      alert("Failed to delete session: " + err.message);
    }
  };

  const handleSendQuery = async (e) => {
    e.preventDefault();
    if (!query.trim() || !activeSession || streaming) return;

    const userText = query.trim();
    setQuery("");
    setStreaming(true);

    // 1. Add user message locally
    const tempUserMsg = { id: Date.now(), role: "user", content: userText, sources: [] };
    setMessages(prev => [...prev, tempUserMsg]);

    // 2. Add empty bot message for streaming
    const tempBotMsgId = Date.now() + 1;
    setMessages(prev => [...prev, { id: tempBotMsgId, role: "assistant", content: "", sources: [] }]);

    try {
      const token = localStorage.getItem("token");
      const res = await fetch("http://localhost:8000/api/chat/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          session_id: activeSession.id,
          query: userText,
          stream: true
        })
      });

      if (!res.ok) {
        throw new Error("Chat completion request failed");
      }

      // Decode the stream reader
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let botContent = "";
      let botSources = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const rawText = decoder.decode(value);
        const lines = rawText.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.replace("data: ", "").trim();
            if (!dataStr) continue;

            try {
              const data = JSON.parse(dataStr);
              if (data.token) {
                botContent += data.token;
                // Update the bot message in state
                setMessages(prev => prev.map(m => 
                  m.id === tempBotMsgId ? { ...m, content: botContent } : m
                ));
              } else if (data.done) {
                botSources = data.sources || [];
                setMessages(prev => prev.map(m => 
                  m.id === tempBotMsgId ? { ...m, content: botContent, sources: botSources } : m
                ));
              } else if (data.error) {
                botContent = `[Error: ${data.error}]`;
                setMessages(prev => prev.map(m => 
                  m.id === tempBotMsgId ? { ...m, content: botContent } : m
                ));
              }
            } catch (err) {
              // skip malformed chunks
            }
          }
        }
      }
    } catch (err) {
      setMessages(prev => prev.map(m => 
        m.id === tempBotMsgId ? { ...m, content: `Error: ${err.message || "Failed to generate response."}` } : m
      ));
    } finally {
      setStreaming(false);
      // Reload final database messages list to ensure consistency and correct database IDs
      loadMessages(activeSession.id);
    }
  };

  const handleSuggestedPrompt = (promptText) => {
    setQuery(promptText);
  };

  // Render markdown-like lists and newlines in a simple fashion
  const renderMessageContent = (content) => {
    if (!content) return "";
    return content.split("\n").map((line, idx) => {
      // Bold rendering
      let formatted = line;
      const boldRegex = /\*\*(.*?)\*\*/g;
      const parts = [];
      let lastIdx = 0;
      let match;
      
      while ((match = boldRegex.exec(line)) !== null) {
        parts.push(line.substring(lastIdx, match.index));
        parts.push(<strong key={match.index}>{match[1]}</strong>);
        lastIdx = boldRegex.lastIndex;
      }
      parts.push(line.substring(lastIdx));
      
      const lineContent = parts.length > 1 ? parts : line;

      // Unordered lists
      if (line.trim().startsWith("- ")) {
        return <li key={idx} style={{ marginLeft: "1.5rem", marginBottom: "0.25rem" }}>{line.trim().substring(2)}</li>;
      }
      // Ordered lists
      if (/^\d+\.\s/.test(line.trim())) {
        const dotIdx = line.indexOf(".");
        return <div key={idx} style={{ marginLeft: "1.5rem", marginBottom: "0.25rem", display: "flex", gap: "0.5rem" }}>
          <span>{line.substring(0, dotIdx + 1)}</span>
          <span>{line.substring(dotIdx + 2)}</span>
        </div>;
      }
      
      return <p key={idx} style={{ marginBottom: "0.5rem", minHeight: "1rem" }}>{lineContent}</p>;
    });
  };

  const suggestedQuestions = [
    "What is this website about?",
    "Give me a summary of the main features.",
    "Are there any installation guidelines documented?",
    "What are the contact details or pricing options listed?"
  ];

  return (
    <div style={{ display: "flex", height: "calc(100vh - 120px)", margin: "-2rem", borderTop: "1px solid var(--border-color)" }}>
      
      {/* RAG Sessions left panel */}
      <aside style={{
        width: "280px",
        backgroundColor: "var(--bg-secondary)",
        borderRight: "1px solid var(--border-color)",
        display: "flex",
        flexDirection: "column",
        height: "100%"
      }}>
        {/* Create Session header */}
        <div style={{ padding: "1.25rem", borderBottom: "1px solid var(--border-color)" }}>
          <form onSubmit={handleCreateSession} style={{ display: "flex", gap: "0.5rem" }}>
            <input 
              type="text" 
              className="form-input" 
              placeholder="New session title..." 
              value={newSessionTitle}
              onChange={(e) => setNewSessionTitle(e.target.value)}
              style={{ padding: "0.5rem 0.75rem", fontSize: "0.8125rem" }}
            />
            <button type="submit" className="btn btn-primary" style={{ padding: "0.5rem" }}>
              <Plus size={16} />
            </button>
          </form>
        </div>

        {/* Sessions list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0.75rem" }}>
          {loadingSessions ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)", fontSize: "0.875rem" }}>
              Loading sessions...
            </div>
          ) : sessions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)", fontSize: "0.8125rem" }}>
              No chat histories. Click '+' to start a new chat.
            </div>
          ) : (
            sessions.map((s) => {
              const isActive = activeSession && activeSession.id === s.id;
              return (
                <div 
                  key={s.id}
                  onClick={() => setActiveSession(s)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.75rem 1rem",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                    backgroundColor: isActive ? "var(--bg-tertiary)" : "transparent",
                    border: isActive ? "1px solid var(--border-color)" : "1px solid transparent",
                    marginBottom: "0.25rem",
                    transition: "all var(--transition-fast)"
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = "var(--bg-accent)"; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", overflow: "hidden" }}>
                    <MessageSquare size={14} style={{ color: isActive ? "var(--primary-light)" : "var(--text-muted)", flexShrink: 0 }} />
                    <span style={{ 
                      fontSize: "0.875rem", 
                      fontWeight: isActive ? "600" : "400",
                      color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                      overflow: "hidden", 
                      textOverflow: "ellipsis", 
                      whiteSpace: "nowrap",
                      maxWidth: "160px"
                    }}>
                      {s.title}
                    </span>
                  </div>
                  <button 
                    onClick={(e) => handleDeleteSession(s.id, e)}
                    className="btn"
                    style={{ padding: "2px", border: "none", backgroundColor: "transparent", color: "var(--text-muted)" }}
                    title="Delete Session"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Main chat interface workspace */}
      <section style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--bg-primary)",
        position: "relative",
        height: "100%"
      }}>
        {/* Active Session Status */}
        <div style={{
          height: "60px",
          borderBottom: "1px solid var(--border-color)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 1.5rem",
          backgroundColor: "var(--bg-secondary)"
        }}>
          <div>
            {activeSession ? (
              <h4 style={{ margin: 0, fontSize: "0.9375rem" }}>{activeSession.title}</h4>
            ) : (
              <h4 style={{ margin: 0, fontSize: "0.9375rem", color: "var(--text-muted)" }}>Select a session to start</h4>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem", color: "var(--text-secondary)", padding: "4px 8px", borderRadius: "var(--radius-sm)", backgroundColor: "var(--bg-tertiary)" }}>
            <Info size={12} />
            <span>Strict RAG Mode Active</span>
          </div>
        </div>

        {/* Message Logs Area */}
        <div className="chat-history" style={{ padding: "1.5rem 2rem" }}>
          {!activeSession ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
              <MessageSquare size={48} style={{ marginBottom: "1rem" }} />
              <p>Create a chat session on the left to start prompting the AI model.</p>
            </div>
          ) : loadingMessages ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div className="typing-indicator">
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
              </div>
            </div>
          ) : messages.length === 0 ? (
            /* Starter suggestion screen */
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", maxWidth: "600px", margin: "0 auto", textAlign: "center" }}>
              <div style={{
                backgroundColor: "var(--primary-glow)",
                color: "var(--primary-light)",
                padding: "1rem",
                borderRadius: "50%",
                marginBottom: "1rem"
              }}>
                <MessageSquare size={32} />
              </div>
              <h3 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>Ask your RAG Bot Chatbot</h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: "2rem" }}>
                Ask questions regarding the indexed pages. The bot checks vectors, fetches matching text contexts, and forms precise answers using LLM completions.
              </p>
              
              <div style={{ width: "100%", textAlign: "left" }}>
                <h4 style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginBottom: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Suggested Questions</h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  {suggestedQuestions.map((q, idx) => (
                    <button 
                      key={idx}
                      onClick={() => handleSuggestedPrompt(q)}
                      className="glass-panel"
                      style={{
                        padding: "0.875rem",
                        textAlign: "left",
                        cursor: "pointer",
                        fontSize: "0.8125rem",
                        color: "var(--text-secondary)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "var(--radius-sm)",
                        transition: "all var(--transition-fast)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--primary-light)"; e.currentTarget.style.color = "var(--text-primary)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-color)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                    >
                      <span>{q}</span>
                      <ChevronRight size={14} style={{ flexShrink: 0 }} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Standard messages logs */
            <>
              {messages.map((m) => {
                const isUser = m.role === "user";
                return (
                  <div key={m.id} className={`chat-message ${isUser ? "user" : "bot"}`}>
                    <div className={`chat-avatar ${isUser ? "user" : "bot"}`}>
                      {isUser ? "U" : "AI"}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <div className="chat-bubble">
                        {renderMessageContent(m.content)}
                      </div>
                      
                      {/* Citations references */}
                      {!isUser && m.sources && m.sources.length > 0 && (
                        <div className="chat-sources">
                          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: "0.25rem", fontWeight: "600" }}>
                            Source Citations:
                          </span>
                          <div style={{ display: "flex", flexWrap: "wrap" }}>
                            {m.sources.map((source, index) => (
                              <button
                                key={index}
                                onClick={() => setSelectedCitation(source)}
                                className="source-tag"
                              >
                                <BookOpen size={10} />
                                <span>[{index + 1}] {source.title}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              
              {/* Streaming loading indicator */}
              {streaming && messages[messages.length - 1]?.content === "" && (
                <div className="chat-message bot">
                  <div className="chat-avatar bot">AI</div>
                  <div className="chat-bubble">
                    <div className="typing-indicator">
                      <div className="typing-dot"></div>
                      <div className="typing-dot"></div>
                      <div className="typing-dot"></div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Text Form Area */}
        {activeSession && (
          <form onSubmit={handleSendQuery} className="chat-input-area">
            <input 
              type="text" 
              className="form-input" 
              placeholder="Ask anything about the website content..." 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={streaming}
              style={{
                borderRadius: "var(--radius-md)",
                height: "46px",
                border: "1px solid var(--border-color)",
                backgroundColor: "var(--bg-tertiary)"
              }}
            />
            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={streaming || !query.trim()}
              style={{
                borderRadius: "50%",
                minWidth: "46px",
                height: "46px",
                padding: 0
              }}
            >
              <Send size={18} />
            </button>
          </form>
        )}
      </section>

      {/* Side drawer details for Citation Previews */}
      {selectedCitation && (
        <div style={{
          width: "320px",
          backgroundColor: "var(--bg-secondary)",
          borderLeft: "1px solid var(--border-color)",
          padding: "1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
          height: "100%",
          animation: "slideUp 0.2s ease-out"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: "1.125rem", margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <BookOpen size={16} className="text-primary-light" />
              <span>Citation Details</span>
            </h3>
            <button 
              onClick={() => setSelectedCitation(null)}
              className="btn" 
              style={{ padding: "4px", border: "none", backgroundColor: "transparent", minWidth: "auto" }}
            >
              Close
            </button>
          </div>
          
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.25rem" }}>
              Page Title
            </div>
            <div style={{ fontSize: "0.9375rem", fontWeight: "600", color: "var(--text-primary)", marginBottom: "0.75rem" }}>
              {selectedCitation.title}
            </div>
            
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.25rem" }}>
              Original Web Address
            </div>
            <a 
              href={selectedCitation.url} 
              target="_blank" 
              rel="noreferrer" 
              style={{ fontSize: "0.8125rem", wordBreak: "break-all", display: "inline-flex", alignItems: "center", gap: "4px" }}
            >
              <span>{selectedCitation.url}</span>
              <ExternalLink size={12} />
            </a>
          </div>

          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
              Retrieved Context Snippet
            </div>
            <div style={{
              flex: 1,
              backgroundColor: "var(--bg-primary)",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--radius-sm)",
              padding: "0.875rem",
              fontSize: "0.8125rem",
              lineHeight: 1.5,
              color: "var(--text-secondary)",
              overflowY: "auto"
            }}>
              "{selectedCitation.snippet}"
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
