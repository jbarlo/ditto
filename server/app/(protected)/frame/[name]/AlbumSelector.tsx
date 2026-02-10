"use client";

import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";

interface AlbumSelectorProps {
  frameId: string;
  currentAlbumId: string | null;
  albums: { id: string; name: string }[];
}

export default function AlbumSelector({
  frameId,
  currentAlbumId,
  albums,
}: AlbumSelectorProps) {
  const router = useRouter();

  const setAlbum = trpc.frame.setAlbum.useMutation({
    onSuccess: () => router.refresh(),
  });

  const handleChange = (albumId: string) => {
    setAlbum.mutate({
      frameId,
      albumId: albumId || null,
    });
  };

  return (
    <section style={{ marginBottom: "2rem" }}>
      <h2>Album</h2>
      <p style={{ color: "#666", fontSize: "0.875rem", marginBottom: "0.5rem" }}>
        Select which album this frame displays.
      </p>
      <select
        value={currentAlbumId ?? ""}
        onChange={(e) => handleChange(e.target.value)}
        disabled={setAlbum.isPending}
        style={{
          padding: "0.5rem",
          fontFamily: "monospace",
          fontSize: "1rem",
          minWidth: "200px",
        }}
      >
        <option value="">None</option>
        {albums.map((album) => (
          <option key={album.id} value={album.id}>
            {album.name}
          </option>
        ))}
      </select>
      {setAlbum.isPending && (
        <span style={{ marginLeft: "0.5rem", color: "#666" }}>Saving...</span>
      )}
    </section>
  );
}
