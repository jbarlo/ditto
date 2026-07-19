import { NextRequest, NextResponse } from "next/server";
import { imageStorage } from "@/lib/storage";
import { env } from "@/lib/env";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (env.storageMode !== "local") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { id } = await params;
  const buffer = await imageStorage.get(id);

  if (!buffer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(Uint8Array.from(buffer), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
