import type { NextRequest } from "next/server";
import { adminAuth } from "./admin";

/**
 * Verifies the Firebase ID token in the `Authorization: Bearer <token>` header
 * and returns the caller's uid, or null if missing/invalid.
 */
export async function requireUid(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}
