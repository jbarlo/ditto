import { withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { route } from "@/lib/routes";
import type { Session } from "./types";
export type { Session };

export async function getSession(): Promise<Session | null> {
  const { user } = await withAuth();
  if (!user) return null;
  return { userId: user.id, email: user.email };
}

/**
 * Require authentication. Redirects to login if not authenticated.
 * Call this at the top of protected server components/actions.
 */
export async function requireAuth(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    redirect(route("/login"));
  }
  return session;
}
