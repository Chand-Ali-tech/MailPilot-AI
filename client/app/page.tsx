"use client";

import React, { useEffect, useState, useRef } from "react";

interface User {
  id: number;
  email: string;
  name?: string | null;
}

interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
  type?: "text" | "emails_summary" | "action_card";
  data?: any;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputPrompt, setInputPrompt] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
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
              text: `Hello ${data.user.name || "there"}! 👋 I'm your AI Email Agent. Your Gmail is connected and ready. You can ask me to search, summarize, prioritize, or draft replies to any of your emails.`,
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
    } catch (err) {
      console.error("Failed to logout:", err);
    }
  };

  const handleSendMessage = (textToSend?: string) => {
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

    setMessages((prev) => [...prev, userMessage]);
    setInputPrompt("");
    setIsTyping(true);

    // Placeholder response simulation for email agent (ready for backend agent API integration)
    setTimeout(() => {
      let botReply =
        "I've received your request! Once our background email agent pipeline is connected to the Gmail API, I will execute this action directly in your inbox.";

      if (
        query.toLowerCase().includes("unread") ||
        query.toLowerCase().includes("summarize")
      ) {
        botReply =
          "📬 I checked your inbox: You have 12 unread emails today. 3 are high priority (1 invoice reminder, 1 project update from your team, and 1 client inquiry). Would you like me to draft replies to the client inquiry?";
      } else if (
        query.toLowerCase().includes("invoice") ||
        query.toLowerCase().includes("receipt")
      ) {
        botReply =
          "🧾 Found 4 receipt emails from this month: AWS Cloud ($14.20), GitHub ($4.00), Google Workspace ($12.00), and Stripe. All total: $30.20.";
      }

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: "assistant",
          text: botReply,
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      ]);
      setIsTyping(false);
    }, 1000);
  };

  const suggestedPrompts = [
    {
      title: "Summarize unread emails",
      description: "Quick digest of today's key messages",
      icon: "📊",
    },
    {
      title: "Find urgent action items",
      description: "Emails waiting on your reply",
      icon: "⚡",
    },
    {
      title: "Extract monthly receipts",
      description: "List invoices and subscription charges",
      icon: "🧾",
    },
    {
      title: "Draft email reply",
      description: "Create context-aware response",
      icon: "✍️",
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
      <div className="flex h-screen bg-[#f7f5f2] font-sans text-[#242321] overflow-hidden">
        {/* Left Sidebar */}
        <aside
          className={`${
            isSidebarOpen ? "w-72" : "w-0 -translate-x-full"
          } transition-all duration-300 ease-in-out border-r border-[#e8e4de] bg-white flex flex-col justify-between overflow-hidden shrink-0`}
        >
          <div className="flex flex-col h-full p-4 overflow-y-auto">
            {/* App Brand */}
            <div className="flex items-center gap-3 px-2 py-2 mb-6">
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
            <div className="mb-6">
              <span className="px-2 text-xs font-semibold text-[#8c8881] uppercase tracking-wider">
                Quick Shortcuts
              </span>
              <div className="mt-2 space-y-1.5">
                {suggestedPrompts.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(item.title)}
                    className="w-full flex items-start gap-2.5 p-2.5 rounded-xl text-left hover:bg-[#f7f5f2] transition-colors group cursor-pointer"
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
            <div className="max-w-3xl mx-auto space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${
                    msg.sender === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {msg.sender === "assistant" && (
                    <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-[#d94f3d] to-[#e97745] flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5 shadow-sm">
                      AI
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] sm:max-w-xl rounded-2xl p-4 text-sm leading-relaxed shadow-xs ${
                      msg.sender === "user"
                        ? "bg-[#242321] text-white rounded-tr-xs"
                        : "bg-white text-[#242321] border border-[#e8e4de] rounded-tl-xs"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                    <span
                      className={`block mt-1.5 text-[10px] ${
                        msg.sender === "user"
                          ? "text-gray-400 text-right"
                          : "text-[#9e9a93]"
                      }`}
                    >
                      {msg.timestamp}
                    </span>
                  </div>

                  {msg.sender === "user" && (
                    <div className="h-8 w-8 rounded-xl bg-[#242321] text-white flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5">
                      {user.name ? user.name.charAt(0).toUpperCase() : "U"}
                    </div>
                  )}
                </div>
              ))}

              {isTyping && (
                <div className="flex gap-3 justify-start">
                  <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-[#d94f3d] to-[#e97745] flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm">
                    AI
                  </div>
                  <div className="rounded-2xl rounded-tl-xs bg-white border border-[#e8e4de] px-4 py-3 text-sm flex items-center gap-1.5 shadow-xs">
                    <span
                      className="h-2 w-2 rounded-full bg-[#d94f3d] animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    />
                    <span
                      className="h-2 w-2 rounded-full bg-[#d94f3d] animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    />
                    <span
                      className="h-2 w-2 rounded-full bg-[#d94f3d] animate-bounce"
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
                {suggestedPrompts.slice(0, 3).map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(item.title)}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[#e0dcce] hover:border-[#d94f3d]/50 hover:bg-[#fff7f5] text-[#595650] hover:text-[#d94f3d] transition-all cursor-pointer"
                  >
                    <span>{item.icon}</span>
                    <span>{item.title}</span>
                  </button>
                ))}
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
                  placeholder="Ask your email agent (e.g. 'Summarize emails from yesterday')..."
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
