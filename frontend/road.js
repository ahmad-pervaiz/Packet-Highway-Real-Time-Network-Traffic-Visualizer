/**
 * Packet Highway — Canvas Road Animation Engine
 *
 * Renders a multi-lane highway on an HTML5 Canvas.  Each incoming packet
 * spawns a vehicle whose shape, colour, and speed match its protocol
 * classification.  Click any vehicle to show its full packet detail.
 */

import { getPacketState, setJamIndicator } from "./stats-dashboard.js";

// ─── DOM refs ───────────────────────────────────────────────────────────
const canvas = document.getElementById("roadCanvas");
const ctx = canvas.getContext("2d");

// ─── Vehicles in flight ─────────────────────────────────────────────────
const vehicles = [];
let spawnId = 0;
let liveMode = false;
let lastFrame = performance.now();

// ─── Lane configuration ────────────────────────────────────────────────
// name → { y offset from road top, label, color }
const ROAD_TOP = 50;
const LANE_HEIGHT = 80;
const LANE_COUNT = 5;

const LANE_CONFIG = {
  priority: { index: 0, label: "Priority",  color: "rgba(86,214,255,0.06)"  },
  control:  { index: 1, label: "Control",   color: "rgba(124,255,195,0.05)" },
  express:  { index: 2, label: "Express",   color: "rgba(76,141,255,0.05)"  },
  delivery: { index: 3, label: "Delivery",  color: "rgba(255,180,84,0.05)"  },
  general:  { index: 4, label: "General",   color: "rgba(159,179,200,0.04)" },
};

function laneY(laneName) {
  const cfg = LANE_CONFIG[laneName] || LANE_CONFIG.general;
  return ROAD_TOP + cfg.index * LANE_HEIGHT + LANE_HEIGHT / 2;
}

// ─── Vehicle colour palette ─────────────────────────────────────────────
const PALETTE = {
  bicycle:      { body: "#7cffc3", accent: "#5ad9a2" },
  "police car": { body: "#56d6ff", accent: "#3ab8e0" },
  "city bus":   { body: "#4c8dff", accent: "#3a6fd9" },
  "box truck":  { body: "#ffb454", accent: "#d99640" },
  taxi:         { body: "#ffd166", accent: "#d9b050" },
  motorcycle:   { body: "#ab8cff", accent: "#8a6ee0" },
  sedan:        { body: "#9fb3c8", accent: "#7d96af" },
  "panel van":  { body: "#cdd5df", accent: "#adb6c2" },
  "sports car": { body: "#ff7a59", accent: "#d95e40" },
  hatchback:    { body: "#7a8fa6", accent: "#5e7289" },
};

// ─── Vehicle sizing (scales with packet length) ─────────────────────────

function vehicleWidth(packet) {
  const size = packet.packet_length || 64;
  return Math.min(120, 36 + size / 24);
}

function vehicleSpeed(packet) {
  const size = packet.packet_length || 64;
  // Larger packets → faster vehicles (more data "rushing through")
  return 80 + Math.min(170, size / 5);
}

// ─── Vehicle drawing functions ──────────────────────────────────────────
// Each vehicle type has a distinct visual shape drawn procedurally.

function drawBicycle(x, y, w, colors) {
  const r = 7;
  // Wheels
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x - w/3, y + 2, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(x + w/3, y + 2, r, 0, Math.PI * 2); ctx.stroke();
  // Frame
  ctx.strokeStyle = colors.body;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x - w/3, y + 2);
  ctx.lineTo(x, y - 8);
  ctx.lineTo(x + w/3, y + 2);
  ctx.lineTo(x, y + 2);
  ctx.closePath();
  ctx.stroke();
  // Seat
  ctx.fillStyle = colors.body;
  ctx.fillRect(x - 3, y - 10, 6, 3);
}

function drawMotorcycle(x, y, w, colors) {
  const r = 8;
  ctx.fillStyle = colors.accent;
  ctx.beginPath(); ctx.arc(x - w/3, y + 3, r, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + w/3, y + 3, r, 0, Math.PI * 2); ctx.fill();
  // Body
  ctx.fillStyle = colors.body;
  ctx.beginPath();
  ctx.ellipse(x, y - 2, w/3, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  // Handlebar
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x + w/3 - 2, y - 8); ctx.lineTo(x + w/3 + 4, y - 14); ctx.stroke();
}

