import type { VercelRequest } from "@vercel/node";
import { supabaseAdmin } from "./supabase";

export class UnauthorizedError extends Error {}

export async function requireUser(req: VercelRequest): Promise<{ id: string }> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

  if (!token) {
    throw new UnauthorizedError("Missing Authorization header");
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    throw new UnauthorizedError("Invalid or expired session");
  }

  return { id: data.user.id };
}
