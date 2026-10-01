import { redirect } from "next/navigation";
import { accessCodeEnabled, openAccess } from "@/lib/access-code";
import { PasswordLogin } from "./PasswordLogin";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (openAccess()) redirect("/");
  if (!accessCodeEnabled()) return <PasswordLogin />;
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form action="/auth/code" method="post" className="w-full max-w-sm rounded-lg border border-line bg-card p-6">
        <div className="mb-5">
          <div className="text-[15px] font-semibold">Kargo</div>
          <div className="font-serif text-[20px] italic text-ink-2">The Decision Room</div>
        </div>
        <label className="block text-[12px] font-medium text-muted">
          Access code
          <input
            name="code"
            required
            autoFocus
            autoComplete="current-password"
            autoCapitalize="none"
            spellCheck={false}
            className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-2 font-mono text-[15px] text-ink"
          />
        </label>
        {error && <p className="mt-3 text-[12.5px] text-bad">That code didn&apos;t match. Try again.</p>}
        <button className="mt-5 w-full rounded-md bg-ink py-2 text-[13.5px] font-medium text-white">Enter</button>
        <p className="mt-3 text-[11.5px] text-muted">You stay signed in on this device for 30 days.</p>
      </form>
    </main>
  );
}