function drawSedan(x, y, w, h, colors) {
  // Body
  ctx.fillStyle = colors.body;
  ctx.beginPath();
  ctx.roundRect(x - w/2, y - h/2 + 4, w, h - 4, 6);
  ctx.fill();
  // Roof
  ctx.fillStyle = colors.accent;
  ctx.beginPath();
  ctx.roundRect(x - w/3, y - h/2 - 2, w * 0.66, h/2, [6, 6, 0, 0]);
  ctx.fill();
  // Windshield
  ctx.fillStyle = "rgba(86,214,255,0.25)";
  ctx.fillRect(x + w/4 - 2, y - h/2, 4, h/2 - 2);
  // Wheels
  ctx.fillStyle = "#1a1a2e";
  ctx.beginPath(); ctx.arc(x - w/3 + 4, y + h/2, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + w/3 - 4, y + h/2, 5, 0, Math.PI * 2); ctx.fill();
}

function drawCityBus(x, y, w, h, colors) {
  // Long body
  ctx.fillStyle = colors.body;
  ctx.beginPath();
  ctx.roundRect(x - w/2, y - h/2, w, h, 5);
  ctx.fill();
  // Windows row
  ctx.fillStyle = "rgba(255,255,255,0.20)";
  const winW = 6, winGap = 10;
  for (let wx = x - w/2 + 8; wx < x + w/2 - 8; wx += winGap) {
    ctx.fillRect(wx, y - h/2 + 3, winW, h/2 - 2);
  }
  // Stripe
  ctx.fillStyle = colors.accent;
  ctx.fillRect(x - w/2, y + 2, w, 3);
  // Wheels
  ctx.fillStyle = "#1a1a2e";
  ctx.beginPath(); ctx.arc(x - w/3, y + h/2 + 1, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + w/3, y + h/2 + 1, 5, 0, Math.PI * 2); ctx.fill();
}

function drawBoxTruck(x, y, w, h, colors) {
  // Cargo area (back 60%)
  ctx.fillStyle = colors.body;
  ctx.beginPath();
  ctx.roundRect(x - w/2, y - h/2, w * 0.6, h, [4, 0, 0, 4]);
  ctx.fill();
  // Cab (front 40%)
  ctx.fillStyle = colors.accent;
  ctx.beginPath();
  ctx.roundRect(x - w/2 + w * 0.6, y - h/2 + 4, w * 0.4, h - 4, [0, 5, 5, 0]);
  ctx.fill();
  // Windshield
  ctx.fillStyle = "rgba(86,214,255,0.3)";
  ctx.fillRect(x + w/2 - 8, y - h/2 + 6, 5, h/2 - 2);
  // Wheels
  ctx.fillStyle = "#1a1a2e";
  ctx.beginPath(); ctx.arc(x - w/3, y + h/2 + 1, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + w/4, y + h/2 + 1, 5, 0, Math.PI * 2); ctx.fill();
}

function drawTaxi(x, y, w, h, colors) {
  // Body
  ctx.fillStyle = colors.body;
  ctx.beginPath();
  ctx.roundRect(x - w/2, y - h/2 + 4, w, h - 4, 6);
  ctx.fill();
  // Roof
  ctx.fillStyle = colors.accent;
  ctx.beginPath();
  ctx.roundRect(x - w/3, y - h/2 - 2, w * 0.66, h/2, [6, 6, 0, 0]);
  ctx.fill();
  // Taxi sign on top
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.roundRect(x - 8, y - h/2 - 8, 16, 6, 3);
  ctx.fill();
  // Wheels
  ctx.fillStyle = "#1a1a2e";
  ctx.beginPath(); ctx.arc(x - w/3 + 4, y + h/2, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + w/3 - 4, y + h/2, 5, 0, Math.PI * 2); ctx.fill();
}

