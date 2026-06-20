/**
 * Packet Highway — WebSocket Client
 *
 * Manages the WebSocket connection to /ws, handles graceful reconnect
 * with exponential back-off, and dispatches incoming packet batches to
 * the stats dashboard and road animation.
 */

import { consumePackets, setStatus } from "./stats-dashboard.js";
import { addPacketsToRoad, setLiveMode } from "./road.js";

// ─── Connection state ───────────────────────────────────────────────────
const ws = {
  socket: null,
  reconnectTimer: null,
  attempts: 0,
  manualClose: false,
};

function wsUrl() {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${location.host}/ws`;
}

// ─── Connect / reconnect ───────────────────────────────────────────────
function connect() {
  if (ws.manualClose) return;
  clearTimeout(ws.reconnectTimer);

  const socket = new WebSocket(wsUrl());
  ws.socket = socket;

  socket.addEventListener("open", () => {
    console.log("[PacketHighway] WebSocket connected");
    ws.attempts = 0;
    setStatus(true);
    setLiveMode(true);
  });

  socket.addEventListener("message", (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "packet_batch" && Array.isArray(msg.packets)) {
        consumePackets(msg.packets, addPacketsToRoad);
      }
    } catch (err) {
      console.warn("[PacketHighway] Bad WS message:", err);
    }
  });

  socket.addEventListener("close", () => {
    console.log("[PacketHighway] WebSocket closed");
    setStatus(false);
    setLiveMode(false);
    if (!ws.manualClose) {
      // Exponential backoff: 500ms, 1s, 2s, 4s, 5s (capped)
      const delay = Math.min(5000, 500 * Math.pow(2, ws.attempts));
      ws.attempts += 1;
      console.log(`[PacketHighway] Reconnecting in ${delay}ms (attempt ${ws.attempts})`);
      ws.reconnectTimer = setTimeout(connect, delay);
    }
  });

  socket.addEventListener("error", () => {
    // Error events are always followed by close events — just let close handle it
    socket.close();
  });
}

// ─── Public API ─────────────────────────────────────────────────────────

export function startSocket() {
  ws.manualClose = false;
  ws.attempts = 0;
  connect();
}

export function stopSocket() {
  ws.manualClose = true;
  clearTimeout(ws.reconnectTimer);
  if (ws.socket) {
    ws.socket.close();
    ws.socket = null;
  }
  setStatus(false);
  setLiveMode(false);
}
