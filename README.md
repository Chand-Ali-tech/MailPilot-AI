<p align="left">
  <img src="./client/public/favicon.svg" alt="MailPilot AI Logo" width="36" height="36" />
</p>

# MailPilot AI — Autonomous Gmail Co-Pilot

MailPilot AI is an autonomous email assistant built with LangGraph, Google Gemini 2.0, FastAPI, and Next.js. It enables users to interact with their Gmail inbox using natural language, backed by a Human-in-the-Loop (HITL) safety mechanism that pauses execution before sensitive actions like sending or deleting emails.

---

## Key Features

- **11 Gmail Tools**:
  - `search_emails`, `read_email`, `get_thread`, `create_draft`
  - `send_email` (HITL Protected), `reply_email` (HITL Protected), `delete_email` (HITL Protected)
  - `archive_email`, `mark_as_read`, `mark_as_unread`, `add_label`
- **Human-in-the-Loop (HITL) Protection**: Destructive or outbound actions pause execution and render an interactive preview in the UI for explicit approval or cancellation.
- **Real-Time Token Streaming**: Server-Sent Events (SSE) stream agent reasoning and responses as they are generated.
- **OAuth 2.0 Integration**: Official Google OAuth integration with scoped Gmail API tokens.
- **Responsive Web Interface**: Modern Next.js interface with capability cards, email thread inspection, and full mobile support.

---

## Persistence Architecture

MailPilot AI implements a three-tier persistence model:

1. **Agent State & Checkpoint Persistence (LangGraph + SQLite)**:
   - The LangGraph ReAct agent uses `SqliteSaver` against `server/checkpoints.db`.
   - Thread states, intermediate messages, and execution snapshots are stored per `thread_id`.
   - When a Human-in-the-Loop tool triggers an interrupt, the full graph state is preserved in SQLite, allowing the exact execution branch to resume seamlessly once the user approves or rejects the action.

2. **User & Token Persistence (SQLModel + SQLite)**:
   - User identity, encrypted tokens, and OAuth credentials are saved in the relational database (`server/email_agent.db`) via SQLModel.
   - Secure HTTP-only cookies manage session lifetimes.

3. **Client-Side Conversation Storage (`localStorage`)**:
   - Conversation sessions, titles, and message histories are cached locally in the browser (`email_agent_conversations`).
   - The last 6 conversation turns are supplied alongside each request to provide immediate conversational memory.

---

## Tech Stack

| Layer               | Technologies                                                                            |
| :------------------ | :-------------------------------------------------------------------------------------- |
| **Frontend**        | Next.js 16 (App Router), React 19, Tailwind CSS                                         |
| **Backend API**     | FastAPI, SQLModel, Uvicorn                                                              |
| **Agent Framework** | LangGraph (ReAct StateGraph), Google Gemini 2.0 Flash Lite (`langchain-google-genai`)   |
| **Persistence**     | SQLite (`checkpoints.db` for agent state snapshots, `email_agent.db` for user accounts) |
| **Email Services**  | Google Gmail REST API via `google-api-python-client` and `google-auth`                  |

---

## Workflow Architecture

```
User Query
    │
    ▼
FastAPI SSE Endpoint (/agent/chat)
    │
    ▼
LangGraph Agent (Gemini 2.0 Flash Lite)
    │
    ├── Safe Tool (search, read, draft, label, etc.)
    │       └── Auto-execute & Stream results
    │
    └── Protected Tool (send, reply, delete)
            ├── 1. Interrupt Graph execution
            ├── 2. Persist state snapshot to checkpoints.db
            ├── 3. Send "pending_approval" event to UI
            │
      [ User Reviews & Approves ]
            │
            └── 4. Resume Graph (/agent/resume) ──► Execute Tool ──► Stream Confirmation
```

---

<img width="1310" height="647" alt="image" src="https://github.com/user-attachments/assets/3eb9a854-549e-4344-aaac-b6788fd5d6ef" />


<img width="1310" height="647" alt="image" src="https://github.com/user-attachments/assets/1e545465-9846-42d0-b9e4-c773ffe3ca77" />

