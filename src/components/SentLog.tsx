"use client";
import type { Candidate } from "@/lib/board";
import { Chip } from "./ui";

export function SentLog({ candidates }: { candidates: Candidate[] }) {
  const rows = candidates
    .flatMap((c) => c.sends.map((s) => ({ c, s, type: c.drafts.invite?.id === s.draft_id ? "Invite" : "Rejection" })))
    .sort((a, b) => b.s.created_at.localeCompare(a.s.created_at));
  return (
    <section className="mx-auto max-w-5xl">
      <h2 className="font-serif text-[22px]">Sent log</h2>
      <p className="mb-3 text-[13px] text-muted">
        Every send attempt. &ldquo;Accepted&rdquo; means the provider took the message; &ldquo;Delivered&rdquo; appears only when a delivery webhook confirms it.
      </p>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-line bg-card px-4 py-6 text-[13px] text-muted">Nothing has been sent.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-card">
          <table className="w-full text-left text-[12.5px]">
            <thead className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2 font-semibold">When</th>
                <th className="px-3 py-2 font-semibold">Candidate</th>
                <th className="px-3 py-2 font-semibold">Email</th>
                <th className="px-3 py-2 font-semibold">Delivered to</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Provider id</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {rows.map(({ c, s, type }) => (
                <tr key={s.id}>
                  <td className="tabular whitespace-nowrap px-3 py-2 text-muted">{new Date(s.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2">{c.name ?? "Unknown"}</td>
                  <td className="px-3 py-2">{type}</td>
                  <td className="px-3 py-2">
                    {s.to_address}
                    {s.candidate_address && s.candidate_address !== s.to_address && <span className="block text-[11px] text-muted">candidate: {s.candidate_address} (not used)</span>}
                  </td>
                  <td className="px-3 py-2">
                    {s.mode === "simulated" ? (
                      <Chip tone="warn">Simulated</Chip>
                    ) : (
                      <Chip tone={s.status === "delivered" ? "good" : s.status === "accepted" ? "info" : s.status === "sending" ? "info" : "bad"}>
                        {s.status === "accepted" ? "Accepted by provider" : s.status}
                      </Chip>
                    )}
                    {s.error && <span className="block text-[11px] text-bad">{s.error}</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-muted">{s.provider_message_id ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