function drawPoliceCar(x, y, w, h, colors) {
  // Body
  ctx.fillStyle = colors.body;
  ctx.beginPath();
  ctx.roundRect(x - w/2, y - h/2 + 4, w, h - 4, 6);
  ctx.fill();
  // Roof
  ctx.fillStyle = "#1a3a5c";
  ctx.beginPath();
  ctx.roundRect(x - w/3, y - h/2 - 2, w * 0.66, h/2, [6, 6, 0, 0]);
  ctx.fill();
  // Siren lights (alternate red/blue with animation)
  const flash = Math.sin(performance.now() / 200) > 0;
  ctx.fillStyle = flash ? "#ff4444" : "#4466ff";
  ctx.beginPath(); ctx.arc(x - 6, y - h/2 - 6, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = flash ? "#4466ff" : "#ff4444";
  ctx.beginPath(); ctx.arc(x + 6, y - h/2 - 6, 4, 0, Math.PI * 2); ctx.fill();
  // Glow
  ctx.shadowColor = flash ? "#ff4444" : "#4466ff";
  ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.arc(x, y - h/2 - 6, 2, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  // Wheels
  ctx.fillStyle = "#1a1a2e";
  ctx.beginPath(); ctx.arc(x - w/3 + 4, y + h/2, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + w/3 - 4, y + h/2, 5, 0, Math.PI * 2); ctx.fill();
}

function drawPanelVan(x, y, w, h, colors) {
  // Tall body
  ctx.fillStyle = colors.body;
  const vanH = h + 6;
  ctx.beginPath();
  ctx.roundRect(x - w/2, y - vanH/2, w, vanH, 5);
  ctx.fill();
  // Side panel line
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - w/2 + w * 0.55, y - vanH/2 + 3);
  ctx.lineTo(x - w/2 + w * 0.55, y + vanH/2 - 3);
  ctx.stroke();
  // Windshield
  ctx.fillStyle = "rgba(86,214,255,0.25)";
  ctx.fillRect(x + w/2 - 7, y - vanH/2 + 4, 4, vanH/2);
  // Wheels
  ctx.fillStyle = "#1a1a2e";
  ctx.beginPath(); ctx.arc(x - w/3, y + vanH/2, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + w/3, y + vanH/2, 5, 0, Math.PI * 2); ctx.fill();
}

function drawSportsCar(x, y, w, h, colors) {
  // Low, wide body
  const carH = h - 6;
  ctx.fillStyle = colors.body;
  ctx.beginPath();
  ctx.roundRect(x - w/2, y - carH/2 + 6, w, carH, 8);
  ctx.fill();
  // Sleek roof
  ctx.fillStyle = colors.accent;
  ctx.beginPath();
  ctx.roundRect(x - w/4, y - carH/2, w/2, carH/2 + 2, [8, 8, 0, 0]);
  ctx.fill();
  // Racing stripe
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(x - 2, y - carH/2 + 6, 4, carH);
  // Speed lines behind
  ctx.strokeStyle = "rgba(255,122,89,0.3)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const ly = y - 4 + i * 4;
    ctx.beginPath();
    ctx.moveTo(x - w/2 - 10 - i * 6, ly);
    ctx.lineTo(x - w/2 - 2, ly);
    ctx.stroke();
  }
  // Wheels
  ctx.fillStyle = "#1a1a2e";
  ctx.beginPath(); ctx.arc(x - w/3 + 2, y + carH/2 + 2, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + w/3 - 2, y + carH/2 + 2, 5, 0, Math.PI * 2); ctx.fill();
}

function drawHatchback(x, y, w, h, colors) {
  // Compact body
  ctx.fillStyle = colors.body;
  ctx.beginPath();
  ctx.roundRect(x - w/2, y - h/2 + 4, w, h - 4, 6);
  ctx.fill();
  // Hatch roof (sloped back)
  ctx.fillStyle = colors.accent;
  ctx.beginPath();
  ctx.moveTo(x - w/4, y - h/2 - 1);
  ctx.lineTo(x + w/3, y - h/2 - 1);
  ctx.lineTo(x + w/4, y - h/2 + h/2);
  ctx.lineTo(x - w/4, y - h/2 + h/2);
  ctx.closePath();
  ctx.fill();
  // Wheels
  ctx.fillStyle = "#1a1a2e";
  ctx.beginPath(); ctx.arc(x - w/3 + 4, y + h/2, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + w/3 - 4, y + h/2, 4, 0, Math.PI * 2); ctx.fill();
}

