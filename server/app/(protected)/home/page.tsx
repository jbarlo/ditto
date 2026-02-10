import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { createDal } from "@/lib/db/dal";
import { getCanvasImageUrl } from "@/lib/api/display";
import { compact } from "lodash-es";
import Link from "next/link";
import { route } from "@/lib/routes";
import CanvasGrid from "./CanvasGrid";
import AlbumList from "./AlbumList";

export default async function HomePage() {
  const session = await requireAuth();
  const dal = createDal(await getDb());

  const framesResult = await dal.getFramesForUser(session.userId);
  const frames = framesResult.ok ? framesResult.data : [];

  const canvasesResult = await dal.getCanvasesForUser(session.userId);
  const rawCanvases = canvasesResult.ok ? canvasesResult.data : [];
  // FIXME: N+1, but compositing for fresh images is better experience. batch
  // option?
  const canvasImageResults = await Promise.allSettled(
    rawCanvases.map(async (c) => ({
      id: c.id,
      imageId: c.imageId,
      imageUrl: (await getCanvasImageUrl(c, dal)).url,
      createdAt: c.createdAt,
      compositedAt: c.compositedAt,
      role: c.role,
    }))
  );
  const canvases = compact(
    canvasImageResults.map((r) => (r.status === "fulfilled" ? r.value : null))
  );

  const albumsResult = await dal.getAlbumsWithCanvases(session.userId);
  const rawAlbums = albumsResult.ok ? albumsResult.data : [];
  const albums = await Promise.all(
    rawAlbums.map(async (a) => {
      const canvasImages = await Promise.allSettled(
        a.canvases.map(async (c) => ({
          id: c.id,
          imageUrl: (await getCanvasImageUrl(c, dal)).url,
        }))
      );
      return {
        id: a.id,
        name: a.name,
        canvases: compact(
          canvasImages.map((r) => (r.status === "fulfilled" ? r.value : null))
        ),
      };
    })
  );

  return (
    <main style={{ fontFamily: "monospace", padding: "2rem", maxWidth: "800px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <h1>Home</h1>
        <a
          href={route("/logout")}
          style={{
            fontFamily: "monospace",
            padding: "0.5rem 1rem",
            background: "none",
            border: "1px solid #666",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          Log out
        </a>
      </div>

      <CanvasGrid initialData={canvases} albums={albums} />

      <AlbumList initialData={albums} />

      <section style={{ marginTop: "2rem" }}>
        <h2>Your Frames</h2>
        {frames.length === 0 ? (
          <p style={{ color: "#666" }}>
            No frames yet. <Link href={route("/claim")}>Claim one</Link> to get started.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {frames.filter((f): f is typeof f & { name: string } => f.name !== null).map((frame) => (
              <li key={frame.name} style={{ marginBottom: "1rem" }}>
                <Link
                  href={route("/frame/:name", { name: frame.name })}
                  style={{
                    display: "block",
                    padding: "1rem",
                    border: "1px solid #ccc",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <strong>{frame.name}</strong>
                  <span style={{ color: "#666", marginLeft: "1rem", fontSize: "0.875rem" }}>
                    claimed {frame.claimedAt}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p style={{ marginTop: "1rem" }}>
          <Link href={route("/claim")}>Claim another frame</Link>
        </p>
      </section>
    </main>
  );
}
