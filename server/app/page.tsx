import Link from "next/link";
import { route } from "@/lib/routes";

export default function Home() {
  return (
    <main style={{ fontFamily: "monospace", padding: "2rem" }}>
      <h1>ditto</h1>
      <p>
        <Link href={route("/home")}>Go to dashboard</Link>
      </p>
    </main>
  );
}