// ─── Vehicle draw dispatcher ────────────────────────────────────────────
const DRAW_FN = {
  bicycle:      (v) => drawBicycle(v.x, v.y, v.w, v.colors),
  motorcycle:   (v) => drawMotorcycle(v.x, v.y, v.w, v.colors),
  "police car": (v) => drawPoliceCar(v.x, v.y, v.w, v.h, v.colors),
  "city bus":   (v) => drawCityBus(v.x, v.y, v.w, v.h, v.colors),
  "box truck":  (v) => drawBoxTruck(v.x, v.y, v.w, v.h, v.colors),
  taxi:         (v) => drawTaxi(v.x, v.y, v.w, v.h, v.colors),
  sedan:        (v) => drawSedan(v.x, v.y, v.w, v.h, v.colors),
  "panel van":  (v) => drawPanelVan(v.x, v.y, v.w, v.h, v.colors),
  "sports car": (v) => drawSportsCar(v.x, v.y, v.w, v.h, v.colors),
  hatchback:    (v) => drawHatchback(v.x, v.y, v.w, v.h, v.colors),
};

function drawVehicle(vehicle) {
  ctx.save();
  const drawFn = DRAW_FN[vehicle.vehicle_type] || DRAW_FN.hatchback;
  drawFn(vehicle);
  // Protocol label above vehicle
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = "600 10px 'Inter', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(vehicle.protocol_name, vehicle.x, vehicle.y - vehicle.h / 2 - 14);
  ctx.restore();
}

// ─── Canvas resize ──────────────────────────────────────────────────────
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.floor(rect.width * dpr);
  const h = Math.floor(rect.width * 0.38 * dpr); // 38% aspect ratio
  canvas.width = w;
  canvas.height = h;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// ─── Road rendering ────────────────────────────────────────────────────
function drawRoad() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);

  // Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, ROAD_TOP);
  sky.addColorStop(0, "#0d1a2e");
  sky.addColorStop(1, "#111b28");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, ROAD_TOP);

  // Road surface
  const road = ctx.createLinearGradient(0, ROAD_TOP, 0, ROAD_TOP + LANE_COUNT * LANE_HEIGHT);
  road.addColorStop(0, "#1a2538");
  road.addColorStop(0.5, "#1e2940");
  road.addColorStop(1, "#1a2538");
  ctx.fillStyle = road;
  ctx.fillRect(0, ROAD_TOP, w, LANE_COUNT * LANE_HEIGHT);

  // Lane fills (subtle colour per lane)
  for (const [, cfg] of Object.entries(LANE_CONFIG)) {
    const ly = ROAD_TOP + cfg.index * LANE_HEIGHT;
    ctx.fillStyle = cfg.color;
    ctx.fillRect(0, ly, w, LANE_HEIGHT);
  }

  // Road edges (solid white lines top & bottom)
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, ROAD_TOP);
  ctx.lineTo(w, ROAD_TOP);
  ctx.moveTo(0, ROAD_TOP + LANE_COUNT * LANE_HEIGHT);
  ctx.lineTo(w, ROAD_TOP + LANE_COUNT * LANE_HEIGHT);
  ctx.stroke();

  // Lane dividers (dashed)
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 2;
  ctx.setLineDash([20, 14]);
  for (let i = 1; i < LANE_COUNT; i++) {
    const ly = ROAD_TOP + i * LANE_HEIGHT;
    ctx.beginPath();
    ctx.moveTo(0, ly);
    ctx.lineTo(w, ly);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Lane labels (left edge)
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.font = "600 10px 'Inter', sans-serif";
  ctx.textAlign = "left";
  for (const [, cfg] of Object.entries(LANE_CONFIG)) {
    const ly = ROAD_TOP + cfg.index * LANE_HEIGHT + LANE_HEIGHT / 2 + 4;
    ctx.fillText(cfg.label.toUpperCase(), 10, ly);
  }

  // Direction arrows
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.font = "24px sans-serif";
  ctx.textAlign = "center";
  for (let i = 0; i < LANE_COUNT; i++) {
    const ly = ROAD_TOP + i * LANE_HEIGHT + LANE_HEIGHT / 2 + 8;
    for (let ax = 120; ax < w; ax += 200) {
      ctx.fillText("→", ax, ly);
    }
  }

  // Below-road area
  const belowY = ROAD_TOP + LANE_COUNT * LANE_HEIGHT;
  const below = ctx.createLinearGradient(0, belowY, 0, h);
  below.addColorStop(0, "#111b28");
  below.addColorStop(1, "#0a1018");
  ctx.fillStyle = below;
  ctx.fillRect(0, belowY, w, h - belowY);
}

