"use client";

import { useEffect, useState } from "react";

interface User {
  id: number;
  email: string;
  name?: string | null;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  useEffect(() => {
    // Check if the user is already authenticated via session cookie
    fetch(`${backendUrl}/auth/me`, {
      credentials: "include",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          setUser(data.user);
        }
      })
      .catch((err) => {
        console.error("Failed to check auth state:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [backendUrl]);

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
    } catch (err) {
      console.error("Failed to logout:", err);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f5f2] px-6 font-sans">
        <div className="flex flex-col items-center">
          <div className="h-10 w-10 animate-spin rounded-full border-3 border-[#d94f3d] border-t-transparent" />
          <p className="mt-4 text-sm text-[#716e69]">Checking connection...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f5f2] px-6 font-sans">
      <section className="flex w-full max-w-md flex-col items-center text-center">
        {user ? (
          <div className="w-full rounded-2xl bg-white p-8 shadow-sm ring-1 ring-black/5">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#d94f3d]/10 text-2xl font-bold text-[#d94f3d]">
              {user.name ? user.name.charAt(0).toUpperCase() : "G"}
            </div>

            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20 mb-3">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Connected to Gmail
            </div>

            <h1 className="text-2xl font-semibold tracking-tight text-[#242321]">
              Welcome, {user.name || "there"}!
            </h1>

            <p className="mt-1.5 text-sm text-[#716e69]">{user.email}</p>

            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-xl bg-gray-100 text-sm font-medium text-[#4a4742] transition duration-200 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300"
              >
                Disconnect Account
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-2xl font-semibold text-[#d94f3d] shadow-sm ring-1 ring-black/5">
              M
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-[#242321]">
              Connect your inbox
            </h1>
            <p className="mt-3 max-w-sm text-base leading-7 text-[#716e69]">
              Bring your Gmail messages into one calm, focused workspace.
            </p>
            <button
              type="button"
              onClick={handleConnectGmail}
              className="mt-8 inline-flex h-12 cursor-pointer items-center justify-center rounded-xl bg-gradient-to-r from-[#d94f3d] to-[#e97745] px-7 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(217,79,61,0.22)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(217,79,61,0.3)] focus:outline-none focus:ring-4 focus:ring-[#d94f3d]/25"
            >
              Connect Gmail
            </button>
          </>
        )}
      </section>
    </main>
  );
}
