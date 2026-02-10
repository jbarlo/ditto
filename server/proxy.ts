import { authkitMiddleware } from "@workos-inc/authkit-nextjs";

export default authkitMiddleware();

export const config = {
  matcher: [
    // Run on all routes except static files
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
