# Packet Highway 🛣️

**Real-time network traffic visualizer** — packets become vehicles, protocols become lanes, and every click reveals full capture detail.

![Built with](https://img.shields.io/badge/Built_with-Python_|_Scapy_|_FastAPI_|_Canvas-blue)

## What It Does

Packet Highway captures live network packets from your machine's network interface, classifies each one by protocol, and streams the results to an animated HTML5 Canvas highway in the browser.

| Protocol        | Vehicle     | Lane     |
|----------------|-------------|----------|
| ARP            | 🚲 Bicycle   | Control  |
| ICMP           | 🚓 Police Car | Priority |
| HTTPS (TCP/443)| 🚌 City Bus  | Express  |
| HTTP (TCP/80)  | 🚚 Box Truck | Delivery |
| SSH (TCP/22)   | 🚕 Taxi      | Priority |
| DNS (TCP/UDP 53)| 🏍 Motorcycle | Control |
| QUIC (UDP/443) | 🏎 Sports Car | Express  |
| Other TCP      | 🚗 Sedan     | General  |
| Other UDP      | 🚐 Panel Van | Delivery |
| Everything else| 🚙 Hatchback | General  |

## Project Layout

```
backend/
  classifier.py      # Protocol → vehicle classification engine
  sniffer.py          # Scapy-based packet capture with batched output
  server.py           # FastAPI app + WebSocket streaming
  requirements.txt    # Python dependencies
frontend/
  index.html          # Main page with glassmorphism UI
  style.css           # Premium dark theme design system
  road.js             # Canvas highway animation engine
  websocket-client.js # WebSocket with exponential backoff reconnect
  stats-dashboard.js  # Live stats, Chart.js doughnut, top IPs
  main.js             # Application controller (start/stop/interfaces)
README.md
```

## Setup

### Prerequisites

- **Python 3.10+**
- **Npcap** (Windows) — download from [npcap.com](https://npcap.com/#download)
- **root/sudo** (Linux/macOS) or **Administrator** (Windows)

### Install

```bash
# Create a virtual environment (recommended)
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Linux/macOS

# Install dependencies
pip install -r backend/requirements.txt
```

### Run

```bash
# Start the server (run as Administrator / sudo)
python backend/server.py

# Or specify an interface to start capturing immediately:
python backend/server.py --interface "Wi-Fi"
```

Then open **http://127.0.0.1:8000** in your browser.

### CLI-only sniffer (no web UI)

```bash
python backend/sniffer.py --interface "Wi-Fi"
```

## How to Use

1. Open the browser to `http://127.0.0.1:8000`
2. Select your network interface from the dropdown
3. Click **Start Sniffing** to begin packet capture
4. Watch vehicles appear on the highway — each representing a captured packet
5. **Click any vehicle** to inspect its full packet detail (IP, ports, flags, DNS query, etc.)
6. View live statistics: packets/sec, protocol distribution chart, top IPs
7. Click **Stop** to pause capture

## Features

- **10 distinct vehicle shapes** procedurally drawn on Canvas — police car with flashing sirens, city bus with windows, sports car with speed lines, etc.
- **5 named lanes** (Priority, Control, Express, Delivery, General) with colour-coded backgrounds
- **Vehicle speed scales with packet size** — larger packets travel faster
- **Traffic jam detection** — visual indicator + vehicles slow down during high-rate bursts
- **Click-to-inspect detail panel** — shows timestamp, MAC addresses, IPs, ports, protocol, TTL, TCP flags, ICMP type/code, DNS query name, vehicle type, and classification reason
- **Live stats dashboard** — Chart.js doughnut for protocol distribution, top 5 source and destination IPs
- **Graceful WebSocket reconnect** with exponential backoff
- **Batch/throttle** — backend flushes every 100ms, max 50 packets/batch
- **Demo mode** — animated vehicles appear when not capturing, so the UI is always alive
- **Clear privilege error messages** — no silent crashes
- **Glassmorphism UI** with gradient accents, Inter font, micro-animations

## Privileges & Legal

⚠️ **Only capture traffic on networks/devices you own or are authorized to monitor.**

Packet sniffing requires elevated OS privileges:
- **Linux/macOS**: `sudo python backend/server.py`
- **Windows**: Run your terminal as Administrator, and install [Npcap](https://npcap.com/#download)

If privileges are insufficient, the app returns a clear error message instead of crashing.
