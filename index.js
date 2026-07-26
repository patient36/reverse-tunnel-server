import express from "express";
import fs from "fs";
import crypto from "crypto";
import path from "path";
import { createProxyMiddleware } from "http-proxy-middleware";

const app = express();

const PORT = 8000;
const DATA_FILE = "./tunnels.json";

let tunnels = fs.existsSync(DATA_FILE)
  ? JSON.parse(fs.readFileSync(DATA_FILE, "utf8"))
  : {};

function save() {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(tunnels, null, 2)
  );
}

function findExistingTunnel(target) {
  return Object.entries(tunnels)
    .find(([_, tunnel]) => tunnel.target === target);
}


// Dashboard/static files
app.use(express.static(path.join(process.cwd(), "public")));


// Register tunnel
app.post("/register", express.json(), (req, res) => {
  const { target } = req.body;

  if (!target) {
    return res.status(400).json({
      message: "target is required",
    });
  }

  const existing = findExistingTunnel(target);

  if (existing) {
    const [id] = existing;

    return res.json({
      message: "Existing tunnel reused",
      publicUrl: `http://localhost:${PORT}/tunnel/${id}`,
      target,
    });
  }


  const id = crypto
    .randomBytes(4)
    .toString("hex");


  tunnels[id] = {
    target,
    createdAt: new Date().toISOString(),
  };

  save();


  res.json({
    message: "Tunnel created",
    publicUrl: `http://localhost:${PORT}/tunnel/${id}`,
    target,
  });
});


// List tunnels
app.get("/tunnels", (req, res) => {
  res.json(tunnels);
});


// Delete tunnel
app.delete("/tunnels/:id", (req, res) => {
  const { id } = req.params;

  delete tunnels[id];

  save();

  res.json({
    message: "Tunnel deleted",
  });
});


// Update tunnel
app.put("/tunnels/:id", express.json(), (req, res) => {
  const { id } = req.params;
  const { target } = req.body;

  if (!tunnels[id]) {
    return res.status(404).json({
      message: "Tunnel not found",
    });
  }


  tunnels[id].target = target;

  save();


  res.json({
    message: "Tunnel updated",
    tunnel: tunnels[id],
  });
});



// Dynamic proxy
app.use("/tunnel/:id", (req, res, next) => {

  const { id } = req.params;

  const tunnel = tunnels[id];


  if (!tunnel) {
    return res.status(404).json({
      message: "Tunnel not found",
    });
  }


  return createProxyMiddleware({

    target: tunnel.target,

    changeOrigin: true,

    pathRewrite: {
      [`^/tunnel/${id}`]: "",
    },


    // preserve webhook bodies
    on: {
      error(err, req, res) {
        res.status(500).json({
          message: "Proxy failed",
          error: err.message,
        });
      },
    },

  })(req, res, next);

});



app.listen(PORT, () => {
  console.log(
    `Tunnel server running on http://localhost:${PORT}`
  );
});