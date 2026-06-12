// server.js - local dev server for API routes only
import { resolve } from "path";
import { config } from "dotenv";

// Resolve absolute path to .env.local so it works regardless of
// which directory node is invoked from
const envPath = resolve(process.cwd(), ".env.local");
const result = config({ path: envPath });

if (result.error) {
  console.error("Could not load .env.local at:", envPath);
  console.error(result.error.message);
  process.exit(1);
}

console.log("Loaded .env.local from:", envPath);
console.log("ANTHROPIC_API_KEY present:", !!process.env.ANTHROPIC_API_KEY);

import express from "express";

const app = express();
app.use(express.json({ limit: "10mb" }));

app.use((req, res, next) => {
  console.log("Incoming request:", req.method, req.path);
  next();
});

app.post("/api/stage0", async (req, res) => {
  const { default: handler } = await import("./api/stage0.js");
  handler(req, res);
});

app.post("/api/stage1", async (req, res) => {
  const { default: handler } = await import("./api/stage1.js");
  handler(req, res);
});

app.post("/api/stage2", async (req, res) => {
  const { default: handler } = await import("./api/stage2.js");
  handler(req, res);
});

app.listen(3000, () => {
  console.log("API server running at http://localhost:3000");
});
