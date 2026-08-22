import { Router, type IRouter } from "express";
import { AccessToken } from "livekit-server-sdk";

const router: IRouter = Router();

router.post("/rooms/:code/voice-token", async (req, res): Promise<void> => {
  const code = String(req.params.code ?? "").trim();
  const playerId = String(req.body?.playerId ?? "").trim();
  const nickname = String(req.body?.nickname ?? "").trim();

  if (!/^[0-9]{10}$/.test(code) || !playerId) {
    res.status(400).json({ error: "Parametres invalides" });
    return;
  }

  const apiKey = process.env["LIVEKIT_API_KEY"];
  const apiSecret = process.env["LIVEKIT_API_SECRET"];
  const wsUrl = process.env["LIVEKIT_URL"];

  if (!apiKey || !apiSecret || !wsUrl) {
    req.log.error("LiveKit env vars missing");
    res.status(500).json({ error: "Configuration vocale manquante cote serveur" });
    return;
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity: playerId,
    name: nickname || playerId,
  });

  at.addGrant({
    roomJoin: true,
    room: code,
    canPublish: true,
    canSubscribe: true,
  });

  const token = await at.toJwt();

  res.json({ token, url: wsUrl });
});

export default router;