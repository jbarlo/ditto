"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import type { CanvasRole } from "@/lib/canvas/roles";
import { route } from "@/lib/routes";

interface SharePanelProps {
  canvasId: string;
}

export default function SharePanel({ canvasId }: SharePanelProps) {
  const [inviteRole, setInviteRole] = useState<CanvasRole>("editor");
  const [showCreated, setShowCreated] = useState(false);
  const utils = trpc.useUtils();

  const usersQuery = trpc.canvas.listUsers.useQuery({ canvasId });
  const invitesQuery = trpc.canvas.listInvites.useQuery({ canvasId });

  const createInvite = trpc.canvas.createInvite.useMutation({
    onSuccess: () => {
      utils.canvas.invalidate();
      setShowCreated(true);
      setTimeout(() => setShowCreated(false), 2000);
    },
  });

  const copyInviteUrl = (token: string) => {
    const url = `${window.location.origin}${route("/invite/:token", { token })}`;
    navigator.clipboard.writeText(url);
  };

  const deleteInvite = trpc.canvas.deleteInvite.useMutation({
    onSuccess: () => utils.canvas.invalidate(),
  });

  const updateRole = trpc.canvas.updateRole.useMutation({
    onSuccess: () => utils.canvas.invalidate(),
  });

  const unshare = trpc.canvas.unshare.useMutation({
    onSuccess: () => utils.canvas.invalidate(),
  });

  const users = usersQuery.data ?? [];
  const invites = invitesQuery.data ?? [];

  return (
    <div style={{ fontFamily: "monospace", padding: "1rem", borderTop: "1px solid #ccc", marginTop: "1rem" }}>
      <h3 style={{ marginTop: 0 }}>Sharing</h3>

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1rem" }}>
        <select
          value={inviteRole}
          onChange={(e) => setInviteRole(e.target.value as CanvasRole)}
          style={{ fontFamily: "monospace", padding: "0.25rem" }}
        >
          <option value="editor">Editor</option>
          <option value="viewer">Viewer</option>
          <option value="owner">Owner</option>
        </select>
        <button
          onClick={() => createInvite.mutate({ canvasId, role: inviteRole })}
          disabled={createInvite.isPending}
          style={{ padding: "0.25rem 0.75rem", cursor: "pointer", fontFamily: "monospace" }}
        >
          {createInvite.isPending ? "Creating..." : "Create invite link"}
        </button>
        {showCreated && <span style={{ color: "#080", fontSize: "0.875rem" }}>Link created!</span>}
        {createInvite.isError && <span style={{ color: "#c00", fontSize: "0.875rem" }}>{createInvite.error.message}</span>}
      </div>

      {invites.length > 0 && (
        <div style={{ marginBottom: "1rem" }}>
          <h4 style={{ margin: "0 0 0.5rem" }}>Active invites</h4>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {invites.map((inv) => (
              <li
                key={inv.token}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "0.25rem",
                  fontSize: "0.875rem",
                }}
              >
                <span style={{ color: "#666" }}>
                  {inv.role} &middot; expires {new Date(inv.expiresAt).toLocaleDateString()}
                </span>
                <button
                  onClick={() => copyInviteUrl(inv.token)}
                  style={{ fontSize: "0.75rem", cursor: "pointer" }}
                >
                  copy
                </button>
                <button
                  onClick={() => deleteInvite.mutate({ canvasId, token: inv.token })}
                  disabled={deleteInvite.isPending}
                  style={{ fontSize: "0.75rem", color: "#c00", cursor: "pointer" }}
                >
                  revoke
                </button>
                {deleteInvite.isError && <span style={{ color: "#c00", fontSize: "0.75rem" }}>{deleteInvite.error.message}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {users.length > 0 && (
        <div>
          <h4 style={{ margin: "0 0 0.5rem" }}>People</h4>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {users.map((u) => (
              <li
                key={u.userId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "0.25rem",
                  fontSize: "0.875rem",
                }}
              >
                <span style={{ minWidth: "12ch" }}>{u.name ?? u.userId}</span>
                <select
                  value={u.role}
                  onChange={(e) =>
                    updateRole.mutate({
                      canvasId,
                      userId: u.userId,
                      role: e.target.value as CanvasRole,
                    })
                  }
                  disabled={updateRole.isPending}
                  style={{ fontFamily: "monospace", fontSize: "0.75rem" }}
                >
                  <option value="owner">owner</option>
                  <option value="editor">editor</option>
                  <option value="viewer">viewer</option>
                </select>
                {u.role !== "owner" && (
                  <button
                    onClick={() => unshare.mutate({ canvasId, userId: u.userId })}
                    disabled={unshare.isPending}
                    style={{ fontSize: "0.75rem", color: "#c00", cursor: "pointer" }}
                  >
                    remove
                  </button>
                )}
                {updateRole.isError && <span style={{ color: "#c00", fontSize: "0.75rem" }}>{updateRole.error.message}</span>}
                {unshare.isError && <span style={{ color: "#c00", fontSize: "0.75rem" }}>{unshare.error.message}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
