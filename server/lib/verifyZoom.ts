import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

/**
 * Verifies Zoom webhook requests.
 * Supports:
 * - Legacy verification token (quick start)
 * - HMAC signature via ZOOM_WEBHOOK_SECRET (preferred)
 */
export const verifyZoomRequest = (req: Request, res: Response, next: NextFunction) => {
  const webhookSecret = process.env.ZOOM_WEBHOOK_SECRET;
  const legacyToken = process.env.ZOOM_VERIFICATION_TOKEN;

  // URL Validation challenge (initial verification)
  if (req.body && req.body.event === "endpoint.url_validation" && req.body.payload?.plainToken) {
    const plainToken: string = req.body.payload.plainToken;
    const encryptedToken = crypto
      .createHmac("sha256", webhookSecret ?? "")
      .update(plainToken)
      .digest("hex");
    res.status(200).json({ plainToken, encryptedToken });
    return;
  }

  // HMAC signature verification when secret is configured
  if (webhookSecret) {
    const messageTs = req.get("x-zm-request-timestamp") ?? "";
    const signature = req.get("x-zm-signature") ?? "";
    const body = JSON.stringify(req.body);
    const message = `v0:${messageTs}:${body}`;
    const hashForVerify = crypto
      .createHmac("sha256", webhookSecret)
      .update(message)
      .digest("hex");
    const expectedSignature = `v0=${hashForVerify}`;
    if (signature !== expectedSignature) {
      return res.status(401).send("Invalid Zoom signature");
    }
  } else if (legacyToken) {
    // Fallback to legacy token check if provided
    const tokenFromReq: string | undefined = req.body?.payload?.token ?? req.body?.token;
    if (!tokenFromReq || tokenFromReq !== legacyToken) {
      return res.status(401).send("Invalid Zoom verification token");
    }
  }

  next();
};


