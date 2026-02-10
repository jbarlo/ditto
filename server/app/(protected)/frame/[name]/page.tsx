import { getDb } from "@/lib/db/client";
import { createDal } from "@/lib/db/dal";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import Link from "next/link";
import { BATTERY_MAX_VOLTAGE, BATTERY_MIN_VOLTAGE } from "@/lib/config";
import { route } from "@/lib/routes";
import AlbumSelector from "./AlbumSelector";
import FrameActions from "./FrameActions";

export default async function FramePage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const session = await requireAuth();

  const { name } = await params;
  const dal = createDal(await getDb());

  const frameResult = await dal.getFrameByNameForUser(name, session.userId);

  if (!frameResult.ok) {
    redirect(route("/home"));
  }
  const frame = frameResult.data;

  const batteryRange = BATTERY_MAX_VOLTAGE - BATTERY_MIN_VOLTAGE;
  const batteryPercent = frame.batteryVoltage
    ? Math.round(
        Math.max(0, Math.min(100, ((frame.batteryVoltage - BATTERY_MIN_VOLTAGE) / batteryRange) * 100))
      )
    : null;

  let albumName: string | null = null;
  let canvasCount = 0;
  if (frame.currentAlbumId) {
    const albumResult = await dal.getAlbum(frame.currentAlbumId);
    albumName = albumResult.ok ? albumResult.data.name : null;
    const canvasesResult = await dal.getCanvasesInAlbum(frame.currentAlbumId);
    canvasCount = canvasesResult.ok ? canvasesResult.data.length : 0;
  }

  const albumsResult = await dal.getAlbumsForUser(session.userId);
  const albums = albumsResult.ok
    ? albumsResult.data.map((a) => ({ id: a.id, name: a.name }))
    : [];

  return (
    <main
      style={{
        fontFamily: "monospace",
        padding: "2rem",
        maxWidth: "800px",
        margin: "0 auto",
      }}
    >
      <p>
        <Link href={route("/home")}>&larr; Back to home</Link>
      </p>
      <h1>{String(frame.name)}</h1>

      <section style={{ marginBottom: "2rem" }}>
        <h2>Status</h2>
        <table style={{ borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td style={{ padding: "0.25rem 1rem 0.25rem 0", color: "#666" }}>
                Album
              </td>
              <td>{albumName ?? "None"}</td>
            </tr>
            <tr>
              <td style={{ padding: "0.25rem 1rem 0.25rem 0", color: "#666" }}>
                Position
              </td>
              <td>
                {canvasCount > 0
                  ? `${(frame.currentIndex ?? 0) + 1} of ${canvasCount}`
                  : "—"}
              </td>
            </tr>
            <tr>
              <td style={{ padding: "0.25rem 1rem 0.25rem 0", color: "#666" }}>
                Last seen
              </td>
              <td>{frame.lastSeenAt ?? "Never"}</td>
            </tr>
            <tr>
              <td style={{ padding: "0.25rem 1rem 0.25rem 0", color: "#666" }}>
                Battery
              </td>
              <td
                style={
                  batteryPercent !== null && batteryPercent < 20
                    ? { color: "#c00" }
                    : undefined
                }
              >
                {batteryPercent !== null
                  ? `${batteryPercent}% (${frame.batteryVoltage}V)`
                  : "—"}
              </td>
            </tr>
            {frame.firmwareVersion && (
              <tr>
                <td style={{ padding: "0.25rem 1rem 0.25rem 0", color: "#666" }}>
                  Firmware
                </td>
                <td>{frame.firmwareVersion}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <AlbumSelector
        frameId={frame.id}
        currentAlbumId={frame.currentAlbumId}
        albums={albums}
      />

      <FrameActions frameId={frame.id} />
    </main>
  );
}
