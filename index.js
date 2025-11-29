import express from "express";
import fs from "fs";
import crypto from "crypto";
import http from "http";
import https from "https";

const app = express();
const PORT = 8080;

// Raw body collector for webhooks (Stripe)
app.use((req, res, next) => {
  let data = [];
  req.on("data", chunk => data.push(chunk));
  req.on("end", () => {
    req.rawBody = Buffer.concat(data);
    next();
  });
});

app.use(express.json({ limit: "10mb" }));

const DATA_FILE = "./tunnels.json";
let tunnels = fs.existsSync(DATA_FILE)
  ? JSON.parse(fs.readFileSync(DATA_FILE, "utf8"))
  : {};

function save() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(tunnels, null, 2));
}

function findExistingTunnel(target) {
  return Object.entries(tunnels).find(([_, t]) => t.target === target);
}

app.post("/register", (req, res) => {
  const { target } = req.body;

  if (!target) {
    return res.status(400).json({ message: "target is required" });
  }

  const dup = findExistingTunnel(target);
  if (dup) {
    const [id] = dup;
    return res.json({
      message: "Existing tunnel reused",
      publicUrl: `http://localhost:${PORT}/tunnel/${id}`,
      target
    });
  }

  const id = crypto.randomBytes(4).toString("hex");

  tunnels[id] = { target };
  save();

  res.json({
    message: "Tunnel created",
    publicUrl: `http://localhost:${PORT}/tunnel/${id}`,
    target
  });
});

function proxyRequest(req, res, targetUrl) {
  const client = targetUrl.startsWith("https") ? https : http;

  const urlObj = new URL(targetUrl);

  const options = {
    hostname: urlObj.hostname,
    port: urlObj.port || (urlObj.protocol === "https:" ? 443 : 80),
    path: urlObj.pathname + urlObj.search,
    method: req.method,
    headers: {
      ...req.headers,
      host: urlObj.hostname
    }
  };

  const proxy = client.request(options, proxyRes => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxy.on("error", err => {
    res.status(500).json({ message: "Proxy failed", error: err.message });
  });

  // Write raw body for POST / PUT / PATCH
  if (req.rawBody && req.rawBody.length > 0) {
    proxy.write(req.rawBody);
  }

  proxy.end();
}

app.all("/tunnel/:id", (req, res) => {
  const id = req.params.id;
  const tunnel = tunnels[id];

  if (!tunnel) {
    return res.status(404).json({ message: "Tunnel not found" });
  }

  proxyRequest(req, res, tunnel.target);
});

app.listen(PORT, () => {
  console.log(`Tunnel server running on ${PORT}`);
});
