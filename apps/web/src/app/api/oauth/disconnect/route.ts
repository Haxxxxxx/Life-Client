import { isIntegrationProvider } from "@life-client/shared";
import { NextRequest, NextResponse } from "next/server";
import { setIntegrationStatus } from "@/lib/server/integrationStatus";
import { deleteTokens } from "@/lib/server/tokens";

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const provider = searchParams.get("provider");
  const uid = searchParams.get("uid");
  const returnTo = searchParams.get("returnTo") ?? "/integrations";

  if (!isIntegrationProvider(provider) || !uid) {
    return NextResponse.json({ error: "Missing or invalid provider/uid" }, { status: 400 });
  }

  await deleteTokens(uid, provider);
  await setIntegrationStatus(uid, provider, { status: "disconnected" });

  return NextResponse.redirect(`${origin}${returnTo}`);
}