// ─── Hit testing ────────────────────────────────────────────────────────
function hitTest(px, py) {
  // Search in reverse so topmost vehicle (last drawn) is found first
  for (let i = vehicles.length - 1; i >= 0; i--) {
    const v = vehicles[i];
    const hw = v.w / 2 + 4;
    const hh = v.h / 2 + 8;
    if (px >= v.x - hw && px <= v.x + hw && py >= v.y - hh && py <= v.y + hh) {
      return v;
    }
  }
  return null;
}

// ─── Detail panel ───────────────────────────────────────────────────────
function showDetail(packet) {
  const fields = document.getElementById("packetFields");
  const placeholder = document.getElementById("detailPlaceholder");
  if (placeholder) placeholder.style.display = "none";

  const rows = [
    ["Timestamp",      packet.timestamp],
    ["Source MAC",      packet.src_mac],
    ["Dest MAC",        packet.dst_mac],
    ["Source IP",       packet.src_ip],
    ["Dest IP",         packet.dst_ip],
    ["Source Port",     packet.src_port],
    ["Dest Port",       packet.dst_port],
    ["Protocol",        packet.protocol_name],
    ["Length",          packet.packet_length != null ? `${packet.packet_length} bytes` : null],
    ["TTL",             packet.ttl],
    ["TCP Flags",       (packet.tcp_flags || []).join(", ") || null],
    ["ICMP Type/Code",  packet.icmp_type != null ? `${packet.icmp_type} / ${packet.icmp_code}` : null],
    ["DNS Query",       packet.dns_query_name],
    ["Vehicle",         packet.vehicle_type],
    ["Reason",          packet.classification_reason],
    ["Summary",         packet.summary],
  ];

  fields.innerHTML = rows
    .filter(([, val]) => val != null && val !== "")
    .map(([label, value], i) =>
      `<div class="field" style="animation-delay: ${i * 30}ms">
         <dt>${label}</dt><dd>${value}</dd>
       </div>`
    )
    .join("");
}

canvas.addEventListener("click", (event) => {
  const rect = canvas.getBoundingClientRect();
  const px = (event.clientX - rect.left) * (canvas.clientWidth / rect.width);
  const py = (event.clientY - rect.top) * (canvas.clientHeight / rect.height);
  const hit = hitTest(px, py);
  if (hit) {
    showDetail(hit.packet);
    // Highlight effect — brief glow
    hit._highlight = 12;
  }
});

// Cursor change on hover
canvas.addEventListener("mousemove", (event) => {
  const rect = canvas.getBoundingClientRect();
  const px = (event.clientX - rect.left) * (canvas.clientWidth / rect.width);
  const py = (event.clientY - rect.top) * (canvas.clientHeight / rect.height);
  canvas.style.cursor = hitTest(px, py) ? "pointer" : "crosshair";
});

// ─── Spawn vehicle ──────────────────────────────────────────────────────
export function addPacketsToRoad(packet) {
  const colors = PALETTE[packet.vehicle_type] || PALETTE.hatchback;
  const w = vehicleWidth(packet);
  const h = 24;
  const vehicle = {
    id: `v-${++spawnId}`,
    packet,
    vehicle_type: packet.vehicle_type,
    protocol_name: packet.protocol_name,
    lane: packet.lane,
    x: -w,
    y: laneY(packet.lane) + (Math.random() - 0.5) * 16, // slight lane jitter
    w,
    h,
    speed: vehicleSpeed(packet),
    colors,
    _highlight: 0,
  };
  vehicles.push(vehicle);

  // Cap max vehicles to prevent memory issues
  if (vehicles.length > 200) {
    vehicles.splice(0, vehicles.length - 200);
  }
}

