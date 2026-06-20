/**
 * Packet Highway — Main Application Controller
 *
 * Wires up the control bar (interface select, start/stop buttons) to
 * the backend REST API and the WebSocket client.  Does NOT auto-start
 * capture — the user must explicitly click "Start Sniffing".
 */

import { startSocket, stopSocket } from "./websocket-client.js";

// ─── DOM refs ───────────────────────────────────────────────────────────
const interfaceSelect = document.getElementById("interfaceSelect");
const refreshBtn      = document.getElementById("refreshInterfaces");
const startBtn        = document.getElementById("startCapture");
const stopBtn         = document.getElementById("stopCapture");
const errorBanner     = document.getElementById("captureError");

// ─── Error display ──────────────────────────────────────────────────────
function showError(message) {
  errorBanner.textContent = message;
  errorBanner.classList.add("visible");
}

function clearError() {
  errorBanner.textContent = "";
  errorBanner.classList.remove("visible");
}

// ─── Button state management ────────────────────────────────────────────
function setCapturing(active) {
  startBtn.disabled = active;
  stopBtn.disabled = !active;
  interfaceSelect.disabled = active;
  refreshBtn.disabled = active;
}

// ─── Load interfaces ────────────────────────────────────────────────────
async function loadInterfaces() {
  clearError();
  try {
    const res = await fetch("/api/interfaces");
    const data = await res.json();
    interfaceSelect.innerHTML = "";

    const interfaces = data.interfaces || [];
    if (interfaces.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No interfaces found";
      interfaceSelect.appendChild(opt);
      return;
    }

    for (const name of interfaces) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      interfaceSelect.appendChild(opt);
    }
  } catch (err) {
    showError(`Failed to load interfaces: ${err.message}`);
  }
}

// ─── Start capture ──────────────────────────────────────────────────────
async function startCapture() {
  clearError();
  const iface = interfaceSelect.value;
  if (!iface) {
    showError("Select a network interface before starting capture.");
    return;
  }

  try {
    const res = await fetch("/api/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interface: iface }),
    });
    const data = await res.json();

    if (!res.ok || !data.ok) {
      showError(data.error || data.detail || "Unable to start packet capture.");
      return;
    }

    setCapturing(true);
    startSocket();
  } catch (err) {
    showError(`Capture start failed: ${err.message}`);
  }
}

// ─── Stop capture ───────────────────────────────────────────────────────
async function stopCapture() {
  clearError();
  try {
    await fetch("/api/stop", { method: "POST" });
  } catch (err) {
    console.warn("Stop request failed:", err);
  }
  stopSocket();
  setCapturing(false);
}

// ─── Event listeners ────────────────────────────────────────────────────
refreshBtn.addEventListener("click", loadInterfaces);
startBtn.addEventListener("click", startCapture);
stopBtn.addEventListener("click", stopCapture);

// Global error handler
window.addEventListener("error", (event) => {
  console.error("Uncaught error:", event.error);
});

// ─── Initialise ─────────────────────────────────────────────────────────
setCapturing(false);
loadInterfaces().catch((err) => showError(err.message));