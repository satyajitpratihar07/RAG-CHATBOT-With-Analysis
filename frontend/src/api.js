const API_BASE = "http://localhost:8000/api";

const getHeaders = () => {
  const token = localStorage.getItem("token");
  const headers = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
};

export const api = {
  // Authentication
  login: async (email, password) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Login failed");
    }
    const data = await res.json();
    localStorage.setItem("token", data.access_token);
    localStorage.setItem("user", JSON.stringify(data.user));
    return data;
  },

  signup: async (email, password) => {
    const res = await fetch(`${API_BASE}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Signup failed");
    }
    const data = await res.json();
    localStorage.setItem("token", data.access_token);
    localStorage.setItem("user", JSON.stringify(data.user));
    return data;
  },

  logout: () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  },

  getCurrentUser: async () => {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error("Not logged in");
    return res.json();
  },

  // Projects
  getProjects: async () => {
    const res = await fetch(`${API_BASE}/projects`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error("Failed to fetch projects");
    return res.json();
  },

  createProject: async (projectData) => {
    const res = await fetch(`${API_BASE}/projects`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(projectData),
    });
    if (!res.ok) throw new Error("Failed to create project");
    return res.json();
  },

  getProject: async (id) => {
    const res = await fetch(`${API_BASE}/projects/${id}`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error("Failed to fetch project detail");
    return res.json();
  },

  updateProject: async (id, projectData) => {
    const res = await fetch(`${API_BASE}/projects/${id}`, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify(projectData),
    });
    if (!res.ok) throw new Error("Failed to update project");
    return res.json();
  },

  deleteProject: async (id) => {
    const res = await fetch(`${API_BASE}/projects/${id}`, {
      method: "DELETE",
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error("Failed to delete project");
    return res.json();
  },

  getProjectStats: async (id) => {
    const res = await fetch(`${API_BASE}/projects/${id}/stats`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error("Failed to fetch project stats");
    return res.json();
  },

  getProjectPages: async (id) => {
    const res = await fetch(`${API_BASE}/projects/${id}/pages`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error("Failed to fetch project pages");
    return res.json();
  },

  deleteProjectPage: async (projectId, pageId) => {
    const res = await fetch(`${API_BASE}/projects/${projectId}/pages/${pageId}`, {
      method: "DELETE",
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error("Failed to delete page");
    return res.json();
  },

  // Crawling
  triggerCrawl: async (projectId, url) => {
    const res = await fetch(`${API_BASE}/crawl/trigger`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ project_id: projectId, url }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Failed to trigger crawl");
    }
    return res.json();
  },

  getCrawlHistory: async (projectId) => {
    const res = await fetch(`${API_BASE}/crawl/history/${projectId}`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error("Failed to fetch crawl history");
    return res.json();
  },

  getCrawlProgressEventSourceUrl: (projectId) => {
    const token = localStorage.getItem("token");
    return `http://localhost:8000/api/crawl/progress/${projectId}?token=${token}`;
  },

  // Chat sessions & messages
  getChatSessions: async (projectId) => {
    const res = await fetch(`${API_BASE}/chat/sessions?project_id=${projectId}`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error("Failed to fetch chat sessions");
    return res.json();
  },

  createChatSession: async (projectId, title) => {
    const res = await fetch(`${API_BASE}/chat/sessions`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ project_id: projectId, title }),
    });
    if (!res.ok) throw new Error("Failed to create chat session");
    return res.json();
  },

  deleteChatSession: async (sessionId) => {
    const res = await fetch(`${API_BASE}/chat/sessions/${sessionId}`, {
      method: "DELETE",
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error("Failed to delete chat session");
    return res.json();
  },

  getChatMessages: async (sessionId) => {
    const res = await fetch(`${API_BASE}/chat/sessions/${sessionId}/messages`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error("Failed to fetch chat messages");
    return res.json();
  },

  // Admin Portal
  getAdminAnalytics: async () => {
    const res = await fetch(`${API_BASE}/admin/analytics`, {
      headers: getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Failed to load admin analytics");
    }
    return res.json();
  },

  getAdminUsers: async () => {
    const res = await fetch(`${API_BASE}/admin/users`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error("Failed to load users list");
    return res.json();
  },

  createAdminUser: async (email, password, role) => {
    const res = await fetch(`${API_BASE}/admin/users`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ email, password, role }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Failed to create user");
    }
    return res.json();
  },

  deleteAdminUser: async (userId) => {
    const res = await fetch(`${API_BASE}/admin/users/${userId}`, {
      method: "DELETE",
      headers: getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Failed to delete user");
    }
    return res.json();
  },

  getDbStatus: async () => {
    const res = await fetch(`${API_BASE}/admin/db-status`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error("Failed to fetch database status");
    return res.json();
  },
};