export function setLiveMode(value) {
  liveMode = value;
}

// ─── Build legend ───────────────────────────────────────────────────────
function buildLegend() {
  const legend = document.getElementById("vehicleLegend");
  if (!legend) return;

  const items = [
    ["bicycle",      "ARP"],
    ["police car",   "ICMP"],
    ["city bus",     "HTTPS"],
    ["box truck",    "HTTP"],
    ["taxi",         "SSH"],
    ["motorcycle",   "DNS"],
    ["sports car",   "QUIC"],
    ["sedan",        "TCP"],
    ["panel van",    "UDP"],
    ["hatchback",    "Other"],
  ];

  legend.innerHTML = items.map(([type, label]) => {
    const c = PALETTE[type] || PALETTE.hatchback;
    return `<span class="legend-item">
      <span class="legend-dot" style="background:${c.body}"></span>
      ${label} = ${type}
    </span>`;
  }).join("");
}
buildLegend();

// ─── Animation loop ─────────────────────────────────────────────────────
function step(delta) {
  const w = canvas.clientWidth;

  // Jam detection
  const pps = getPacketState().packetsThisSecond;
  setJamIndicator(pps > 30);

  // Move vehicles
  const speedScale = pps > 30 ? 0.4 : 1; // slow down during jam
  for (const v of vehicles) {
    v.x += (v.speed * speedScale * delta) / 1000;
    if (v._highlight > 0) v._highlight -= 1;
  }

  // Remove off-screen vehicles
  for (let i = vehicles.length - 1; i >= 0; i--) {
    if (vehicles[i].x - vehicles[i].w > w + 60) {
      vehicles.splice(i, 1);
    }
  }

  // Draw
  drawRoad();
  for (const v of vehicles) {
    // Highlight glow when recently clicked
    if (v._highlight > 0) {
      ctx.save();
      ctx.shadowColor = "rgba(86,214,255,0.6)";
      ctx.shadowBlur = 20;
      drawVehicle(v);
      ctx.restore();
    } else {
      drawVehicle(v);
    }
  }
}

// Demo vehicles when not live
let demoTimer = 0;
const DEMO_TYPES = [
  { vehicle_type: "city bus", protocol_name: "HTTPS", lane: "express", packet_length: 1200 },
  { vehicle_type: "sedan", protocol_name: "TCP", lane: "general", packet_length: 400 },
  { vehicle_type: "motorcycle", protocol_name: "DNS", lane: "control", packet_length: 80 },
  { vehicle_type: "police car", protocol_name: "ICMP", lane: "priority", packet_length: 64 },
  { vehicle_type: "sports car", protocol_name: "QUIC", lane: "express", packet_length: 1400 },
  { vehicle_type: "box truck", protocol_name: "HTTP", lane: "delivery", packet_length: 800 },
  { vehicle_type: "taxi", protocol_name: "SSH", lane: "priority", packet_length: 200 },
  { vehicle_type: "bicycle", protocol_name: "ARP", lane: "control", packet_length: 42 },
  { vehicle_type: "panel van", protocol_name: "UDP", lane: "delivery", packet_length: 500 },
  { vehicle_type: "hatchback", protocol_name: "Other", lane: "general", packet_length: 300 },
];

function animate(now) {
  const delta = Math.min(now - lastFrame, 50); // cap delta to avoid huge jumps
  lastFrame = now;

  step(delta);

  // Spawn demo traffic when idle
  if (!liveMode) {
    demoTimer += delta;
    if (demoTimer > 800 && vehicles.length < 15) {
      demoTimer = 0;
      const demo = DEMO_TYPES[Math.floor(Math.random() * DEMO_TYPES.length)];
      addPacketsToRoad({
        ...demo,
        timestamp: new Date().toISOString(),
        summary: "Demo traffic",
        classification_reason: "Demo mode — start capture to see real packets",
      });
    }
  }

  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);
