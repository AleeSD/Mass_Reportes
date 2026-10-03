import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import express from "express";
import { createApiRouter } from "./api.js";
import { PROJECT_ROOT } from "./config.js";
import { startScheduler } from "./scheduler.js";

const PORT = Number(process.env.PORT || 8000);
const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use("/api", createApiRouter());

const frontendDist = path.join(PROJECT_ROOT, "frontend", "dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`API lista en http://localhost:${PORT}`);
  // ONWAY_SCHEDULER=off desactiva el scheduler (útil en desarrollo / pruebas).
  if (process.env.ONWAY_SCHEDULER !== "off") startScheduler();
});
