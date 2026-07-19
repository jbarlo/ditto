import { handleAuth } from "@workos-inc/authkit-nextjs";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { createDal } from "@/lib/db/dal";
import { getClientIp } from "@/lib/api/ip";
import { route } from "@/lib/routes";
import { env } from "@/lib/env";

export const CALLBACK_RATE_LIMIT = 10;
export const CALLBACK_RATE_WINDOW = 60;

const authHandler = handleAuth({
  returnPathname: route("/home"),
  baseURL: env.BASE_URL,
  async onSuccess({ user }) {
    const dal = createDal(await getDb());
    await dal.upsertPerson(user.id, user.email);
  },
});

export async function GET(request: NextRequest) {
  const dal = createDal(await getDb());
  const ip = getClientIp(request);
  const rateLimitResult = await dal.checkRateLimit(
    `ip:${ip}:callback`,
    CALLBACK_RATE_LIMIT,
    CALLBACK_RATE_WINDOW
  );

  if (!rateLimitResult.ok || !rateLimitResult.data.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(CALLBACK_RATE_WINDOW) },
      }
    );
  }

  return authHandler(request);
}
