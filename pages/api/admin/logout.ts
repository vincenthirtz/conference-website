// pages/api/admin/logout.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerClient } from "@/utils/supabase";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = getServerClient(req, res);

    // Supprime la session côté serveur (cookies SSR)
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("[/api/admin/logout] signOut error:", error);
      return res.status(500).json({ error: "Failed to sign out" });
    }

    // Les cookies sont nettoyés par le client SSR via la réponse
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("[/api/admin/logout] internal error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
