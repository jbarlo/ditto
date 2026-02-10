import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";
import { TRPCProvider } from "@/lib/trpc/provider";

export const metadata = {
  title: "ditto",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthKitProvider>
          <TRPCProvider>{children}</TRPCProvider>
        </AuthKitProvider>
      </body>
    </html>
  );
}
