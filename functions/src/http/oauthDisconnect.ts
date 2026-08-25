import { onRequest } from "firebase-functions/v2/https";
import { setIntegrationStatus } from "../lib/integrations";
import { WEB_APP_URL } from "../lib/secrets";
import { deleteTokens } from "../lib/tokens";
import { isIntegrationProvider } from "../lib/types";

export const oauthDisconnect = onRequest(async (req, res) => {
  const provider = req.query.provider;
  const uid = req.query.uid;
  const returnTo = typeof req.query.returnTo === "string" ? req.query.returnTo : "/integrations";

  if (!isIntegrationProvider(provider) || typeof uid !== "string" || !uid) {
    res.status(400).send("Missing or invalid provider/uid");
    return;
  }

  await deleteTokens(uid, provider);
  await setIntegrationStatus(uid, provider, { status: "disconnected" });

  res.redirect(`${WEB_APP_URL.value()}${returnTo}`);
});
