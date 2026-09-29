"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form
        className="w-full max-w-sm rounded-lg border border-line bg-card p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!url || !key) return setError("Sign-in is not configured.");
          setBusy(true);
          setError(null);
          const supabase = createBrowserClient(url, key);
          const { error } = await supabase.auth.signInWithPassword({ email, password });
          setBusy(false);
          if (error) return setError(error.message);
          router.replace("/");
          router.refresh();
        }}
      >
        <div className="mb-5">
          <div className="text-[15px] font-semibold">Kargo</div>
          <div className="font-serif text-[20px] italic text-ink-2">The Decision Room</div>
        </div>
        <label className="block text-[12px] font-medium text-muted">
          Email
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[14px] text-ink" />
        </label>
        <label className="mt-3 block text-[12px] font-medium text-muted">
          Password
          <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[14px] text-ink" />
        </label>
        {error && <p className="mt-3 text-[12.5px] text-bad">{error}</p>}
        <button disabled={busy} className="mt-5 w-full rounded-md bg-ink py-2 text-[13.5px] font-medium text-white disabled:opacity-50">
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="mt-3 text-[11.5px] text-muted">Access is limited to the founder accounts configured for this workspace.</p>
      </form>
    </main>
  );
}
