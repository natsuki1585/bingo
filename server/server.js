// server/server.js  （Node 18+ 推奨）
const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 8080;

// ---- bingo state
const MIN = 1, MAX = 80;

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function newDeck() {
  return shuffle(Array.from({ length: MAX - MIN + 1 }, (_, i) => MIN + i));
}

let deck = newDeck();
let index = 0;
let current = null;

function getState(extra = {}) {
  return {
    type: "state",
    index,
    current,
    drawn: deck.slice(0, index),
    remaining: deck.length - index,
    ...extra,
  };
}
function applyAction(action) {
  if (action === "next") {
    if (index >= deck.length) return;
    index += 1;
    current = deck[index - 1];
  } else if (action === "prev") {
    if (index <= 0) return;
    index -= 1;
    current = index === 0 ? null : deck[index - 1];
  } else if (action === "reset") {
    deck = newDeck();
    index = 0;
    current = null;
  }
}

// ---- static hosting (serve ../client)
const clientDir = path.join(__dirname, "..", "client");

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
  })[ext] || "application/octet-stream";
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const safePath = urlPath === "/" ? "/index.html" : urlPath;

  const filePath = path.join(clientDir, safePath);
  if (!filePath.startsWith(clientDir)) {
    res.writeHead(403); res.end("Forbidden"); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404); res.end("Not found"); return;
    }
    res.writeHead(200, { "Content-Type": contentType(filePath) });
    res.end(data);
  });
});

// ---- websocket
const wss = new WebSocketServer({ server });

let hostClient = null;

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const c of wss.clients) {
    if (c.readyState === 1) c.send(msg);
  }
}

wss.on("connection", (ws) => {
  if (!hostClient) hostClient = ws;

  ws.send(JSON.stringify(getState({ isHost: ws === hostClient })));

  ws.on("message", (buf) => {
    let msg;
    try { msg = JSON.parse(buf.toString()); } catch { return; }
    if (msg.type !== "cmd") return;
    if (ws !== hostClient) return; // host only

    const action = msg.action;
    if (!["next", "prev", "reset"].includes(action)) return;

    applyAction(action);
    broadcast(getState());
  });

  ws.on("close", () => {
    if (ws !== hostClient) return;

    hostClient = null;
    for (const c of wss.clients) {
      if (c.readyState === 1) { hostClient = c; break; }
    }
    // 通知（全員）
    for (const c of wss.clients) {
      if (c.readyState === 1) c.send(JSON.stringify(getState({ isHost: c === hostClient })));
    }
  });
});

server.listen(PORT, () => {
  console.log(`Open http://localhost:${PORT}`);
});
