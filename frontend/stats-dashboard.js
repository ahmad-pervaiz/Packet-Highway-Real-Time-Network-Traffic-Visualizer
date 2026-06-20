/**
 * Packet Highway — Stats Dashboard
 *
 * Tracks packets-per-second, total count, protocol distribution (Chart.js
 * doughnut), and top source/destination IPs.  Exports helpers consumed by
 * road.js and websocket-client.js.
 */

// ─── State ──────────────────────────────────────────────────────────────
const packetState = {
  totalPackets: 0,
  packetsThisSecond: 0,
  protocolCounts: new Map(),
  sourceCounts: new Map(),
  destinationCounts: new Map(),
};

// ─── Protocol colour map (matches vehicle palette) ──────────────────────
const protocolColors = {
  ARP:              "#7cffc3",
  ICMP:             "#56d6ff",
  "HTTPS over TCP": "#4c8dff",
  "HTTP over TCP":  "#ffb454",
  "SSH over TCP":   "#ffd166",
  "DNS over TCP":   "#ab8cff",
  "DNS over UDP":   "#ab8cff",
  QUIC:             "#ff7a59",
  TCP:              "#9fb3c8",
  UDP:              "#cdd5df",
  Other:            "#5a7a9a",
};

// ─── Chart.js doughnut ──────────────────────────────────────────────────
const protocolCtx = document.getElementById("protocolChart");
let protocolChart = null;

function ensureChart() {
  if (!window.Chart || protocolChart) return;
  protocolChart = new Chart(protocolCtx, {
    type: "doughnut",
    data: {
      labels: [],
      datasets: [{
        data: [],
        backgroundColor: [],
        borderWidth: 0,
        hoverBorderWidth: 2,
        hoverBorderColor: "rgba(255,255,255,0.4)",
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: "70%",
      animation: { duration: 400, easing: "easeOutQuart" },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#8baac8",
            font: { family: "'Inter', sans-serif", size: 11 },
            padding: 12,
            usePointStyle: true,
            pointStyleWidth: 10,
          },
        },
        tooltip: {
          backgroundColor: "rgba(10, 20, 38, 0.92)",
          titleColor: "#e8f0fb",
          bodyColor: "#8baac8",
          borderColor: "rgba(100, 180, 255, 0.18)",
          borderWidth: 1,
          cornerRadius: 10,
          padding: 12,
        },
      },
    },
  });
}

// ─── DOM helpers ────────────────────────────────────────────────────────
function setList(targetId, items) {
  const node = document.getElementById(targetId);
  if (!node) return;
  if (!items.length) {
    node.innerHTML = '<li class="muted">Waiting for traffic…</li>';
    return;
  }
  node.innerHTML = items
    .map(([label, count]) =>
      `<li><span>${label}</span><strong>${count}</strong></li>`
    )
    .join("");
}

function updateChart() {
  ensureChart();
  if (!protocolChart) return;

  const entries = [...packetState.protocolCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  protocolChart.data.labels = entries.map(([l]) => l);
  protocolChart.data.datasets[0].data = entries.map(([, c]) => c);
  protocolChart.data.datasets[0].backgroundColor = entries.map(
    ([l]) => protocolColors[l] || protocolColors.Other
  );
  protocolChart.update("none"); // skip animation for perf
}

// ─── Core stats updater ─────────────────────────────────────────────────
function updateStats(packet) {
  packetState.totalPackets += 1;
  packetState.packetsThisSecond += 1;

  const proto = packet.protocol_name || "Other";
  packetState.protocolCounts.set(
    proto,
    (packetState.protocolCounts.get(proto) || 0) + 1
  );

  if (packet.src_ip) {
    packetState.sourceCounts.set(
      packet.src_ip,
      (packetState.sourceCounts.get(packet.src_ip) || 0) + 1
    );
  }
  if (packet.dst_ip) {
    packetState.destinationCounts.set(
      packet.dst_ip,
      (packetState.destinationCounts.get(packet.dst_ip) || 0) + 1
    );
  }
}

// Throttled DOM update (every 250ms instead of per-packet)
let _domDirty = false;

function flushDom() {
  if (!_domDirty) return;
  _domDirty = false;

  document.getElementById("totalPackets").textContent =
    packetState.totalPackets.toLocaleString();
  document.getElementById("ppsValue").textContent =
    packetState.packetsThisSecond.toString();

  setList(
    "topSources",
    [...packetState.sourceCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
  );
  setList(
    "topDestinations",
    [...packetState.destinationCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
  );

  updateChart();
}

setInterval(flushDom, 250);

// Reset packets/sec counter every second
setInterval(() => {
  packetState.packetsThisSecond = 0;
  document.getElementById("ppsValue").textContent = "0";
}, 1000);

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Process a batch of packets from the WebSocket.
 * @param {Object[]} packets — array of classified packet dicts
 * @param {Function} onPacket — called once per packet (road.addPacketsToRoad)
 */
export function consumePackets(packets, onPacket) {
  for (const pkt of packets) {
    updateStats(pkt);
    onPacket(pkt);
  }
  _domDirty = true;
}

/** Update the jam indicator widget. */
export function setJamIndicator(active) {
  const node = document.getElementById("jamIndicator");
  if (!node) return;
  if (active) {
    node.className = "jam-indicator jammed";
    node.innerHTML = '<span class="jam-icon">🚨</span> Traffic jam detected!';
  } else {
    node.className = "jam-indicator calm";
    node.innerHTML = '<span class="jam-icon">🚗</span> Traffic calm';
  }
}

/** Update the status pill. */
export function setStatus(live) {
  const node = document.getElementById("statusPill");
  if (!node) return;
  if (live) {
    node.className = "status-pill live";
    node.innerHTML = '<span class="status-dot"></span>Live Capture';
  } else {
    node.className = "status-pill idle";
    node.innerHTML = '<span class="status-dot"></span>Idle';
  }
}

/** Read-only access to the state (used by road.js for jam check). */
export function getPacketState() {
  return packetState;
}
