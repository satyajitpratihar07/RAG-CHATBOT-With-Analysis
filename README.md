<div align="center">

# 🤖 RAG ChatBot
### Intelligent Document-Based AI Assistant with Retrieval-Augmented Generation

<p align="center">
  Ask Questions • Upload Documents • AI-Powered Answers • Semantic Search
</p>

<p align="center">

![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)
![Python](https://img.shields.io/badge/Python-3.11+-yellow?style=for-the-badge&logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-Backend-green?style=for-the-badge&logo=fastapi)
![React](https://img.shields.io/badge/React-Frontend-61DAFB?style=for-the-badge&logo=react)
![AI](https://img.shields.io/badge/AI-RAG-orange?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Live-success?style=for-the-badge)

</p>

### 🚀 Live Demo
### **https://rag-chat-bot-weld.vercel.app/**

---

</div>

# 📖 Overview

RAG ChatBot is a modern AI-powered web application that combines the capabilities of Large Language Models with Retrieval-Augmented Generation (RAG). Instead of relying only on the model's knowledge, it retrieves relevant information from uploaded documents and generates context-aware, accurate, and reliable responses.

The system processes documents, creates semantic embeddings, performs intelligent similarity search, and delivers responses grounded in the retrieved knowledge.

---

# ✨ Features

- 📄 Upload PDF documents
- 🤖 AI-powered conversational interface
- 🔍 Semantic document retrieval
- 🧠 Retrieval-Augmented Generation (RAG)
- 💬 Context-aware responses
- ⚡ Fast document indexing
- 📚 Multi-document support
- 🎯 Accurate knowledge retrieval
- 🌙 Modern responsive UI
- 📱 Mobile friendly
- 🔒 Secure environment variable configuration
- ☁️ Easy cloud deployment

---

# 🛠 Tech Stack

## Frontend

- React
- Vite
- Tailwind CSS
- JavaScript

## Backend

- Python
- FastAPI

## AI Stack

- LangChain
- Vector Embeddings
- Retrieval-Augmented Generation (RAG)
- LLM Integration

## Database

- Vector Database
- Document Embeddings

## Deployment

- Vercel
- Render / Railway (Backend)

---

# ⚙️ How It Works

```text
Upload Document
        │
        ▼
Document Processing
        │
        ▼
Text Chunking
        │
        ▼
Generate Embeddings
        │
        ▼
Store in Vector Database
        │
        ▼
User Question
        │
        ▼
Semantic Search
        │
        ▼
Relevant Context Retrieved
        │
        ▼
LLM Generates Final Answer
```

---

# 📂 Project Structure

```
RAG-ChatBot/
│
├── frontend/
│   ├── src/
│   ├── public/
│   └── package.json
│
├── backend/
│   ├── app/
│   ├── api/
│   ├── services/
│   ├── embeddings/
│   └── requirements.txt
│
├── uploads/
│
├── vector_db/
│
├── .env.example
│
└── README.md
```

---

# 🚀 Installation

## Clone Repository

```bash
git clone https://github.com/yourusername/RAG-ChatBot.git

cd RAG-ChatBot
```

---

## Backend

```bash
cd backend

python -m venv venv

# Windows
venv\Scripts\activate

# Linux/Mac
source venv/bin/activate

pip install -r requirements.txt
```

Run Backend

```bash
uvicorn app.main:app --reload
```

---

## Frontend

```bash
cd frontend

npm install

npm run dev
```

---

# 🔑 Environment Variables

Create a `.env` file.

```env
API_KEY=YOUR_API_KEY

VECTOR_DB_PATH=./vector_db

UPLOAD_FOLDER=./uploads
```

⚠️ Never upload your `.env` file to GitHub.

---

# 💡 Usage

1. Launch the application.
2. Upload one or more PDF documents.
3. Wait for document indexing.
4. Ask questions in natural language.
5. Receive AI-generated answers grounded in your uploaded documents.

---

# 🎯 Use Cases

- 📚 Study Assistant
- 🏢 Company Knowledge Base
- 📄 Research Paper Assistant
- 📖 PDF Question Answering
- 🎓 Educational Chatbot
- ⚖️ Legal Document Search
- 🏥 Medical Knowledge Assistant
- 📊 Business Documentation

---

# 📸 Screenshots

> Add screenshots here

```
screenshots/

├── Home.png

├── Upload.png

├── Chat.png
```

---

# 📈 Future Improvements

- Image OCR
- DOCX Support
- PPT Support
- Excel Support
- Voice Chat
- Multi-language Support
- Authentication
- Chat History
- Export Conversations
- Streaming AI Responses
- Dark Mode
- Advanced Search Filters

---

# 🤝 Contributing

Contributions are welcome!

```bash
Fork the repository

Create a new branch

Commit your changes

Push to GitHub

Open a Pull Request
```

---

# ⭐ Support

If you found this project useful,

⭐ Star the repository

🍴 Fork it

📢 Share it with others

---

# 📄 License

This project is licensed under the **MIT License**.

---

<div align="center">

## 🚀 Built with ❤️ using Retrieval-Augmented Generation

**Transforming Documents into Intelligent Conversations**

### 🌐 Live Demo

**https://rag-chat-bot-weld.vercel.app/**

</div>
