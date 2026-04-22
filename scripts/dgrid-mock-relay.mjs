#!/usr/bin/env node
/**
 * Minimal mock DGrid relay server for local demos.
 *
 * Accepts POST requests with { topic, envelope } and logs them.
 * Returns a relay receipt so the orchestrator can confirm publish.
 *
 * Usage:
 *   node scripts/dgrid-mock-relay.mjs          # default port 7400
 *   PORT=8080 node scripts/dgrid-mock-relay.mjs
 *
 * Or via npm:
 *   npm run dgrid:mock
 *
 * Then set in your env:
 *   DARK_MATTER_DGRID_ENABLED=true
 *   DARK_MATTER_DGRID_ENDPOINT=http://localhost:7400/relay
 *   DARK_MATTER_DGRID_TOPIC=agentic-dark-matter.negotiation
 */
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

const PORT = Number(process.env.PORT || 7400);
let relayCount = 0;
const received = [];

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, relayed: relayCount }));
    return;
  }

  if (req.method === "GET" && req.url === "/log") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, entries: received }));
    return;
  }

  if (req.method === "POST" && req.url === "/relay") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "invalid JSON" }));
        return;
      }

      relayCount++;
      const relayId = randomBytes(8).toString("hex");
      const entry = {
        relayId,
        topic: parsed.topic || "(no-topic)",
        envelopeId: parsed.envelope?.envelopeId || "(no-id)",
        receivedAt: new Date().toISOString(),
      };
      received.push(entry);

      console.log(
        `[dgrid-mock] #${relayCount} relayed  id=${entry.relayId}  topic=${entry.topic}  envelope=${entry.envelopeId}`,
      );

      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, relayId }));
    });
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: false, error: "not found" }));
});

server.listen(PORT, () => {
  console.log(
    `[dgrid-mock] relay server listening on http://localhost:${PORT}`,
  );
  console.log(`[dgrid-mock]   POST http://localhost:${PORT}/relay`);
  console.log(`[dgrid-mock]   GET  http://localhost:${PORT}/health`);
  console.log(`[dgrid-mock]   GET  http://localhost:${PORT}/log`);
  console.log("[dgrid-mock] env preset:");
  console.log(`[dgrid-mock]   DARK_MATTER_DGRID_ENABLED=true`);
  console.log(
    `[dgrid-mock]   DARK_MATTER_DGRID_ENDPOINT=http://localhost:${PORT}/relay`,
  );
  console.log(
    `[dgrid-mock]   DARK_MATTER_DGRID_TOPIC=agentic-dark-matter.negotiation`,
  );
});

process.on("SIGINT", () => {
  console.log(`\n[dgrid-mock] shutting down. Total relayed: ${relayCount}`);
  server.close(() => process.exit(0));
});
