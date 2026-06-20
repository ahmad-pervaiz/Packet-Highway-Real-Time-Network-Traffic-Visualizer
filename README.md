# Packet-Highway-Real-Time-Network-Traffic-Visualizer
🚦 Packet Highway

Real-time network traffic visualizer that turns live packets into a moving highway of vehicles.

Packet Highway sniffs live traffic off your network interface, classifies every packet by protocol, and animates it as a vehicle on a virtual highway — an HTTPS request drives by as a city bus, a DNS lookup zips past as a motorcycle, a ping shows up as a police car. Click any vehicle to inspect the full packet detail behind it.

Built as a computer networks semester project to make protocol-level traffic intuitive without losing technical accuracy.

Features


Live packet capture from any local network interface
Real-time protocol classification (ARP, ICMP, TCP, UDP, HTTP, HTTPS, QUIC, DNS, SSH)
Animated multi-lane highway — one vehicle per packet
Click-to-inspect panel showing full packet detail (IPs, ports, TTL, flags, etc.)
Live stats dashboard — packets/sec, protocol breakdown, top talkers
Traffic-jam indicator when packet rate spikes
Graceful handling of high-traffic bursts via backend batching



**How packets map to vehicles**__

Protocol                      Vehicle
HTTPS (TCP, port 443)         🚌 City bus
QUIC (UDP, port 443)          🏎️ Sports car
HTTP (TCP, port 80)           🚚 Box truck
DNS (port 53)                 🏍️ Motorcycle
SSH (TCP, port 22)            🚕 TaxiOther 
TCP                           🚗 Sedan
Other UDP                     🚐 Panel van
ICMP (ping)                   🚓 Police car
ARP                           🚲 Bicycle
Everything else                🚙 Hatchback


**Architecture**

Network interface
       │
       ▼
Packet sniffer (Scapy)
       │
       ▼
Protocol classifier  ──► header inspection → vehicle type
       │
       ▼
WebSocket server (FastAPI)  ──► streams packet JSON live
       │
       ▼
Frontend road view (Canvas + JS)  ──► animated cars, click for detail


**Tech stack**

Backend: Python 3.10+, Scapy for packet capture, FastAPI with WebSockets for real-time streaming
Frontend: HTML5 Canvas, vanilla JavaScript, Chart.js for the stats dashboard

**Prerequisites**

Python 3.10 or newer
Administrator / root privileges — raw packet capture requires elevated permissions
Windows only: Npcap must be installed for Scapy to capture packets
A modern browser (Chrome, Firefox, Edge)

**Installation**
**# clone the repo**
git clone https://github.com/<your-username>/packet-highway.git
cd packet-highway

# set up the backend
cd backend
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt



**Running the app**

Start the backend with elevated privileges (required for packet capture):

bash# Linux / macOS
sudo venv/bin/python server.py

# Windows (run terminal as Administrator)
python server.py

Then open frontend/index.html in your browser, select a network interface, and hit Start Capture.


**Project structure**

backend/
  sniffer.py            # packet capture logic
  classifier.py         # protocol → vehicle classification rules
  server.py             # FastAPI app + WebSocket endpoint
  requirements.txt
frontend/
  index.html
  style.css
  road.js                # canvas animation engine
  websocket-client.js
  stats-dashboard.js
README.md


**⚠️ Usage notice**

Only run this tool on networks and devices you own or have explicit permission to monitor. Capturing traffic on networks without authorization may violate local laws and acceptable-use policies.


**Known limitations**


HTTPS vs QUIC detection on port 443 relies on a lightweight header heuristic, not full deep packet inspection
High-traffic bursts are batched for frontend performance, so exact packet-by-packet timing isn't guaranteed under heavy load
Encrypted payloads are not decrypted — classification is header-based only



**Future improvements**


Anomaly detection (e.g. flag ping floods or port scans as "crashes" on the highway)
Packet capture playback from saved .pcap files
Configurable classification rules via a settings panel



**License**

This project is open source under the MIT License.


**Author**

Built by **Ahmad Pervaiz**  as a computer networks semester project.
