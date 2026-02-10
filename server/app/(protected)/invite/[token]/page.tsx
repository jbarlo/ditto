import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { createDal } from "@/lib/db/dal";
import { getDb } from "@/lib/db/client";
import Link from "next/link";
import { route } from "@/lib/routes";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function InvitePage({ params }: PageProps) {
  const session = await requireAuth();
  const { token } = await params;
  const dal = createDal(await getDb());

  const inviteResult = await dal.getCanvasInvite(token);
  if (!inviteResult.ok) {
    const message =
      inviteResult.error === "EXPIRED"
        ? "This invite link has expired."
        : "Invite not found.";
    return (
      <main style={{ fontFamily: "monospace", padding: "2rem", maxWidth: "600px", margin: "0 auto" }}>
        <h1>Invalid Invite</h1>
        <p style={{ color: "#666" }}>{message}</p>
        <p>
          <Link href={route("/home")}>&larr; Go home</Link>
        </p>
      </main>
    );
  }

  const invite = inviteResult.data;

  const addResult = await dal.addCanvasUser(
    invite.canvasId,
    session.userId,
    invite.role
  );
  // idempotent so DUPLICATE ignorable
  if (!addResult.ok && addResult.error !== "DUPLICATE") {
    return (
      <main style={{ fontFamily: "monospace", padding: "2rem", maxWidth: "600px", margin: "0 auto" }}>
        <h1>Something went wrong</h1>
        <p style={{ color: "#666" }}>Could not accept the invite. Please try again.</p>
        <p>
          <Link href={route("/home")}>&larr; Go home</Link>
        </p>
      </main>
    );
  }

  redirect(route("/canvas/:canvasId", { canvasId: invite.canvasId }));
}
