import type { NextApiRequest, NextApiResponse } from "next";
import { asyncHandler, sendSuccess } from "@/lib/utils";

function clearSessionCookie(): string {
  return "bitiq_access_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).end();
    return;
  }

  res.setHeader("Set-Cookie", clearSessionCookie());
  sendSuccess(res, { message: "Signed out" }, 200, req);
});
