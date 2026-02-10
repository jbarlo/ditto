"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

interface AlbumCanvas {
  id: string;
  imageUrl: string;
}

interface AlbumItem {
  id: string;
  name: string;
  canvases: AlbumCanvas[];
}

interface AlbumListProps {
  initialData: AlbumItem[];
}

export default function AlbumList({ initialData }: AlbumListProps) {
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState("");

  const { data: albums } = trpc.album.listWithCanvases.useQuery(undefined, {
    initialData,
  });

  const invalidate = () => {
    utils.album.invalidate();
    utils.canvas.invalidate();
  };

  const createAlbum = trpc.album.create.useMutation({
    onSuccess: () => {
      setNewAlbumName("");
      setShowForm(false);
      invalidate();
    },
  });

  const deleteAlbum = trpc.album.delete.useMutation({
    onSuccess: () => {
      invalidate();
      utils.frame.invalidate();
    },
  });

  const removeCanvas = trpc.album.removeCanvas.useMutation({
    onSuccess: invalidate,
  });

  const moveCanvas = trpc.album.moveCanvas.useMutation({
    onSuccess: () => utils.album.invalidate(),
  });

  return (
    <section style={{ marginBottom: "2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2>Your Albums</h2>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            style={{ padding: "0.5rem 1rem", cursor: "pointer", fontFamily: "monospace" }}
          >
            Create Album
          </button>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newAlbumName.trim()) {
              createAlbum.mutate({ name: newAlbumName.trim() });
            }
          }}
          style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem" }}
        >
          <input
            autoFocus
            value={newAlbumName}
            onChange={(e) => setNewAlbumName(e.target.value)}
            placeholder="Album name"
            style={{ flex: 1, padding: "0.5rem", fontFamily: "monospace" }}
          />
          <button
            type="submit"
            disabled={createAlbum.isPending || !newAlbumName.trim()}
            style={{ padding: "0.5rem 1rem", cursor: "pointer", fontFamily: "monospace" }}
          >
            {createAlbum.isPending ? "Creating..." : "Create"}
          </button>
          <button
            type="button"
            onClick={() => { setShowForm(false); setNewAlbumName(""); }}
            style={{ padding: "0.5rem 1rem", cursor: "pointer", fontFamily: "monospace" }}
          >
            Cancel
          </button>
        </form>
      )}

      {albums.length === 0 ? (
        <p style={{ color: "#666" }}>No albums yet.</p>
      ) : (
        albums.map((album) => (
          <div
            key={album.id}
            style={{
              border: "1px solid #ccc",
              padding: "1rem",
              marginBottom: "1rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <h3 style={{ margin: 0 }}>{album.name}</h3>
              <button
                onClick={() => {
                  if (confirm(`Delete album "${album.name}"? Canvases will not be deleted.`)) {
                    deleteAlbum.mutate({ albumId: album.id });
                  }
                }}
                disabled={deleteAlbum.isPending}
                style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem", color: "#c00", cursor: "pointer", fontFamily: "monospace" }}
              >
                Delete
              </button>
            </div>
            {album.canvases.length === 0 ? (
              <p style={{ color: "#666", margin: 0, fontSize: "0.875rem" }}>
                No canvases in this album.
              </p>
            ) : (
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  overflowX: "auto",
                  paddingBottom: "0.5rem",
                }}
              >
                {album.canvases.map((canvas, i) => (
                  <div
                    key={canvas.id}
                    style={{
                      flexShrink: 0,
                      width: "120px",
                      border: "1px solid #ddd",
                      padding: "0.25rem",
                    }}
                  >
                    <img
                      src={canvas.imageUrl}
                      alt={`Canvas ${i + 1}`}
                      style={{ width: "100%", height: "auto", display: "block" }}
                    />
                    <div style={{ display: "flex", gap: "0.125rem", marginTop: "0.25rem", justifyContent: "center" }}>
                      <button
                        onClick={() => moveCanvas.mutate({ albumId: album.id, canvasId: canvas.id, direction: "up" })}
                        disabled={i === 0 || moveCanvas.isPending}
                        style={{ fontSize: "0.7rem", padding: "0.125rem 0.25rem", cursor: i === 0 ? "not-allowed" : "pointer" }}
                      >
                        ←
                      </button>
                      <button
                        onClick={() => moveCanvas.mutate({ albumId: album.id, canvasId: canvas.id, direction: "down" })}
                        disabled={i === album.canvases.length - 1 || moveCanvas.isPending}
                        style={{ fontSize: "0.7rem", padding: "0.125rem 0.25rem", cursor: i === album.canvases.length - 1 ? "not-allowed" : "pointer" }}
                      >
                        →
                      </button>
                      <button
                        onClick={() => removeCanvas.mutate({ albumId: album.id, canvasId: canvas.id })}
                        disabled={removeCanvas.isPending}
                        style={{ fontSize: "0.7rem", padding: "0.125rem 0.25rem", color: "#c00", cursor: "pointer" }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </section>
  );
}
