// server.js
import { 
    WebSocketServer 
} from "ws";

import http from "http";

const PORT = process.env.PORT || 8080;
const MIN = 1;
const MAX = 80;

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function newDeck() {
  const deck = Array.from({ length: MAX - MIN + 1 }, (_, i) => MIN + i);
  return shuffle(deck);
}

// ---- game state (server is source of truth)
let deck = newDeck();
let index = 0;        // 0..80
let current = null;   // number | null

function getDrawn() {
  return deck.slice(0, index);
}

function getState() {
  return {
    type: "state",
    index,
    current,
    drawn: getDrawn(),
    remaining: deck.length - index,
  };
}

function applyAction(action) {
  if (action === "next") {
    if (index >= deck.length) return; // already finished
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

const server = http.createServer();
const wss = new WebSocketServer({ server });

// （授業用の簡易ホスト制御）最初に接続した人だけ操作OK
let hostClient = null;

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(msg);
  }
}

wss.on("connection", (ws) => {
  if (!hostClient) hostClient = ws;

  // 接続直後に現状を送る
  ws.send(JSON.stringify({ ...getState(), isHost: ws === hostClient }));

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (msg.type === "cmd") {
      // ホスト以外は操作禁止
      if (ws !== hostClient) return;

      const action = msg.action;
      if (!["next", "prev", "reset"].includes(action)) return;

      applyAction(action);
      broadcast(getState());
    }
  });

  ws.on("close", () => {
    if (ws === hostClient) {
      // ホストが落ちたら、次に接続している人をホストにする
      hostClient = null;
      for (const client of wss.clients) {
        if (client.readyState === 1) {
          hostClient = client;
          break;
        }
      }
      // ホスト再通知（全員）
      for (const client of wss.clients) {
        if (client.readyState === 1) {
          client.send(JSON.stringify({ ...getState(), isHost: client === hostClient }));
        }
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`WebSocket server running on ws://localhost:${PORT}`);
});
