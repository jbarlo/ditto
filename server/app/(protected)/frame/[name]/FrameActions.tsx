"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { route } from "@/lib/routes";

interface FrameActionsProps {
  frameId: string;
}

export default function FrameActions({ frameId }: FrameActionsProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const release = trpc.frame.release.useMutation({
    onSuccess: () => router.push(route("/home")),
    onError: (e) => setError(e.message),
  });

  const del = trpc.frame.delete.useMutation({
    onSuccess: () => router.push(route("/home")),
    onError: (e) => setError(e.message),
  });

  const pending = release.isPending || del.isPending;

  const handleRelease = () => {
    if (!confirm("Release this frame? It will show the claim screen and can be re-claimed by anyone.")) return;
    setError(null);
    release.mutate({ frameId });
  };

  const handleDelete = () => {
    if (!confirm("Delete this frame from the server? The device will need a factory reset to set up again.")) return;
    setError(null);
    del.mutate({ frameId });
  };

  return (
    <section style={{ marginBottom: "2rem" }}>
      <h2>Manage</h2>
      <div style={{ display: "flex", gap: "1rem", marginBottom: "0.5rem" }}>
        <button onClick={handleRelease} disabled={pending} style={{ fontFamily: "monospace", padding: "0.5rem 1rem" }}>
          Release frame
        </button>
        <button onClick={handleDelete} disabled={pending} style={{ fontFamily: "monospace", padding: "0.5rem 1rem", color: "#c00" }}>
          Delete frame
        </button>
      </div>
      <p style={{ color: "#666", fontSize: "0.875rem", margin: 0 }}>
        <strong>Release</strong> resets the frame so it can be re-claimed. <strong>Delete</strong> removes all data. Device will need a factory reset.
      </p>
      {error && <p style={{ color: "#c00", marginTop: "0.5rem" }}>{error}</p>}
    </section>
  );
}
