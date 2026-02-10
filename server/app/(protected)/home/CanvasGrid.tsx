"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { route } from "@/lib/routes";
import type { CanvasRole } from "@/lib/canvas/roles";

interface CanvasItem {
  id: string;
  imageId: string;
  imageUrl: string;
  createdAt: string | null;
  compositedAt: string | null;
  role: CanvasRole;
}

interface AlbumSummary {
  id: string;
  name: string;
  canvases: { id: string; imageUrl: string }[];
}

interface CanvasGridProps {
  initialData: CanvasItem[];
  albums: AlbumSummary[];
}

export default function CanvasGrid({ initialData, albums: initialAlbums }: CanvasGridProps) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data: canvases } = trpc.canvas.list.useQuery(undefined, {
    initialData,
  });

  const { data: albums } = trpc.album.listWithCanvases.useQuery(undefined, {
    initialData: initialAlbums,
  });

  const createBlank = trpc.canvas.createBlank.useMutation({
    onSuccess: (data) => {
      router.push(route("/canvas/:canvasId", { canvasId: data.canvasId }));
    },
  });

  const addToAlbum = trpc.canvas.addToAlbum.useMutation({
    onSuccess: () => {
      utils.canvas.invalidate();
      utils.album.invalidate();
    },
  });

  const [addingToAlbum, setAddingToAlbum] = useState<string | null>(null);

  const getAlbumsForCanvas = (canvasId: string) => {
    const albumsContaining = new Set(
      albums
        .filter((a) => a.canvases.some((c) => c.id === canvasId))
        .map((a) => a.id)
    );
    return albums.filter((a) => !albumsContaining.has(a.id));
  };

  return (
    <section style={{ marginBottom: "2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2>Your Canvases</h2>
        <button
          onClick={() => createBlank.mutate()}
          disabled={createBlank.isPending}
          style={{ padding: "0.5rem 1rem", cursor: "pointer", fontFamily: "monospace" }}
        >
          {createBlank.isPending ? "Creating..." : "Create Canvas"}
        </button>
      </div>

      {(!canvases || canvases.length === 0) ? (
        <p style={{ color: "#666" }}>No canvases yet. Create one to get started.</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: "1rem",
          }}
        >
          {canvases.map((canvas) => {
            const availableAlbums = getAlbumsForCanvas(canvas.id);
            const inAlbums = albums.filter((a) =>
              a.canvases.some((c) => c.id === canvas.id)
            );

            return (
              <div
                key={canvas.id}
                style={{
                  border: "1px solid #ccc",
                  padding: "0.5rem",
                }}
              >
                <Link href={route("/canvas/:canvasId", { canvasId: canvas.id })}>
                  <img
                    src={canvas.imageUrl}
                    alt="Canvas"
                    style={{ width: "100%", height: "auto", display: "block" }}
                  />
                </Link>

                <div style={{ marginTop: "0.5rem", display: "flex", flexWrap: "wrap", gap: "0.25rem", alignItems: "center" }}>
                  {canvas.role !== "owner" && (
                    <span
                      style={{
                        fontSize: "0.7rem",
                        color: "#666",
                        border: "1px solid #ccc",
                        borderRadius: "2px",
                        padding: "0 0.25rem",
                      }}
                    >
                      {canvas.role}
                    </span>
                  )}
                  {inAlbums.length === 0 && (
                    <span
                      style={{
                        fontSize: "0.7rem",
                        color: "#999",
                        border: "1px dashed #ccc",
                        borderRadius: "2px",
                        padding: "0 0.25rem",
                      }}
                    >
                      No album
                    </span>
                  )}
                  {inAlbums.map((a) => (
                    <span
                      key={a.id}
                      style={{
                        fontSize: "0.7rem",
                        color: "#333",
                        background: "#eee",
                        borderRadius: "2px",
                        padding: "0 0.25rem",
                      }}
                    >
                      {a.name}
                    </span>
                  ))}
                </div>

                {availableAlbums.length > 0 && (
                  <div style={{ marginTop: "0.25rem" }}>
                    {addingToAlbum === canvas.id ? (
                      <select
                        autoFocus
                        onChange={(e) => {
                          if (e.target.value) {
                            addToAlbum.mutate({ canvasId: canvas.id, albumId: e.target.value });
                            setAddingToAlbum(null);
                          }
                        }}
                        onBlur={() => setAddingToAlbum(null)}
                        style={{ fontSize: "0.75rem", fontFamily: "monospace", width: "100%" }}
                      >
                        <option value="">Select album...</option>
                        {availableAlbums.map((a) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    ) : (
                      <button
                        onClick={() => setAddingToAlbum(canvas.id)}
                        style={{
                          fontSize: "0.7rem",
                          padding: "0.125rem 0.375rem",
                          cursor: "pointer",
                          fontFamily: "monospace",
                        }}
                      >
                        + Add to album
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
