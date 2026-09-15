"use client";

export default function Home() {
  const handleConnectGmail = () => {
    const backendUrl =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    window.location.href = `${backendUrl}/auth/google`;
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f5f2] px-6 font-sans">
      <section className="flex w-full max-w-md flex-col items-center text-center">
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
      </section>
    </main>
  );
}
