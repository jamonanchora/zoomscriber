import 'dotenv/config';
import express from "express";
import { zoomWebhookRouter } from "./routes/webhooks.js";
import { oauthRouter } from "./routes/oauth.js";

const app = express();

// Use native JSON parser
app.use(express.json({ limit: "10mb" }));

app.get("/healthz", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.use("/oauth", oauthRouter);
app.use("/webhooks/zoom", zoomWebhookRouter);

const port = Number(process.env.PORT ?? 3000);

if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Zoomscriber (Webhook Version) listening on :${port}`);
  });
}

export default app;

