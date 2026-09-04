'use client';

import React from 'react';

const TONE: Record<string, string> = {
  completed: "text-verified",
  verified: "text-verified",
  ok: "text-verified",
  running: "text-signal",
  queued: "text-signal",
  warn: "text-signal",
  attention: "text-signal",
  unverified: "text-fog",
  failed: "text-alert",
  fail: "text-alert",
};

export function StatusPill({ status }: { status: string }) {
  const tone = TONE[status] ?? "text-fog";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border border-current/25 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.12em] ${tone}`}
    >
      <span
        className={`state-dot ${status === "running" || status === "queued" ? "pulse-soft" : ""}`}
      />
      {status}
    </span>
  );
}
