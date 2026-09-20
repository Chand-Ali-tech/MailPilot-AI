"use client";

import React, { useEffect, useState, useRef } from "react";

interface User {
  id: number;
  email: string;
  name?: string | null;
}

interface Attachment {
  filename: string;
  mime_type: string;
  size: number;
  attachment_id: string;
}

interface EmailDetail {
  id: string;
  thread_id?: string;
  subject: string;
  from: string;
  to: string;
  cc?: string;
  date: string;
  snippet: string;
  body_plain: string;
  body_html: string;
  attachments: Attachment[];
  labels: string[];
  unread: boolean;
}

interface EmailItem {
  id: string;
  thread_id?: string;
  subject: string;
  sender: string;
  date: string;
  snippet: string;
  unread: boolean;
  labels?: string[];
}

interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
  type?: "text" | "emails_list";
  emails?: EmailItem[];
  tools_used?: string[];
  status?: "streaming" | "complete" | "pending_approval";
  thread_id?: string;
  pending_action?: {
    tool: string;
    to?: string;
    subject?: string;
    body?: string;
    thread_id?: string;
    message_id?: string;
  };
}

// ---------------------------------------------------------------------------
// Lightweight markdown renderer — responsive & clean
// Handles: **bold**, *italic*, # headings, - bullets, 1. numbered, `code`, ---
// ---------------------------------------------------------------------------
function MarkdownMessage({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  const renderInline = (line: string): React.ReactNode => {
    // Split on **bold**, *italic*, `code`
    const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
    return parts.map((part, idx) => {
      if (part.startsWith("**") && part.endsWith("**"))
        return (
          <strong key={idx} className="font-semibold text-[#1f1e1c]">
            {part.slice(2, -2)}
          </strong>
        );
      if (part.startsWith("*") && part.endsWith("*"))
        return <em key={idx}>{part.slice(1, -1)}</em>;
      if (part.startsWith("`") && part.endsWith("`"))
        return (
          <code
            key={idx}
            className="bg-[#f2efe9] text-[#c44332] rounded px-1 py-0.5 text-[11px] font-mono break-all"
          >
            {part.slice(1, -1)}
          </code>
        );
      return part;
    });
  };

  while (i < lines.length) {
    const line = lines[i];

    // Headings
    if (line.startsWith("### ")) {
      elements.push(
        <h4
          key={i}
          className="font-bold text-[#1f1e1c] text-xs sm:text-sm mt-3 mb-1 break-words"
        >
          {line.slice(4)}
        </h4>,
      );
    } else if (line.startsWith("## ")) {
      elements.push(
        <h3
          key={i}
          className="font-bold text-[#1f1e1c] text-sm sm:text-base mt-3 mb-1 break-words"
        >
          {line.slice(3)}
        </h3>,
      );
    } else if (line.startsWith("# ")) {
      elements.push(
        <h2
          key={i}
          className="font-bold text-[#1f1e1c] text-base sm:text-lg mt-3 mb-1 break-words"
        >
          {line.slice(2)}
        </h2>,
      );
    }
    // Blockquote — strip the ">" prefix, render content normally
    else if (line.startsWith("> ") || line === ">") {
      if (line === ">") {
        elements.push(<div key={i} className="h-1" />);
      } else {
        elements.push(
          <div
            key={i}
            className="border-l-2 border-[#d94f3d]/60 pl-3 py-0.5 my-1.5 text-xs sm:text-sm italic text-[#5c5852] leading-relaxed break-words"
          >
            {renderInline(line.slice(2))}
          </div>,
        );
      }
    }
    // Horizontal rule
    else if (line.match(/^---+$/)) {
      elements.push(<hr key={i} className="my-2.5 sm:my-3 border-[#e8e4de]" />);
    }
    // Bullet list (-, •, or * prefix)
    else if (
      line.startsWith("- ") ||
      line.startsWith("• ") ||
      line.startsWith("* ")
    ) {
      const listItems: React.ReactNode[] = [];
      while (
        i < lines.length &&
        (lines[i].startsWith("- ") ||
          lines[i].startsWith("• ") ||
          lines[i].startsWith("* "))
      ) {
        const content = lines[i].startsWith("* ")
          ? lines[i].slice(2)
          : lines[i].slice(2);
        listItems.push(
          <li key={i} className="flex gap-2 items-start break-words">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#d94f3d] shrink-0" />
            <span className="flex-1">{renderInline(content)}</span>
          </li>,
        );
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="my-2 space-y-1.5 ml-0.5">
          {listItems}
        </ul>,
      );
      continue;
    }
    // Numbered list
    else if (/^\d+\.\s/.test(line)) {
      const listItems: React.ReactNode[] = [];
      let n = 1;
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        const content = lines[i].replace(/^\d+\.\s/, "");
        listItems.push(
          <li key={i} className="flex gap-2 items-start break-words">
            <span className="shrink-0 font-semibold text-[#d94f3d] text-xs mt-0.5 w-4">
              {n}.
            </span>
            <span className="flex-1">{renderInline(content)}</span>
          </li>,
        );
        i++;
        n++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="my-2 space-y-1.5 ml-0.5">
          {listItems}
        </ol>,
      );
      continue;
    }
    // Empty line → spacing
    else if (line.trim() === "") {
      elements.push(<div key={i} className="h-1.5 sm:h-2" />);
    }
    // Normal paragraph line
    else {
      elements.push(
        <p key={i} className="leading-relaxed break-words">
          {renderInline(line)}
        </p>,
      );
    }

    i++;
  }

  return (
    <div className="space-y-0.5 text-xs sm:text-sm leading-relaxed overflow-hidden">
      {elements}
    </div>
  );
}

