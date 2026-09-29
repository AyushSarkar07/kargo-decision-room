import { redirect } from "next/navigation";
import { getSession, supabaseServer } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { DecisionRoom } from "@/components/DecisionRoom";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  if (session) return <DecisionRoom />;

  const cfg = getConfig();
  if (cfg.data === "local-demo") {
    return (
      <Notice title="Setup needed">
        Live mode is not configured yet, and demo mode only runs locally. Missing settings:
        <ul className="mt-2 list-disc pl-5 font-mono text-[12.5px]">
          {["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "FOUNDER_EMAILS"]
            .filter((k) => !process.env[k]?.trim())
            .map((k) => (
              <li key={k}>{k}</li>
            ))}
        </ul>
        <p className="mt-2">Add them in the Vercel project settings and redeploy. See the README.</p>
      </Notice>
    );
  }
  const { data } = await (await supabaseServer()).auth.getUser();
  if (!data.user) redirect("/login");
  return (
    <Notice title="This account is not allowed">
      {data.user.email} is signed in but is not on the founder list.{" "}
      <form action="/auth/signout" method="post" className="mt-3">
        <button className="rounded-md border border-line-strong bg-card px-3 py-1.5 text-[13px]">Sign out</button>
      </form>
    </Notice>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md rounded-lg border border-line bg-card p-6 text-[14px] text-ink-2">
        <h1 className="mb-2 font-serif text-[20px] text-ink">{title}</h1>
        {children}
      </div>
    </main>
  );
}
