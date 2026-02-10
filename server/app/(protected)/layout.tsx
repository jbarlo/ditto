import { requireAuth } from "@/lib/auth";
import { AuthProvider } from "@/lib/auth/provider";
import BfcacheRefresh from "./BfcacheRefresh";

/**
 * Protected layout. All routes under (protected)/ require authentication.
 *
 * The auth check happens server-side in requireAuth(), which redirects
 * to /login if not authenticated. The AuthProvider passes the userId
 * to client components that need it.
 */
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();

  return (
    <AuthProvider userId={session.userId}>
      <BfcacheRefresh />
      {children}
    </AuthProvider>
  );
}