// A full conversation stored in localStorage (for the conversations panel)
interface StoredConversation {
  id: string;
  title: string; // derived from the first user message
  messages: ChatMessage[];
  created_at: number; // unix timestamp ms
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputPrompt, setInputPrompt] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Conversation history (stored in localStorage)
  const [currentConvId, setCurrentConvId] = useState<string>("");
  const [conversations, setConversations] = useState<StoredConversation[]>([]);
  const [showConvPanel, setShowConvPanel] = useState(false);

  const STORAGE_KEY = "email_agent_conversations";
  const HISTORY_LIMIT = 6; // number of past messages sent to the LLM

  // Load all stored conversations from localStorage
  const loadConversations = (): StoredConversation[] => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  };

  // Save the current messages under the current conversation ID
  const saveConversation = (convId: string, msgs: ChatMessage[]) => {
    if (!convId || msgs.length === 0) return;
    const all = loadConversations();
    const existing = all.find((c) => c.id === convId);
    const firstUserMsg =
      msgs.find((m) => m.sender === "user")?.text || "New chat";
    const title =
      firstUserMsg.length > 50
        ? firstUserMsg.slice(0, 47) + "..."
        : firstUserMsg;

    if (existing) {
      existing.messages = msgs;
      existing.title = title;
    } else {
      all.unshift({
        id: convId,
        title,
        messages: msgs,
        created_at: Date.now(),
      });
    }
    // Keep at most 30 conversations
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all.slice(0, 30)));
    setConversations(all.slice(0, 30));
  };

  // Start a fresh conversation (called by "New Chat" button)
  const startNewConversation = () => {
    const newId = `conv_${Date.now()}`;
    setCurrentConvId(newId);
    setMessages([]);
    setShowConvPanel(false);
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };

  // Restore a past conversation from localStorage
  const restoreConversation = (conv: StoredConversation) => {
    setCurrentConvId(conv.id);
    setMessages(conv.messages);
    setShowConvPanel(false);
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };

  // Delete a past conversation
  const deleteConversation = (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    const all = loadConversations().filter((c) => c.id !== convId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    setConversations(all);
    if (currentConvId === convId) {
      startNewConversation();
    }
  };

  // Email Detail Modal State
  const [selectedEmail, setSelectedEmail] = useState<EmailDetail | null>(null);
  const [loadingEmailDetail, setLoadingEmailDetail] = useState(false);
  const [emailViewMode, setEmailViewMode] = useState<"html" | "plain">("html");

  const chatBottomRef = useRef<HTMLDivElement>(null);

  const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  // Check screen size on mount to initialize sidebar state
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth >= 1024) {
      setIsSidebarOpen(true);
    }
  }, []);

  // Load saved conversations on initial mount
  useEffect(() => {
    const saved = loadConversations();
    setConversations(saved);
    if (!currentConvId) {
      setCurrentConvId(`conv_${Date.now()}`);
    }
  }, []);

  useEffect(() => {
    // Check auth status
    fetch(`${backendUrl}/auth/me`, {
      credentials: "include",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          setUser(data.user);
          const saved = loadConversations();
          setConversations(saved);
          // By default, start with a fresh new chat session on entry
          setCurrentConvId(`conv_${Date.now()}`);
          setMessages([]);
        }
      })
      .catch((err) => {
        console.error("Failed to check auth state:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [backendUrl]);

  useEffect(() => {
    if (user) {
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isTyping, user]);

  const handleConnectGmail = () => {
    window.location.href = `${backendUrl}/auth/google`;
  };

  const handleLogout = async () => {
    try {
      await fetch(`${backendUrl}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      setUser(null);
      setMessages([]);
      setSelectedEmail(null);
    } catch (err) {
      console.error("Failed to logout:", err);
    }
  };

  const handleOpenEmailDetail = async (messageId: string) => {
    setLoadingEmailDetail(true);
    setSelectedEmail(null);
    try {
      const res = await fetch(`${backendUrl}/api/emails/${messageId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch email details");
      const data: EmailDetail = await res.json();
      setSelectedEmail(data);
      setEmailViewMode(data.body_html ? "html" : "plain");
    } catch (err) {
      console.error("Error fetching email details:", err);
    } finally {
      setLoadingEmailDetail(false);
    }
  };

  // Reads an SSE stream from the backend and updates the message in real time.
  const readStream = async (
    url: string,
    body: object,
    streamMsgId: string,
    convId?: string,
  ) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });

    if (!res.ok || !res.body) {
      throw new Error(`HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Accumulate chunks — a single read() may contain partial SSE lines
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop()!; // keep the last incomplete line for next iteration

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const event = JSON.parse(line.slice(6));

        if (event.type === "token") {
          // Append this token to the streaming message
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamMsgId ? { ...m, text: m.text + event.content } : m,
            ),
          );
        } else if (event.type === "done") {
          // Stream finished — mark complete, attach tool badges, and save conversation
          setMessages((prev) => {
            const updated = prev.map((m) =>
              m.id === streamMsgId
                ? {
                    ...m,
                    status: "complete" as const,
                    tools_used: event.tools_used || [],
                  }
                : m,
            );
            if (convId) {
              saveConversation(convId, updated);
            }
            return updated;
          });
        } else if (event.type === "pending_approval") {
          // Agent paused for send_email / reply / delete — show approval card
          setMessages((prev) => {
            const updated = prev.map((m) =>
              m.id === streamMsgId
                ? {
                    ...m,
                    text: "",
                    status: "pending_approval" as const,
                    thread_id: event.thread_id,
                    pending_action: event.pending_action,
                  }
                : m,
            );
            if (convId) {
              saveConversation(convId, updated);
            }
            return updated;
          });
        } else if (event.type === "error") {
          setMessages((prev) => {
            const updated = prev.map((m) =>
              m.id === streamMsgId
                ? {
                    ...m,
                    text: `⚠️ ${event.message}`,
                    status: "complete" as const,
                  }
                : m,
            );
            if (convId) {
              saveConversation(convId, updated);
            }
            return updated;
          });
        }
      }
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputPrompt).trim();
    if (!query) return;

    // Collect last N messages as conversation history (filtering out empty/pending items)
    const history = messages
      .filter(
        (m) =>
          m.text && m.text.trim().length > 0 && m.status !== "pending_approval",
      )
      .slice(-HISTORY_LIMIT)
      .map((m) => ({
        role: m.sender,
        content: m.text,
      }));

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      sender: "user",
      text: query,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    // Create a placeholder message that tokens will stream into
    const streamId = (Date.now() + 1).toString();
    const streamMsg: ChatMessage = {
      id: streamId,
      sender: "assistant",
      text: "",
      status: "streaming",
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    const convId = currentConvId || `conv_${Date.now()}`;
    if (!currentConvId) {
      setCurrentConvId(convId);
    }

    setMessages((prev) => [...prev, userMessage, streamMsg]);
    setInputPrompt("");
    setIsTyping(true);

    try {
      await readStream(
        `${backendUrl}/agent/chat`,
        { message: query, history },
        streamId,
        convId,
      );
    } catch (err) {
      console.error("Stream error:", err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamId
            ? {
                ...m,
                text: "⚠️ Failed to reach the agent. Please make sure the backend is running.",
                status: "complete",
              }
            : m,
        ),
      );
    } finally {
      setIsTyping(false);
    }
  };

  const handleResume = async (
    msgId: string,
    thread_id: string,
    action: "approve" | "cancel",
  ) => {
    // Replace approval card with a "processing" placeholder, then stream the result
    const streamId = (Date.now() + 1).toString();
    const label =
      action === "approve" ? "Processing action..." : "Cancelling...";
    const convId = currentConvId || `conv_${Date.now()}`;

    setMessages((prev) => [
      ...prev.map((m) =>
        m.id === msgId
          ? {
              ...m,
              status: "complete" as const,
              text: `✅ ${label}`,
              pending_action: undefined,
            }
          : m,
      ),
      {
        id: streamId,
        sender: "assistant" as const,
        text: "",
        status: "streaming" as const,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    ]);
    setIsTyping(true);

    try {
      await readStream(
        `${backendUrl}/agent/resume`,
        { thread_id, action },
        streamId,
        convId,
      );
    } catch (err) {
      console.error("Resume stream error:", err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamId
            ? {
                ...m,
                text: "⚠️ Failed to resume. Please try again.",
                status: "complete",
              }
            : m,
        ),
      );
    } finally {
      setIsTyping(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fbf9f6] px-6 font-sans">
        <div className="flex flex-col items-center">
          <div className="relative flex h-16 w-16 items-center justify-center">
            <div className="absolute h-16 w-16 animate-ping rounded-full bg-[#d94f3d]/15" />
            <img
              src="/favicon.svg"
              alt="MailPilot AI"
              className="relative h-12 w-12 rounded-2xl shadow-sm"
            />
          </div>
          <p className="mt-5 text-sm font-medium text-[#716e69]">
            Connecting to workspace...
          </p>
        </div>
      </main>
    );
  }

  // ==========================================
  // VIEW 1: AUTHENTICATED DASHBOARD & CHAT
  // ==========================================
  if (user) {
    return (
      <div className="flex h-screen bg-[#f7f5f2] font-sans text-[#242321] overflow-hidden relative">
        {/* Mobile Backdrop Overlay */}
        {isSidebarOpen && (
          <div
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 lg:hidden animate-in fade-in duration-200"
          />
        )}

        {/* Left Sidebar (Drawer on mobile/tablet, dockable on desktop) */}
        <aside
          className={`
            fixed inset-y-0 left-0 z-50 lg:static lg:z-auto
            w-72 sm:w-80 h-full
            ${
              isSidebarOpen
                ? "translate-x-0 lg:w-72 xl:w-80"
                : "-translate-x-full lg:w-0 lg:-translate-x-full"
            }
            transition-all duration-300 ease-in-out border-r border-[#e8e4de] bg-white flex flex-col justify-between overflow-hidden shrink-0 shadow-2xl lg:shadow-none
          `}
        >
          <div className="flex flex-col h-full p-4 overflow-y-auto">
            {/* App Brand & Mobile Close Button */}
            <div className="flex items-center justify-between gap-2 px-2 py-2 mb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src="/favicon.svg"
                  alt="MailPilot AI"
                  className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl shadow-sm shrink-0"
                />
                <div className="truncate">
                  <h2 className="text-sm font-semibold tracking-tight text-[#1f1e1c] truncate">
                    MailPilot AI
                  </h2>
                  <span className="text-[11px] text-[#8c8881]">
                    Workspace Co-pilot
                  </span>
                </div>
              </div>

              {/* Close Button on Mobile/Tablet */}
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="lg:hidden p-1.5 rounded-lg text-[#716e69] hover:bg-[#f2efe9] hover:text-[#1f1e1c] transition-colors cursor-pointer"
                title="Close sidebar"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* New Chat Button */}
            <div className="mb-4">
              <button
                onClick={startNewConversation}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-[#242321] hover:bg-[#3b3834] text-white text-xs font-semibold shadow-sm transition-all cursor-pointer group"
              >
                <span className="text-base font-bold leading-none group-hover:scale-110 transition-transform">
                  +
                </span>
                <span>Start New Chat</span>
              </button>
            </div>

            {/* Past Conversations List */}
            <div className="mb-5 flex flex-col flex-1 min-h-0">
              <div className="flex items-center justify-between px-2 mb-2">
                <span className="text-xs font-semibold text-[#8c8881] uppercase tracking-wider">
                  Past Conversations ({conversations.length})
                </span>
              </div>
              <div className="space-y-1 overflow-y-auto pr-1 flex-1">
                {conversations.length === 0 ? (
                  <div className="p-3 text-center rounded-xl bg-[#faf8f5] border border-dashed border-[#ebe7e1]">
                    <p className="text-[11px] text-[#a09c96]">
                      No past conversations yet
                    </p>
                  </div>
                ) : (
                  conversations.map((conv) => (
                    <div
                      key={conv.id}
                      onClick={() => restoreConversation(conv)}
                      className={`group flex items-center justify-between p-2.5 rounded-xl text-xs cursor-pointer transition-all ${
                        conv.id === currentConvId
                          ? "bg-[#fff5f2] text-[#d94f3d] font-semibold border border-[#f7d5ce]"
                          : "hover:bg-[#f7f5f2] text-[#3b3834] border border-transparent"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-xs shrink-0">💬</span>
                        <span className="truncate">{conv.title}</span>
                      </div>
                      <button
                        onClick={(e) => deleteConversation(e, conv.id)}
                        className="opacity-60 lg:opacity-0 group-hover:opacity-100 p-1 text-[#a09c96] hover:text-red-600 transition-opacity rounded cursor-pointer ml-1 shrink-0"
                        title="Delete chat"
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Account Status Card */}
            <div className="mt-auto pt-3 border-t border-[#e8e4de] shrink-0">
              <div className="rounded-xl bg-[#fcfbfa] p-3 border border-[#ebe7e1]">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[11px] font-medium text-emerald-700">
                    Gmail Connected
                  </span>
                </div>
                <p className="text-xs font-semibold text-[#242321] truncate">
                  {user.name || "Authenticated User"}
                </p>
                <p className="text-[11px] text-[#716e69] truncate mb-2.5">
                  {user.email}
                </p>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg border border-[#dedad3] bg-white text-xs font-medium text-[#5e5b56] hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors cursor-pointer"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                  Disconnect
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content / Chat Workspace */}
        <main className="flex-1 flex flex-col h-full overflow-hidden bg-[#f7f5f2] min-w-0">
          {/* Top Bar Header */}
          <header className="h-14 border-b border-[#e8e4de] bg-white/80 backdrop-blur-md px-3 sm:px-5 flex items-center justify-between shrink-0 gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              {/* Sidebar Toggle Button */}
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="p-2 rounded-xl text-[#716e69] hover:bg-[#f2efe9] hover:text-[#242321] transition-colors cursor-pointer shrink-0"
                title="Toggle Sidebar"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>

              {/* Brand Logo & Name */}
              <div className="flex items-center gap-2 shrink-0">
                <img
                  src="/favicon.svg"
                  alt="MailPilot AI"
                  className="h-7 w-7 rounded-lg shadow-2xs shrink-0"
                />
                <span className="font-semibold text-xs sm:text-sm text-[#242321] hidden xs:inline truncate">
                  MailPilot AI
                </span>
                <span className="hidden md:inline-block rounded-full bg-[#f2efe9] px-2 py-0.5 text-[10px] font-medium text-[#716e69]">
                  Live
                </span>
              </div>

              {/* New Chat Button */}
              <button
                onClick={startNewConversation}
                className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-xl bg-white border border-[#dedad3] hover:border-[#d94f3d] text-xs font-semibold text-[#242321] hover:text-[#d94f3d] transition-colors cursor-pointer shrink-0"
                title="Start a new chat thread"
              >
                <span className="text-sm font-bold leading-none">+</span>
                <span className="hidden sm:inline">New Chat</span>
              </button>

              {/* Past Chats Dropdown */}
              <div className="relative shrink-0">
                <button
                  onClick={() => setShowConvPanel(!showConvPanel)}
                  className="inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl bg-white border border-[#dedad3] hover:border-[#d94f3d] text-xs font-semibold text-[#242321] hover:text-[#d94f3d] transition-colors cursor-pointer"
                  title="View conversation history"
                >
                  <span>💬</span>
                  <span className="hidden sm:inline">Chats</span>
                  <span className="text-[11px] font-bold text-[#716e69]">
                    ({conversations.length})
                  </span>
                </button>
                {showConvPanel && (
                  <div className="fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:left-0 sm:top-full mt-1 w-auto sm:w-80 max-h-80 overflow-y-auto bg-white border border-[#e8e4de] rounded-2xl shadow-xl z-50 p-2 space-y-1 animate-in fade-in duration-150">
                    <div className="text-[11px] font-bold text-[#a09c96] px-2 py-1 uppercase tracking-wider flex justify-between items-center">
                      <span>Saved Chats</span>
                      <button
                        onClick={() => setShowConvPanel(false)}
                        className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                    {conversations.length === 0 ? (
                      <p className="text-xs text-gray-400 p-3 text-center">
                        No past chats yet
                      </p>
                    ) : (
                      conversations.map((c) => (
                        <div
                          key={c.id}
                          onClick={() => restoreConversation(c)}
                          className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer transition-colors ${
                            c.id === currentConvId
                              ? "bg-[#fff7f5] text-[#d94f3d] font-semibold"
                              : "hover:bg-[#faf8f5] text-[#242321]"
                          }`}
                        >
                          <span className="truncate max-w-[200px]">
                            {c.title}
                          </span>
                          <button
                            onClick={(e) => deleteConversation(e, c.id)}
                            className="text-gray-300 hover:text-red-500 p-1 rounded transition-colors"
                            title="Delete chat"
                          >
                            🗑️
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* User Profile Badge */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1.5 sm:gap-2 rounded-full bg-[#fbf9f6] border border-[#e8e4de] px-2 sm:px-3 py-1 text-xs">
                <div className="h-5 w-5 rounded-full bg-[#d94f3d] text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                  {user.name ? user.name.charAt(0).toUpperCase() : "U"}
                </div>
                <span className="font-medium text-[#3b3834] max-w-[80px] sm:max-w-[150px] md:max-w-[200px] truncate hidden xs:inline">
                  {user.name || user.email}
                </span>
              </div>
            </div>
          </header>

          {/* Chat Messages Scrollable Area */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-5 md:p-6 space-y-4">
            <div className="max-w-3xl mx-auto space-y-4 sm:space-y-5">
              {/* Empty state welcome dashboard */}
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-2 sm:p-4 md:p-6 max-w-2xl mx-auto animate-in fade-in duration-300">
                  <div className="inline-flex items-center gap-2 rounded-full bg-white border border-[#e8e4de] px-3 py-1 text-[11px] sm:text-xs font-semibold text-[#5c5852] shadow-2xs mb-3 sm:mb-4">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Gemini 2.0 & LangGraph Co-Pilot Ready</span>
                  </div>

                  <h2 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-[#1f1e1c] tracking-tight">
                    Hello, {user.name ? user.name.split(" ")[0] : "there"}!
                  </h2>
                  <p className="text-xs sm:text-sm text-[#716e69] mt-1.5 sm:mt-2 max-w-lg leading-relaxed">
                    Ask me anything about your inbox in plain English or pick a
                    quick workflow below:
                  </p>

                  {/* 6 Quick Functionality Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3.5 mt-5 sm:mt-6 w-full text-left">
                    <button
                      onClick={() =>
                        handleSendMessage(
                          "Show my latest 5 emails with their senders, subjects, and dates",
                        )
                      }
                      className="p-3.5 sm:p-4 rounded-2xl bg-white border border-[#e8e4de] hover:border-[#d94f3d]/50 hover:bg-[#fff9f8] transition-all text-xs group cursor-pointer shadow-xs"
                    >
                      <div className="flex items-center gap-2.5 mb-1">
                        <span className="h-7 w-7 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center text-sm font-semibold shrink-0">
                          📬
                        </span>
                        <span className="font-semibold text-xs sm:text-sm text-[#1f1e1c] group-hover:text-[#d94f3d] transition-colors truncate">
                          Scan Latest Emails
                        </span>
                      </div>
                      <p className="text-[11px] text-[#716e69] leading-relaxed">
                        Fetch and inspect your most recent 5 inbox messages
                      </p>
                    </button>

                    <button
                      onClick={() =>
                        handleSendMessage(
                          "Summarize all my unread emails and highlight important notices",
                        )
                      }
                      className="p-3.5 sm:p-4 rounded-2xl bg-white border border-[#e8e4de] hover:border-[#d94f3d]/50 hover:bg-[#fff9f8] transition-all text-xs group cursor-pointer shadow-xs"
                    >
                      <div className="flex items-center gap-2.5 mb-1">
                        <span className="h-7 w-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-sm font-semibold shrink-0">
                          📊
                        </span>
                        <span className="font-semibold text-xs sm:text-sm text-[#1f1e1c] group-hover:text-[#d94f3d] transition-colors truncate">
                          Summarize Unread
                        </span>
                      </div>
                      <p className="text-[11px] text-[#716e69] leading-relaxed">
                        Extract executive summaries from your unread inbox
                      </p>
                    </button>

                    <button
                      onClick={() =>
                        handleSendMessage(
                          "Scan my inbox and find urgent action items or requests waiting for my reply",
                        )
                      }
                      className="p-3.5 sm:p-4 rounded-2xl bg-white border border-[#e8e4de] hover:border-[#d94f3d]/50 hover:bg-[#fff9f8] transition-all text-xs group cursor-pointer shadow-xs"
                    >
                      <div className="flex items-center gap-2.5 mb-1">
                        <span className="h-7 w-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center text-sm font-semibold shrink-0">
                          ⚡
                        </span>
                        <span className="font-semibold text-xs sm:text-sm text-[#1f1e1c] group-hover:text-[#d94f3d] transition-colors truncate">
                          Urgent Action Items
                        </span>
                      </div>
                      <p className="text-[11px] text-[#716e69] leading-relaxed">
                        Identify emails needing urgent reply or deadlines
                      </p>
                    </button>

                    <button
                      onClick={() =>
                        handleSendMessage(
                          "Help me compose a professional email draft",
                        )
                      }
                      className="p-3.5 sm:p-4 rounded-2xl bg-white border border-[#e8e4de] hover:border-[#d94f3d]/50 hover:bg-[#fff9f8] transition-all text-xs group cursor-pointer shadow-xs"
                    >
                      <div className="flex items-center gap-2.5 mb-1">
                        <span className="h-7 w-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center text-sm font-semibold shrink-0">
                          📝
                        </span>
                        <span className="font-semibold text-xs sm:text-sm text-[#1f1e1c] group-hover:text-[#d94f3d] transition-colors truncate">
                          Draft New Email
                        </span>
                      </div>
                      <p className="text-[11px] text-[#716e69] leading-relaxed">
                        Compose a tailored email draft with your signature
                      </p>
                    </button>

                    <button
                      onClick={() =>
                        handleSendMessage(
                          "Search for recent email threads and read the full conversation details",
                        )
                      }
                      className="p-3.5 sm:p-4 rounded-2xl bg-white border border-[#e8e4de] hover:border-[#d94f3d]/50 hover:bg-[#fff9f8] transition-all text-xs group cursor-pointer shadow-xs"
                    >
                      <div className="flex items-center gap-2.5 mb-1">
                        <span className="h-7 w-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center text-sm font-semibold shrink-0">
                          🧵
                        </span>
                        <span className="font-semibold text-xs sm:text-sm text-[#1f1e1c] group-hover:text-[#d94f3d] transition-colors truncate">
                          Deep Thread Reader
                        </span>
                      </div>
                      <p className="text-[11px] text-[#716e69] leading-relaxed">
                        Inspect multi-turn conversations and message context
                      </p>
                    </button>

                    <button
                      onClick={() =>
                        handleSendMessage(
                          "Find newsletters or promotional emails so I can archive or clean them up",
                        )
                      }
                      className="p-3.5 sm:p-4 rounded-2xl bg-white border border-[#e8e4de] hover:border-[#d94f3d]/50 hover:bg-[#fff9f8] transition-all text-xs group cursor-pointer shadow-xs"
                    >
                      <div className="flex items-center gap-2.5 mb-1">
                        <span className="h-7 w-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center text-sm font-semibold shrink-0">
                          🧹
                        </span>
                        <span className="font-semibold text-xs sm:text-sm text-[#1f1e1c] group-hover:text-[#d94f3d] transition-colors truncate">
                          Inbox Triage & Clean
                        </span>
                      </div>
                      <p className="text-[11px] text-[#716e69] leading-relaxed">
                        Triage, archive, label, or clean up newsletter clutter
                      </p>
                    </button>
                  </div>

                  {/* Safety badge */}
                  <div className="mt-5 sm:mt-6 flex items-center justify-center gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] text-[#8c8881] text-center">
                    <span>🔒</span>
                    <span>
                      All send, reply, and delete operations require your
                      explicit approval before execution.
                    </span>
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-2 sm:gap-3 ${
                    msg.sender === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {/* AI Avatar */}
                  {msg.sender === "assistant" && (
                    <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-xl bg-gradient-to-tr from-[#d94f3d] to-[#e97745] flex items-center justify-center text-white text-[10px] sm:text-xs font-bold shrink-0 mt-1 shadow-xs">
                      AI
                    </div>
                  )}

                  <div
                    className={`max-w-[88%] sm:max-w-xl md:max-w-2xl rounded-2xl leading-relaxed shadow-xs overflow-hidden ${
                      msg.sender === "user"
                        ? "bg-[#242321] text-white rounded-tr-xs px-3.5 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm"
                        : "bg-white text-[#242321] border border-[#e8e4de] rounded-tl-xs px-4 sm:px-5 py-3.5 sm:py-4 text-xs sm:text-sm"
                    }`}
                  >
                    {/* Message body */}
                    {msg.sender === "user" ? (
                      <p className="whitespace-pre-wrap break-words">
                        {msg.text}
                      </p>
                    ) : msg.status === "pending_approval" &&
                      msg.pending_action ? (
                      /* ── Approval Card ─────────────────────────────── */
                      <div className="space-y-3">
                        {msg.pending_action.tool === "send_email" && (
                          <>
                            <div className="flex items-center gap-2">
                              <span className="text-base">📤</span>
                              <span className="font-semibold text-[#1f1e1c] text-xs sm:text-sm">
                                Ready to send this email
                              </span>
                            </div>

                            <div className="rounded-xl bg-[#faf8f5] border border-[#e8e4de] p-3 space-y-2 text-xs">
                              <div className="flex gap-2 break-all">
                                <span className="font-semibold text-[#716e69] w-12 sm:w-14 shrink-0">
                                  To:
                                </span>
                                <span className="text-[#1f1e1c] font-medium">
                                  {msg.pending_action.to}
                                </span>
                              </div>
                              <div className="flex gap-2 break-words">
                                <span className="font-semibold text-[#716e69] w-12 sm:w-14 shrink-0">
                                  Subject:
                                </span>
                                <span className="text-[#1f1e1c] font-medium">
                                  {msg.pending_action.subject}
                                </span>
                              </div>
                              <div className="pt-2 border-t border-[#ede9e2]">
                                <span className="font-semibold text-[#716e69] block mb-1">
                                  Body:
                                </span>
                                <pre className="whitespace-pre-wrap font-sans text-[#3b3834] leading-relaxed max-h-40 overflow-y-auto break-words text-[11px] sm:text-xs">
                                  {msg.pending_action.body}
                                </pre>
                              </div>
                            </div>
                          </>
                        )}

                        {msg.pending_action.tool === "reply_email" && (
                          <>
                            <div className="flex items-center gap-2">
                              <span className="text-base">↩️</span>
                              <span className="font-semibold text-[#1f1e1c] text-xs sm:text-sm">
                                Ready to send this reply
                              </span>
                            </div>

                            <div className="rounded-xl bg-[#faf8f5] border border-[#e8e4de] p-3 space-y-2 text-xs">
                              <div className="flex gap-2 break-all">
                                <span className="font-semibold text-[#716e69] w-16 sm:w-20 shrink-0">
                                  Thread ID:
                                </span>
                                <span className="text-[#1f1e1c] font-mono text-[11px]">
                                  {msg.pending_action.thread_id}
                                </span>
                              </div>
                              <div className="pt-2 border-t border-[#ede9e2]">
                                <span className="font-semibold text-[#716e69] block mb-1">
                                  Reply Content:
                                </span>
                                <pre className="whitespace-pre-wrap font-sans text-[#3b3834] leading-relaxed max-h-40 overflow-y-auto break-words text-[11px] sm:text-xs">
                                  {msg.pending_action.body}
                                </pre>
                              </div>
                            </div>
                          </>
                        )}

                        {msg.pending_action.tool === "delete_email" && (
                          <>
                            <div className="flex items-center gap-2">
                              <span className="text-base">🗑️</span>
                              <span className="font-semibold text-red-600 text-xs sm:text-sm">
                                Confirm Moving Email to Trash
                              </span>
                            </div>

                            <div className="rounded-xl bg-red-50/50 border border-red-200 p-3 space-y-2 text-xs">
                              <div className="flex gap-2 break-all">
                                <span className="font-semibold text-red-700 w-20 sm:w-24 shrink-0">
                                  Message ID:
                                </span>
                                <span className="text-red-900 font-mono text-[11px]">
                                  {msg.pending_action.message_id}
                                </span>
                              </div>
                              <p className="text-red-600 text-[11px] pt-1">
                                ⚠️ This message will be moved to your Gmail
                                Trash folder.
                              </p>
                            </div>
                          </>
                        )}

                        <div className="flex flex-col sm:flex-row gap-2 pt-1">
                          <button
                            onClick={() =>
                              handleResume(msg.id, msg.thread_id!, "approve")
                            }
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3.5 rounded-xl text-white text-xs font-semibold transition-colors cursor-pointer ${
                              msg.pending_action.tool === "delete_email"
                                ? "bg-red-500 hover:bg-red-600"
                                : "bg-emerald-500 hover:bg-emerald-600"
                            }`}
                          >
                            {msg.pending_action.tool === "delete_email"
                              ? "🗑️ Move to Trash"
                              : "✅ Confirm & Send"}
                          </button>
                          <button
                            onClick={() =>
                              handleResume(msg.id, msg.thread_id!, "cancel")
                            }
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3.5 rounded-xl bg-white border border-[#dedad3] hover:bg-red-50 hover:border-red-200 hover:text-red-600 text-[#5e5b56] text-xs font-semibold transition-colors cursor-pointer"
                          >
                            ❌ Cancel
                          </button>
                        </div>
                      </div>
                    ) : msg.status === "streaming" && !msg.text ? (
                      /* Empty streaming placeholder — show Thinking dots */
                      <span className="flex items-center gap-1.5 text-[#a09c96] text-xs">
                        Thinking
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-[#d94f3d] animate-bounce"
                          style={{ animationDelay: "0ms" }}
                        />
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-[#d94f3d] animate-bounce"
                          style={{ animationDelay: "150ms" }}
                        />
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-[#d94f3d] animate-bounce"
                          style={{ animationDelay: "300ms" }}
                        />
                      </span>
                    ) : (
                      <MarkdownMessage text={msg.text} />
                    )}

                    {/* Tool usage badges */}
                    {msg.sender === "assistant" &&
                      msg.tools_used &&
                      msg.tools_used.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-[#f0ece6] flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] text-[#a09c96] font-medium mr-1 shrink-0">
                            Used:
                          </span>
                          {Array.from(new Set(msg.tools_used)).map(
                            (tool, i) => {
                              const icons: Record<string, string> = {
                                search_emails: "🔍",
                                read_email: "📖",
                                get_thread: "🧵",
                                create_draft: "📝",
                                send_email: "📤",
                                reply_email: "↩️",
                                archive_email: "📥",
                                mark_as_read: "👁️",
                                mark_as_unread: "✉️",
                                add_label: "🏷️",
                                delete_email: "🗑️",
                              };
                              return (
                                <span
                                  key={i}
                                  className="inline-flex items-center gap-1 rounded-full bg-[#fff7f5] border border-[#f5d5d0] px-2 py-0.5 text-[10px] font-semibold text-[#c44332] shrink-0"
                                >
                                  {icons[tool] || "🔧"}{" "}
                                  {tool.replace(/_/g, " ")}
                                </span>
                              );
                            },
                          )}
                        </div>
                      )}

                    {/* Email cards list */}
                    {msg.type === "emails_list" &&
                      msg.emails &&
                      msg.emails.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {msg.emails.map((email) => (
                            <div
                              key={email.id}
                              onClick={() => handleOpenEmailDetail(email.id)}
                              className="group rounded-xl border border-[#ebe7e1] bg-[#faf8f5] hover:bg-white hover:border-[#d94f3d]/50 p-3 text-left transition-all cursor-pointer hover:shadow-xs"
                            >
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="font-semibold text-xs text-[#1f1e1c] group-hover:text-[#d94f3d] transition-colors truncate">
                                  {email.sender}
                                </span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {email.unread && (
                                    <span className="rounded-full bg-[#d94f3d]/10 px-1.5 py-0.5 text-[9px] font-semibold text-[#d94f3d]">
                                      Unread
                                    </span>
                                  )}
                                  <span className="text-[10px] text-[#9e9a93]">
                                    {email.date
                                      ? new Date(
                                          email.date,
                                        ).toLocaleDateString()
                                      : ""}
                                  </span>
                                </div>
                              </div>
                              <h4 className="font-semibold text-xs text-[#33302c] mb-1 truncate">
                                {email.subject}
                              </h4>
                              <p className="text-xs text-[#716e69] line-clamp-2 leading-relaxed">
                                {email.snippet}
                              </p>
                              <div className="mt-2 pt-1.5 border-t border-[#f0ece6] text-[10px] text-[#d94f3d] font-medium">
                                Click to read full email body →
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                    {/* Timestamp */}
                    <span
                      className={`block mt-2 text-[10px] ${
                        msg.sender === "user"
                          ? "text-gray-400 text-right"
                          : "text-[#b0aca6]"
                      }`}
                    >
                      {msg.timestamp}
                    </span>
                  </div>

                  {/* User Avatar */}
                  {msg.sender === "user" && (
                    <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-xl bg-[#3b3834] text-white flex items-center justify-center text-[10px] sm:text-xs font-semibold shrink-0 mt-1">
                      {user.name ? user.name.charAt(0).toUpperCase() : "U"}
                    </div>
                  )}
                </div>
              ))}

              {/* Typing indicator */}
              {isTyping && !messages.some((m) => m.status === "streaming") && (
                <div className="flex gap-2 sm:gap-3 justify-start">
                  <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-xl bg-gradient-to-tr from-[#d94f3d] to-[#e97745] flex items-center justify-center text-white text-[10px] sm:text-xs font-bold shrink-0 mt-1 shadow-xs">
                    AI
                  </div>
                  <div className="rounded-2xl rounded-tl-xs bg-white border border-[#e8e4de] px-3.5 py-2.5 sm:px-4 sm:py-3 flex items-center gap-1.5 shadow-xs">
                    <span className="text-xs text-[#a09c96] mr-1">
                      Thinking
                    </span>
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-[#d94f3d] animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    />
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-[#d94f3d] animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    />
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-[#d94f3d] animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    />
                  </div>
                </div>
              )}

              <div ref={chatBottomRef} />
            </div>
          </div>

          {/* Chat Input Bar */}
          <div className="p-3 sm:p-4 md:p-5 border-t border-[#e8e4de] bg-white/70 backdrop-blur-md shrink-0">
            <div className="max-w-3xl mx-auto">
              {/* Quick suggestions pills */}
              <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-1 no-scrollbar text-xs">
                <button
                  onClick={() => handleSendMessage("Show my latest 5 emails")}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[#e0dcce] hover:border-[#d94f3d]/50 hover:bg-[#fff7f5] text-[#595650] hover:text-[#d94f3d] text-xs transition-all cursor-pointer"
                >
                  <span>📬</span>
                  <span>Recent Emails</span>
                </button>
                <button
                  onClick={() =>
                    handleSendMessage("Summarize my unread emails")
                  }
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[#e0dcce] hover:border-[#d94f3d]/50 hover:bg-[#fff7f5] text-[#595650] hover:text-[#d94f3d] text-xs transition-all cursor-pointer"
                >
                  <span>📊</span>
                  <span>Summarize Unread</span>
                </button>
                <button
                  onClick={() =>
                    handleSendMessage("Find urgent action items or requests")
                  }
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[#e0dcce] hover:border-[#d94f3d]/50 hover:bg-[#fff7f5] text-[#595650] hover:text-[#d94f3d] text-xs transition-all cursor-pointer"
                >
                  <span>⚡</span>
                  <span>Action Items</span>
                </button>
              </div>

              {/* Text Input Box */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="relative flex items-center rounded-2xl bg-white border border-[#dedad3] shadow-xs focus-within:border-[#d94f3d] focus-within:ring-3 focus-within:ring-[#d94f3d]/15 transition-all p-1 sm:p-1.5"
              >
                <input
                  type="text"
                  value={inputPrompt}
                  onChange={(e) => setInputPrompt(e.target.value)}
                  placeholder="Ask your email agent..."
                  className="w-full bg-transparent px-3 sm:px-4 py-2 text-xs sm:text-sm text-[#242321] placeholder-[#9e9a93] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!inputPrompt.trim()}
                  className="h-9 w-9 sm:h-10 sm:w-10 flex items-center justify-center rounded-xl bg-[#d94f3d] text-white hover:bg-[#c44332] disabled:opacity-30 disabled:hover:bg-[#d94f3d] transition-all cursor-pointer shrink-0"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2.5"
                      d="M14 5l7 7m0 0l-7 7m7-7H3"
                    />
                  </svg>
                </button>
              </form>
              <p className="text-center text-[10px] sm:text-[11px] text-[#9e9a93] mt-1.5">
                Agent operates strictly on authorized Gmail permissions using
                OAuth 2.0.
              </p>
            </div>
          </div>
        </main>

        {/* ========================================== */}
        {/* EMAIL DETAIL READER MODAL / FULLSCREEN SHEET */}
        {/* ========================================== */}
        {(selectedEmail || loadingEmailDetail) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4 md:p-6 animate-in fade-in duration-200">
            <div className="w-full h-full sm:h-[90vh] sm:max-w-4xl bg-white rounded-none sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden border-0 sm:border border-[#dedad3]">
              {loadingEmailDetail ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8">
                  <div className="h-10 w-10 animate-spin rounded-full border-3 border-[#d94f3d] border-t-transparent" />
                  <p className="mt-4 text-xs sm:text-sm font-medium text-[#716e69]">
                    Loading email body & contents...
                  </p>
                </div>
              ) : selectedEmail ? (
                <>
                  {/* Modal Header */}
                  <header className="p-4 sm:p-5 border-b border-[#e8e4de] bg-[#fbf9f6] flex flex-col sm:flex-row sm:items-start justify-between gap-3 shrink-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 flex-wrap">
                        {selectedEmail.unread && (
                          <span className="rounded-full bg-[#d94f3d]/10 px-2 py-0.5 text-[10px] sm:text-xs font-semibold text-[#d94f3d]">
                            Unread
                          </span>
                        )}
                        <span className="text-[11px] sm:text-xs text-[#8c8881]">
                          {selectedEmail.date}
                        </span>
                        {selectedEmail.labels &&
                          selectedEmail.labels.slice(0, 3).map((l, i) => (
                            <span
                              key={i}
                              className="text-[10px] rounded-md bg-gray-100 text-gray-600 px-1.5 py-0.5 font-mono"
                            >
                              {l}
                            </span>
                          ))}
                      </div>

                      <h2 className="text-base sm:text-lg md:text-xl font-bold text-[#1f1e1c] leading-snug break-words">
                        {selectedEmail.subject}
                      </h2>

                      <div className="mt-2 text-xs text-[#5c5852] space-y-0.5">
                        <p className="truncate">
                          <span className="font-semibold text-[#3b3834]">
                            From:
                          </span>{" "}
                          {selectedEmail.from}
                        </p>
                        {selectedEmail.to && (
                          <p className="truncate">
                            <span className="font-semibold text-[#3b3834]">
                              To:
                            </span>{" "}
                            {selectedEmail.to}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-[#e8e4de]">
                      {/* View Mode Toggle (HTML vs Plain Text) */}
                      {selectedEmail.body_html && (
                        <div className="flex rounded-xl bg-gray-100 p-0.5 border border-gray-200 text-xs">
                          <button
                            onClick={() => setEmailViewMode("html")}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                              emailViewMode === "html"
                                ? "bg-white text-[#1f1e1c] shadow-xs"
                                : "text-gray-500 hover:text-gray-900"
                            }`}
                          >
                            HTML
                          </button>
                          <button
                            onClick={() => setEmailViewMode("plain")}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                              emailViewMode === "plain"
                                ? "bg-white text-[#1f1e1c] shadow-xs"
                                : "text-gray-500 hover:text-gray-900"
                            }`}
                          >
                            Plain
                          </button>
                        </div>
                      )}

                      <button
                        onClick={() => setSelectedEmail(null)}
                        className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl border border-[#dedad3] bg-white text-[#716e69] hover:bg-gray-100 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                        title="Close"
                      >
                        ✕
                      </button>
                    </div>
                  </header>

                  {/* Attachments Section if present */}
                  {selectedEmail.attachments &&
                    selectedEmail.attachments.length > 0 && (
                      <div className="px-4 sm:px-6 py-2 bg-[#faf8f5] border-b border-[#e8e4de] flex items-center gap-2 overflow-x-auto no-scrollbar text-xs shrink-0">
                        <span className="font-semibold text-[#5c5852] shrink-0 text-[11px] sm:text-xs">
                          📎 Attachments ({selectedEmail.attachments.length}):
                        </span>
                        {selectedEmail.attachments.map((att, idx) => (
                          <div
                            key={idx}
                            className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-[#e0dcce] text-[#33302c] text-xs"
                          >
                            <span>📄</span>
                            <span className="font-medium max-w-[120px] sm:max-w-[150px] truncate">
                              {att.filename}
                            </span>
                            <span className="text-[10px] text-gray-400">
                              ({Math.round(att.size / 1024)} KB)
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                  {/* Email Content Body */}
                  <div className="flex-1 overflow-y-auto p-0 relative bg-white">
                    {emailViewMode === "html" && selectedEmail.body_html ? (
                      <iframe
                        title="Email Body HTML"
                        srcDoc={`
                          <!DOCTYPE html>
                          <html>
                            <head>
                              <meta charset="utf-8">
                              <meta name="viewport" content="width=device-width, initial-scale=1.0">
                              <style>
                                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 16px; color: #242321; line-height: 1.6; margin: 0; word-break: break-word; }
                                @media (min-width: 640px) { body { padding: 24px; } }
                                img { max-width: 100% !important; height: auto !important; }
                                a { color: #d94f3d; }
                              </style>
                            </head>
                            <body>
                              ${selectedEmail.body_html}
                            </body>
                          </html>
                        `}
                        sandbox="allow-same-origin allow-popups"
                        className="w-full h-full min-h-[300px] border-0"
                      />
                    ) : (
                      <div className="p-4 sm:p-6">
                        <pre className="whitespace-pre-wrap font-sans text-xs sm:text-sm text-[#242321] leading-relaxed break-words">
                          {selectedEmail.body_plain || "No plain text content."}
                        </pre>
                      </div>
                    )}
                  </div>

                  {/* Modal Footer */}
                  <footer className="px-4 sm:px-6 py-2.5 sm:py-3 border-t border-[#e8e4de] bg-[#fbf9f6] flex items-center justify-between text-[11px] sm:text-xs text-[#8c8881] shrink-0">
                    <span className="truncate max-w-[150px] sm:max-w-none">
                      ID: {selectedEmail.id}
                    </span>
                    <button
                      onClick={() => setSelectedEmail(null)}
                      className="px-3.5 py-1.5 rounded-xl bg-[#242321] text-white font-medium hover:bg-black transition-colors cursor-pointer text-xs"
                    >
                      Close Viewer
                    </button>
                  </footer>
                </>
              ) : null}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // VIEW 2: LOGGED OUT / LANDING PAGE
  // ==========================================
  return (
    <main className="min-h-screen bg-[#f7f5f2] text-[#242321] font-sans flex flex-col justify-between">
      {/* Landing Navbar */}
      <header className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <img
            src="/favicon.svg"
            alt="MailPilot AI"
            className="h-9 w-9 sm:h-10 sm:w-10 rounded-2xl shadow-sm shrink-0"
          />
          <span className="font-bold text-sm sm:text-base tracking-tight text-[#242321]">
            MailPilot AI
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            OAuth 2.0 Secure
          </span>
        </div>
      </header>

      {/* Hero Section */}
      <section className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-14 flex flex-col items-center text-center">
        <div className="mb-5 sm:mb-6 inline-flex items-center gap-2 rounded-full bg-white px-3.5 sm:px-4 py-1.5 text-xs font-medium text-[#5c5852] shadow-xs ring-1 ring-black/5">
          <span className="text-[#d94f3d]">✨</span>
          <span>Intelligent Gmail AI Workspace</span>
        </div>

        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-[#1f1e1c] leading-[1.15]">
          A calm, focused AI assistant for your{" "}
          <span className="bg-gradient-to-r from-[#d94f3d] to-[#e97745] bg-clip-text text-transparent">
            Gmail inbox
          </span>
        </h1>

        <p className="mt-4 sm:mt-5 max-w-xl text-sm sm:text-base md:text-lg leading-relaxed text-[#716e69]">
          Connect your Gmail in one click to automatically summarize threads,
          extract action items, find receipts, and draft intelligent replies.
        </p>

        {/* Primary CTA Button */}
        <div className="mt-7 sm:mt-8 flex flex-col sm:flex-row items-center gap-4 w-full justify-center">
          <button
            type="button"
            onClick={handleConnectGmail}
            className="w-full sm:w-auto inline-flex h-12 sm:h-13 items-center justify-center gap-3 rounded-2xl bg-[#242321] hover:bg-black px-6 sm:px-8 text-sm font-semibold text-white shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-black/15 cursor-pointer"
          >
            {/* Google G icon */}
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"
              />
            </svg>
            <span>Connect Gmail with Google</span>
          </button>
        </div>

        {/* Feature Highlights Grid */}
        <div className="mt-10 sm:mt-14 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 sm:gap-4 w-full text-left">
          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#ebe7e1] shadow-xs">
            <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center text-base sm:text-lg mb-2.5">
              📊
            </div>
            <h3 className="text-xs sm:text-sm font-semibold text-[#242321]">
              Smart Digests
            </h3>
            <p className="mt-1 text-[11px] sm:text-xs text-[#716e69] leading-relaxed">
              Summarize dozens of unread newsletters and updates in seconds.
            </p>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#ebe7e1] shadow-xs">
            <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-base sm:text-lg mb-2.5">
              ⚡
            </div>
            <h3 className="text-xs sm:text-sm font-semibold text-[#242321]">
              Action Item Extraction
            </h3>
            <p className="mt-1 text-[11px] sm:text-xs text-[#716e69] leading-relaxed">
              Identify urgent client requests, invoices, and scheduling asks.
            </p>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#ebe7e1] shadow-xs sm:col-span-2 md:col-span-1">
            <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-base sm:text-lg mb-2.5">
              🔒
            </div>
            <h3 className="text-xs sm:text-sm font-semibold text-[#242321]">
              Privacy First
            </h3>
            <p className="mt-1 text-[11px] sm:text-xs text-[#716e69] leading-relaxed">
              Direct OAuth 2.0 with minimal scopes. No plain passwords stored.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6 border-t border-[#e8e4de] text-center text-xs text-[#9e9a93]">
        <p>MailPilot AI • Built with FastAPI, SQLModel & Next.js</p>
      </footer>
    </main>
  );
}
