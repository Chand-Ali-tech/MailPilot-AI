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
    to: string;
    subject: string;
    body: string;
  };
}

// ---------------------------------------------------------------------------
// Lightweight markdown renderer — no external library needed
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
            className="bg-[#f2efe9] text-[#c44332] rounded px-1 py-0.5 text-[11px] font-mono"
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
        <h4 key={i} className="font-bold text-[#1f1e1c] text-sm mt-3 mb-1">
          {line.slice(4)}
        </h4>,
      );
    } else if (line.startsWith("## ")) {
      elements.push(
        <h3 key={i} className="font-bold text-[#1f1e1c] text-base mt-3 mb-1">
          {line.slice(3)}
        </h3>,
      );
    } else if (line.startsWith("# ")) {
      elements.push(
        <h2 key={i} className="font-bold text-[#1f1e1c] text-lg mt-3 mb-1">
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
          <p key={i} className="leading-relaxed">
            {renderInline(line.slice(2))}
          </p>,
        );
      }
    }
    // Horizontal rule
    else if (line.match(/^---+$/)) {
      elements.push(<hr key={i} className="my-3 border-[#e8e4de]" />);
    }
    // Bullet list  (-, •, or * prefix)
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
          <li key={i} className="flex gap-2 items-start">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#d94f3d] shrink-0" />
            <span>{renderInline(content)}</span>
          </li>,
        );
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="my-2 space-y-1.5 ml-1">
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
          <li key={i} className="flex gap-2 items-start">
            <span className="shrink-0 font-semibold text-[#d94f3d] text-xs mt-0.5 w-4">
              {n}.
            </span>
            <span>{renderInline(content)}</span>
          </li>,
        );
        i++;
        n++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="my-2 space-y-1.5 ml-1">
          {listItems}
        </ol>,
      );
      continue;
    }
    // Empty line → spacing
    else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    }
    // Normal paragraph line
    else {
      elements.push(
        <p key={i} className="leading-relaxed">
          {renderInline(line)}
        </p>,
      );
    }

    i++;
  }

  return <div className="space-y-0.5 text-sm">{elements}</div>;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputPrompt, setInputPrompt] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [latestEmails, setLatestEmails] = useState<EmailItem[]>([]);
  const [fetchingEmails, setFetchingEmails] = useState(false);

  // Email Detail Modal State
  const [selectedEmail, setSelectedEmail] = useState<EmailDetail | null>(null);
  const [loadingEmailDetail, setLoadingEmailDetail] = useState(false);
  const [emailViewMode, setEmailViewMode] = useState<"html" | "plain">("html");

  const chatBottomRef = useRef<HTMLDivElement>(null);

  const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  useEffect(() => {
    // Check auth status
    fetch(`${backendUrl}/auth/me`, {
      credentials: "include",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          setUser(data.user);
          setMessages([
            {
              id: "welcome-1",
              sender: "assistant",
              text: `Hello ${data.user.name || "there"}! 👋 I'm your AI Email Agent. Your Gmail is connected. You can ask me to fetch your latest emails, view full details (HTML, body, images), or summarize threads.`,
              timestamp: new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
            },
          ]);
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
      setLatestEmails([]);
      setSelectedEmail(null);
    } catch (err) {
      console.error("Failed to logout:", err);
    }
  };

  const fetchEmailsFromBackend = async (
    limit: number = 5,
  ): Promise<EmailItem[]> => {
    try {
      const res = await fetch(
        `${backendUrl}/api/emails/latest?limit=${limit}`,
        {
          credentials: "include",
        },
      );
      if (!res.ok) {
        throw new Error(`Failed to fetch emails (status ${res.status})`);
      }
      const data = await res.json();
      const list = data.emails || [];
      setLatestEmails(list);
      return list;
    } catch (err) {
      console.error("Error fetching latest emails:", err);
      return [];
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

  const handleFetchLatestEmailsClick = async () => {
    setFetchingEmails(true);
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: "user",
      text: "Show my latest 5 emails",
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);

    const emails = await fetchEmailsFromBackend(5);
    setIsTyping(false);
    setFetchingEmails(false);

    if (emails.length > 0) {
      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: "assistant",
        text: `📬 Retrieved your latest ${emails.length} emails. Click any email card to view its full formatted body, images, and headers:`,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        type: "emails_list",
        emails: emails,
      };
      setMessages((prev) => [...prev, botMsg]);
    } else {
      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: "assistant",
        text: "Could not retrieve emails or your inbox is empty. Please verify your Gmail connection.",
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      setMessages((prev) => [...prev, botMsg]);
    }
  };

  // Reads an SSE stream from the backend and updates the message in real time.
  // url: the fetch URL | body: the POST body | streamMsgId: which message to stream into
  const readStream = async (url: string, body: object, streamMsgId: string) => {
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
          // Stream finished — mark complete and attach tool badges
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamMsgId
                ? {
                    ...m,
                    status: "complete",
                    tools_used: event.tools_used || [],
                  }
                : m,
            ),
          );
        } else if (event.type === "pending_approval") {
          // Agent paused for send_email — show the approval card
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamMsgId
                ? {
                    ...m,
                    text: "",
                    status: "pending_approval",
                    thread_id: event.thread_id,
                    pending_action: event.pending_action,
                  }
                : m,
            ),
          );
        } else if (event.type === "error") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamMsgId
                ? { ...m, text: `⚠️ ${event.message}`, status: "complete" }
                : m,
            ),
          );
        }
      }
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputPrompt).trim();
    if (!query) return;

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

    setMessages((prev) => [...prev, userMessage, streamMsg]);
    setInputPrompt("");
    setIsTyping(true);

    try {
      await readStream(
        `${backendUrl}/agent/chat`,
        { message: query },
        streamId,
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
    const label = action === "approve" ? "Sending email..." : "Cancelling...";

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

  const suggestedPrompts = [
    {
      title: "Fetch latest 5 emails",
      description: "Load latest messages with full HTML body & images",
      icon: "📬",
      action: handleFetchLatestEmailsClick,
    },
    {
      title: "Summarize recent updates",
      description: "Get key points from latest emails",
      icon: "📊",
      action: () => handleSendMessage("Summarize my recent updates"),
    },
    {
      title: "Find urgent action items",
      description: "Emails waiting on your reply",
      icon: "⚡",
      action: () => handleSendMessage("Find urgent action items"),
    },
  ];

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fbf9f6] px-6 font-sans">
        <div className="flex flex-col items-center">
          <div className="relative flex h-16 w-16 items-center justify-center">
            <div className="absolute h-16 w-16 animate-ping rounded-full bg-[#d94f3d]/15" />
            <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-black/5 text-[#d94f3d] font-bold text-xl">
              ✉
            </div>
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
        {/* Left Sidebar */}
        <aside
          className={`${
            isSidebarOpen ? "w-80" : "w-0 -translate-x-full"
          } transition-all duration-300 ease-in-out border-r border-[#e8e4de] bg-white flex flex-col justify-between overflow-hidden shrink-0`}
        >
          <div className="flex flex-col h-full p-4 overflow-y-auto">
            {/* App Brand */}
            <div className="flex items-center gap-3 px-2 py-2 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#d94f3d] to-[#e97745] text-white font-bold text-base shadow-sm">
                M
              </div>
              <div>
                <h2 className="text-sm font-semibold tracking-tight text-[#1f1e1c]">
                  Email Agent AI
                </h2>
                <span className="text-[11px] text-[#8c8881]">
                  Workspace Co-pilot
                </span>
              </div>
            </div>

            {/* Quick Actions / Suggested Prompts */}
            <div className="mb-5">
              <span className="px-2 text-xs font-semibold text-[#8c8881] uppercase tracking-wider">
                Quick Actions
              </span>
              <div className="mt-2 space-y-1.5">
                {suggestedPrompts.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={item.action}
                    disabled={fetchingEmails}
                    className="w-full flex items-start gap-2.5 p-2.5 rounded-xl text-left hover:bg-[#f7f5f2] transition-colors group cursor-pointer disabled:opacity-50"
                  >
                    <span className="text-base p-1 rounded-lg bg-gray-50 border border-gray-100 group-hover:bg-white transition-colors">
                      {item.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-[#2d2b28] group-hover:text-[#d94f3d] transition-colors truncate">
                        {item.title}
                      </p>
                      <p className="text-[11px] text-[#8c8881] truncate">
                        {item.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Live Latest Emails Mini-Feed */}
            {latestEmails.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between px-2 mb-2">
                  <span className="text-xs font-semibold text-[#8c8881] uppercase tracking-wider">
                    Recent Messages ({latestEmails.length})
                  </span>
                  <button
                    onClick={() => fetchEmailsFromBackend(5)}
                    className="text-[11px] text-[#d94f3d] hover:underline cursor-pointer font-medium"
                  >
                    Refresh
                  </button>
                </div>
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                  {latestEmails.map((email) => (
                    <button
                      key={email.id}
                      onClick={() => handleOpenEmailDetail(email.id)}
                      className="w-full p-2.5 rounded-xl bg-[#faf8f5] hover:bg-white border border-[#ebe7e1] hover:border-[#d94f3d]/40 text-left text-xs transition-all cursor-pointer shadow-2xs group"
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-semibold text-[#242321] group-hover:text-[#d94f3d] truncate max-w-[140px]">
                          {email.sender.split("<")[0].trim()}
                        </span>
                        {email.unread && (
                          <span className="h-2 w-2 rounded-full bg-[#d94f3d] shrink-0" />
                        )}
                      </div>
                      <p className="text-[#595650] font-medium truncate">
                        {email.subject}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Account Status Card */}
            <div className="mt-auto pt-4 border-t border-[#e8e4de]">
              <div className="rounded-xl bg-[#fcfbfa] p-3.5 border border-[#ebe7e1]">
                <div className="flex items-center gap-2 mb-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[11px] font-medium text-emerald-700">
                    Gmail Connected
                  </span>
                </div>
                <p className="text-xs font-semibold text-[#242321] truncate">
                  {user.name || "Authenticated User"}
                </p>
                <p className="text-[11px] text-[#716e69] truncate mb-3">
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
        <main className="flex-1 flex flex-col h-full overflow-hidden bg-[#f7f5f2]">
          {/* Top Bar */}
          <header className="h-14 border-b border-[#e8e4de] bg-white/80 backdrop-blur-md px-5 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="p-1.5 rounded-lg text-[#716e69] hover:bg-[#f2efe9] hover:text-[#242321] transition-colors cursor-pointer"
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
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-[#242321]">
                  Email Assistant
                </span>
                <span className="rounded-full bg-[#f2efe9] px-2 py-0.5 text-[11px] font-medium text-[#716e69]">
                  Live
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleFetchLatestEmailsClick}
                disabled={fetchingEmails}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#dedad3] hover:border-[#d94f3d] text-xs font-semibold text-[#242321] hover:text-[#d94f3d] shadow-2xs transition-all cursor-pointer disabled:opacity-50"
              >
                <span>📬</span>
                <span>
                  {fetchingEmails
                    ? "Loading Emails..."
                    : "Fetch Latest 5 Emails"}
                </span>
              </button>

              <div className="flex items-center gap-2 rounded-full bg-[#fbf9f6] border border-[#e8e4de] px-3 py-1 text-xs">
                <div className="h-5 w-5 rounded-full bg-[#d94f3d] text-white flex items-center justify-center text-[10px] font-bold">
                  {user.name ? user.name.charAt(0).toUpperCase() : "U"}
                </div>
                <span className="font-medium text-[#3b3834] max-w-[120px] sm:max-w-[200px] truncate">
                  {user.name || user.email}
                </span>
              </div>
            </div>
          </header>

          {/* Chat Messages Scrollable Area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            <div className="max-w-3xl mx-auto space-y-5">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${
                    msg.sender === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {/* AI Avatar */}
                  {msg.sender === "assistant" && (
                    <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-[#d94f3d] to-[#e97745] flex items-center justify-center text-white text-xs font-bold shrink-0 mt-1 shadow-sm">
                      AI
                    </div>
                  )}

                  <div
                    className={`max-w-[88%] sm:max-w-2xl rounded-2xl text-sm leading-relaxed shadow-xs ${
                      msg.sender === "user"
                        ? "bg-[#242321] text-white rounded-tr-xs px-4 py-3"
                        : "bg-white text-[#242321] border border-[#e8e4de] rounded-tl-xs px-5 py-4"
                    }`}
                  >
                    {/* Message body */}
                    {msg.sender === "user" ? (
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                    ) : msg.status === "pending_approval" &&
                      msg.pending_action ? (
                      /* ── Approval Card ─────────────────────────────── */
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-base">📧</span>
                          <span className="font-semibold text-[#1f1e1c] text-sm">
                            Ready to send this email
                          </span>
                        </div>

                        <div className="rounded-xl bg-[#faf8f5] border border-[#e8e4de] p-3.5 space-y-2 text-xs mb-3">
                          <div className="flex gap-2">
                            <span className="font-semibold text-[#716e69] w-14 shrink-0">
                              To:
                            </span>
                            <span className="text-[#1f1e1c] font-medium">
                              {msg.pending_action.to}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <span className="font-semibold text-[#716e69] w-14 shrink-0">
                              Subject:
                            </span>
                            <span className="text-[#1f1e1c] font-medium">
                              {msg.pending_action.subject}
                            </span>
                          </div>
                          <div className="pt-2 border-t border-[#ede9e2]">
                            <span className="font-semibold text-[#716e69] block mb-1.5">
                              Body:
                            </span>
                            <pre className="whitespace-pre-wrap font-sans text-[#3b3834] leading-relaxed max-h-40 overflow-y-auto">
                              {msg.pending_action.body}
                            </pre>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() =>
                              handleResume(msg.id, msg.thread_id!, "approve")
                            }
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold transition-colors cursor-pointer"
                          >
                            ✅ Send Now
                          </button>
                          <button
                            onClick={() =>
                              handleResume(msg.id, msg.thread_id!, "cancel")
                            }
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl bg-white border border-[#dedad3] hover:bg-red-50 hover:border-red-200 hover:text-red-600 text-[#5e5b56] text-xs font-semibold transition-colors cursor-pointer"
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
                        <div className="mt-3 pt-3 border-t border-[#f0ece6] flex flex-wrap gap-1.5">
                          <span className="text-[10px] text-[#a09c96] font-medium mr-1 self-center">
                            Used:
                          </span>
                          {msg.tools_used.map((tool, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 rounded-full bg-[#fff7f5] border border-[#f5d5d0] px-2.5 py-0.5 text-[10px] font-semibold text-[#c44332]"
                            >
                              {tool === "search_emails"
                                ? "🔍"
                                : tool === "send_email"
                                  ? "📤"
                                  : "🔧"}{" "}
                              {tool.replace(/_/g, " ")}
                            </span>
                          ))}
                        </div>
                      )}

                    {/* Email cards (from manual fetch button) */}
                    {msg.type === "emails_list" &&
                      msg.emails &&
                      msg.emails.length > 0 && (
                        <div className="mt-3.5 space-y-2.5">
                          {msg.emails.map((email) => (
                            <div
                              key={email.id}
                              onClick={() => handleOpenEmailDetail(email.id)}
                              className="group rounded-xl border border-[#ebe7e1] bg-[#faf8f5] hover:bg-white hover:border-[#d94f3d]/50 p-3.5 text-left transition-all cursor-pointer hover:shadow-xs"
                            >
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="font-semibold text-xs text-[#1f1e1c] group-hover:text-[#d94f3d] transition-colors truncate">
                                  {email.sender}
                                </span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {email.unread && (
                                    <span className="rounded-full bg-[#d94f3d]/10 px-2 py-0.5 text-[10px] font-semibold text-[#d94f3d]">
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
                              <h4 className="font-semibold text-xs text-[#33302c] mb-1">
                                {email.subject}
                              </h4>
                              <p className="text-xs text-[#716e69] line-clamp-2 leading-relaxed">
                                {email.snippet}
                              </p>
                              <div className="mt-2.5 pt-2 border-t border-[#f0ece6] text-[11px] text-[#d94f3d] font-medium">
                                Click to read full email & HTML body →
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
                    <div className="h-8 w-8 rounded-xl bg-[#3b3834] text-white flex items-center justify-center text-xs font-semibold shrink-0 mt-1">
                      {user.name ? user.name.charAt(0).toUpperCase() : "U"}
                    </div>
                  )}
                </div>
              ))}

              {/* Typing indicator */}
              {isTyping && !messages.some((m) => m.status === "streaming") && (
                <div className="flex gap-3 justify-start">
                  <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-[#d94f3d] to-[#e97745] flex items-center justify-center text-white text-xs font-bold shrink-0 mt-1 shadow-sm">
                    AI
                  </div>
                  <div className="rounded-2xl rounded-tl-xs bg-white border border-[#e8e4de] px-4 py-3.5 flex items-center gap-1.5 shadow-xs">
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
          <div className="p-4 sm:p-5 border-t border-[#e8e4de] bg-white/60 backdrop-blur-md shrink-0">
            <div className="max-w-3xl mx-auto">
              {/* Quick suggestions pills */}
              <div className="flex items-center gap-2 overflow-x-auto pb-2.5 mb-1 no-scrollbar text-xs">
                <button
                  onClick={handleFetchLatestEmailsClick}
                  disabled={fetchingEmails}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[#e0dcce] hover:border-[#d94f3d]/50 hover:bg-[#fff7f5] text-[#595650] hover:text-[#d94f3d] transition-all cursor-pointer disabled:opacity-50"
                >
                  <span>📬</span>
                  <span>Fetch Latest 5 Emails</span>
                </button>
                <button
                  onClick={() =>
                    handleSendMessage("Summarize my unread emails")
                  }
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[#e0dcce] hover:border-[#d94f3d]/50 hover:bg-[#fff7f5] text-[#595650] hover:text-[#d94f3d] transition-all cursor-pointer"
                >
                  <span>📊</span>
                  <span>Summarize Unread</span>
                </button>
              </div>

              {/* Text Input Box */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="relative flex items-center rounded-2xl bg-white border border-[#dedad3] shadow-sm focus-within:border-[#d94f3d] focus-within:ring-3 focus-within:ring-[#d94f3d]/15 transition-all p-1.5"
              >
                <input
                  type="text"
                  value={inputPrompt}
                  onChange={(e) => setInputPrompt(e.target.value)}
                  placeholder="Ask your email agent (e.g. 'Show latest 5 emails')..."
                  className="w-full bg-transparent px-4 py-2.5 text-sm text-[#242321] placeholder-[#9e9a93] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!inputPrompt.trim()}
                  className="h-10 w-10 flex items-center justify-center rounded-xl bg-[#d94f3d] text-white hover:bg-[#c44332] disabled:opacity-30 disabled:hover:bg-[#d94f3d] transition-all cursor-pointer shrink-0"
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
              <p className="text-center text-[11px] text-[#9e9a93] mt-2">
                Agent operates strictly on authorized Gmail permissions using
                OAuth 2.0.
              </p>
            </div>
          </div>
        </main>

        {/* ========================================== */}
        {/* EMAIL DETAIL READER MODAL / SLIDEOVER      */}
        {/* ========================================== */}
        {(selectedEmail || loadingEmailDetail) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 sm:p-6 animate-in fade-in duration-200">
            <div className="w-full max-w-4xl h-[90vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-[#dedad3]">
              {loadingEmailDetail ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8">
                  <div className="h-10 w-10 animate-spin rounded-full border-3 border-[#d94f3d] border-t-transparent" />
                  <p className="mt-4 text-sm font-medium text-[#716e69]">
                    Loading email body & contents...
                  </p>
                </div>
              ) : selectedEmail ? (
                <>
                  {/* Modal Header */}
                  <header className="p-5 sm:px-6 border-b border-[#e8e4de] bg-[#fbf9f6] flex items-start justify-between shrink-0">
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        {selectedEmail.unread && (
                          <span className="rounded-full bg-[#d94f3d]/10 px-2.5 py-0.5 text-xs font-semibold text-[#d94f3d]">
                            Unread
                          </span>
                        )}
                        <span className="text-xs text-[#8c8881]">
                          {selectedEmail.date}
                        </span>
                        {selectedEmail.labels &&
                          selectedEmail.labels.slice(0, 3).map((l, i) => (
                            <span
                              key={i}
                              className="text-[10px] rounded-md bg-gray-100 text-gray-600 px-2 py-0.5 font-mono"
                            >
                              {l}
                            </span>
                          ))}
                      </div>

                      <h2 className="text-lg sm:text-xl font-bold text-[#1f1e1c] leading-snug">
                        {selectedEmail.subject}
                      </h2>

                      <div className="mt-2 text-xs text-[#5c5852] space-y-0.5">
                        <p>
                          <span className="font-semibold text-[#3b3834]">
                            From:
                          </span>{" "}
                          {selectedEmail.from}
                        </p>
                        {selectedEmail.to && (
                          <p>
                            <span className="font-semibold text-[#3b3834]">
                              To:
                            </span>{" "}
                            {selectedEmail.to}
                          </p>
                        )}
                        {selectedEmail.cc && (
                          <p>
                            <span className="font-semibold text-[#3b3834]">
                              Cc:
                            </span>{" "}
                            {selectedEmail.cc}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* View Mode Toggle (HTML vs Plain Text) */}
                      {selectedEmail.body_html && (
                        <div className="flex rounded-xl bg-gray-100 p-1 border border-gray-200 text-xs">
                          <button
                            onClick={() => setEmailViewMode("html")}
                            className={`px-3 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                              emailViewMode === "html"
                                ? "bg-white text-[#1f1e1c] shadow-xs"
                                : "text-gray-500 hover:text-gray-900"
                            }`}
                          >
                            HTML View
                          </button>
                          <button
                            onClick={() => setEmailViewMode("plain")}
                            className={`px-3 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                              emailViewMode === "plain"
                                ? "bg-white text-[#1f1e1c] shadow-xs"
                                : "text-gray-500 hover:text-gray-900"
                            }`}
                          >
                            Plain Text
                          </button>
                        </div>
                      )}

                      <button
                        onClick={() => setSelectedEmail(null)}
                        className="h-9 w-9 rounded-xl border border-[#dedad3] bg-white text-[#716e69] hover:bg-gray-100 flex items-center justify-center transition-colors cursor-pointer"
                        title="Close"
                      >
                        ✕
                      </button>
                    </div>
                  </header>

                  {/* Attachments Section if present */}
                  {selectedEmail.attachments &&
                    selectedEmail.attachments.length > 0 && (
                      <div className="px-6 py-2.5 bg-[#faf8f5] border-b border-[#e8e4de] flex items-center gap-2 overflow-x-auto text-xs shrink-0">
                        <span className="font-semibold text-[#5c5852] shrink-0">
                          📎 Attachments ({selectedEmail.attachments.length}):
                        </span>
                        {selectedEmail.attachments.map((att, idx) => (
                          <div
                            key={idx}
                            className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-[#e0dcce] text-[#33302c]"
                          >
                            <span>📄</span>
                            <span className="font-medium max-w-[150px] truncate">
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
                                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #242321; line-height: 1.6; margin: 0; }
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
                        className="w-full h-full min-h-[450px] border-0"
                      />
                    ) : (
                      <div className="p-6">
                        <pre className="whitespace-pre-wrap font-sans text-sm text-[#242321] leading-relaxed">
                          {selectedEmail.body_plain || "No plain text content."}
                        </pre>
                      </div>
                    )}
                  </div>

                  {/* Modal Footer */}
                  <footer className="px-6 py-3 border-t border-[#e8e4de] bg-[#fbf9f6] flex items-center justify-between text-xs text-[#8c8881] shrink-0">
                    <span>Message ID: {selectedEmail.id}</span>
                    <button
                      onClick={() => setSelectedEmail(null)}
                      className="px-4 py-1.5 rounded-xl bg-[#242321] text-white font-medium hover:bg-black transition-colors cursor-pointer"
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
      <header className="w-full max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#d94f3d] to-[#e97745] text-white font-bold text-lg shadow-sm">
            M
          </div>
          <span className="font-bold text-base tracking-tight text-[#242321]">
            Email Agent
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            OAuth 2.0 Secure
          </span>
        </div>
      </header>

      {/* Hero Section */}
      <section className="w-full max-w-3xl mx-auto px-6 py-12 flex flex-col items-center text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-xs font-medium text-[#5c5852] shadow-xs ring-1 ring-black/5">
          <span className="text-[#d94f3d]">✨</span>
          <span>Intelligent Gmail AI Workspace</span>
        </div>

        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-[#1f1e1c] leading-[1.15]">
          A calm, focused AI assistant for your{" "}
          <span className="bg-gradient-to-r from-[#d94f3d] to-[#e97745] bg-clip-text text-transparent">
            Gmail inbox
          </span>
        </h1>

        <p className="mt-5 max-w-xl text-base sm:text-lg leading-relaxed text-[#716e69]">
          Connect your Gmail in one click to automatically summarize threads,
          extract action items, find receipts, and draft intelligent replies.
        </p>

        {/* Primary CTA Button */}
        <div className="mt-8 flex flex-col sm:flex-row items-center gap-4 w-full justify-center">
          <button
            type="button"
            onClick={handleConnectGmail}
            className="w-full sm:w-auto inline-flex h-13 items-center justify-center gap-3 rounded-2xl bg-[#242321] hover:bg-black px-8 text-sm font-semibold text-white shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-black/15 cursor-pointer"
          >
            {/* Google G icon */}
            <svg className="w-4 h-4" viewBox="0 0 24 24">
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
        <div className="mt-14 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full text-left">
          <div className="p-5 rounded-2xl bg-white border border-[#ebe7e1] shadow-xs">
            <div className="h-9 w-9 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center text-lg mb-3">
              📊
            </div>
            <h3 className="text-sm font-semibold text-[#242321]">
              Smart Digests
            </h3>
            <p className="mt-1 text-xs text-[#716e69] leading-relaxed">
              Summarize dozens of unread newsletters and updates in seconds.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-[#ebe7e1] shadow-xs">
            <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-lg mb-3">
              ⚡
            </div>
            <h3 className="text-sm font-semibold text-[#242321]">
              Action Item Extraction
            </h3>
            <p className="mt-1 text-xs text-[#716e69] leading-relaxed">
              Identify urgent client requests, invoices, and scheduling asks.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-[#ebe7e1] shadow-xs">
            <div className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-lg mb-3">
              🔒
            </div>
            <h3 className="text-sm font-semibold text-[#242321]">
              Privacy First
            </h3>
            <p className="mt-1 text-xs text-[#716e69] leading-relaxed">
              Direct OAuth 2.0 with minimal scopes. No plain passwords stored.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full max-w-6xl mx-auto px-6 py-6 border-t border-[#e8e4de] text-center text-xs text-[#9e9a93]">
        <p>Email Agent AI • Built with FastAPI, SQLModel & Next.js</p>
      </footer>
    </main>
  );
}
