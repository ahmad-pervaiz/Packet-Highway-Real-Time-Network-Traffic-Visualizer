"""Packet Highway — Protocol classifier.

Inspects Scapy packet layers and assigns each packet a vehicle type
following the classification rules defined in the project brief.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional


# ---------------------------------------------------------------------------
# QUIC heuristic
# ---------------------------------------------------------------------------

def looks_like_quic(payload: bytes) -> bool:
    """Lightweight check against the first byte of a UDP payload.

    QUIC long-header packets have bit 0x80 set (Form Bit = 1) and also the
    Fixed Bit (0x40) set.  QUIC short-header packets have 0x80 clear but
    0x40 set.  We accept either form as "looks like QUIC".
    """
    if not payload or len(payload) < 1:
        return False
    first = payload[0]
    # Long header: (first & 0xC0) == 0xC0  →  bits 7 and 6 both set
    # Short header: (first & 0xC0) == 0x40  →  bit 7 clear, bit 6 set
    return (first & 0x40) != 0


# ---------------------------------------------------------------------------
# TCP flag helper
# ---------------------------------------------------------------------------

_TCP_FLAG_MAP = [
    (0x02, "SYN"),
    (0x10, "ACK"),
    (0x01, "FIN"),
    (0x04, "RST"),
    (0x08, "PSH"),
    (0x20, "URG"),
]


def _tcp_flag_names(flags: Any) -> list[str]:
    """Return human-readable flag names from a Scapy TCP flags value."""
    names: list[str] = []
    flag_value = int(flags) if flags is not None else 0
    for mask, name in _TCP_FLAG_MAP:
        if flag_value & mask:
            names.append(name)
    return names


# ---------------------------------------------------------------------------
# Classified packet data model
# ---------------------------------------------------------------------------

@dataclass(slots=True)
class ClassifiedPacket:
    """All fields exposed to the frontend when a vehicle is clicked."""

    timestamp: str
    src_mac: Optional[str]
    dst_mac: Optional[str]
    src_ip: Optional[str]
    dst_ip: Optional[str]
    src_port: Optional[int]
    dst_port: Optional[int]
    protocol_name: str
    packet_length: int
    ttl: Optional[int]
    tcp_flags: list[str] = field(default_factory=list)
    icmp_type: Optional[int] = None
    icmp_code: Optional[int] = None
    dns_query_name: Optional[str] = None
    vehicle_type: str = "hatchback"
    classification_reason: str = ""
    lane: str = "general"
    packet_size_bucket: str = "small"
    payload_preview: Optional[str] = None
    summary: str = ""
    raw: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "src_mac": self.src_mac,
            "dst_mac": self.dst_mac,
            "src_ip": self.src_ip,
            "dst_ip": self.dst_ip,
            "src_port": self.src_port,
            "dst_port": self.dst_port,
            "protocol_name": self.protocol_name,
            "packet_length": self.packet_length,
            "ttl": self.ttl,
            "tcp_flags": self.tcp_flags,
            "icmp_type": self.icmp_type,
            "icmp_code": self.icmp_code,
            "dns_query_name": self.dns_query_name,
            "vehicle_type": self.vehicle_type,
            "classification_reason": self.classification_reason,
            "lane": self.lane,
            "packet_size_bucket": self.packet_size_bucket,
            "payload_preview": self.payload_preview,
            "summary": self.summary,
            "raw": self.raw,
        }


# ---------------------------------------------------------------------------
# Classification engine
# ---------------------------------------------------------------------------

def _safe_summary(layer: Any) -> Optional[str]:
    """Return a layer summary string or None."""
    try:
        return layer.summary() if layer else None
    except Exception:
        return None


def classify_packet(packet: Any) -> ClassifiedPacket:
    """Classify a Scapy packet and return a *ClassifiedPacket*.

    Classification rules (evaluated top-down, first match wins):
      ARP (eth.type 0x0806)            → bicycle
      ICMP (ip.proto 1)                → police car
      TCP port 443                     → city bus  (HTTPS)
      TCP port 80                      → box truck (HTTP)
      TCP port 22                      → taxi      (SSH)
      TCP port 53                      → motorcycle (DNS/TCP)
      other TCP                        → sedan
      UDP port 53                      → motorcycle (DNS)
      UDP port 443 + QUIC header       → sports car
      other UDP                        → panel van
      everything else                  → hatchback
    """

    # ── Extract layers ────────────────────────────────────────────────
    eth = packet.getlayer("Ether")
    ip_layer = packet.getlayer("IP")
    ipv6 = packet.getlayer("IPv6")
    tcp = packet.getlayer("TCP")
    udp = packet.getlayer("UDP")
    icmp = packet.getlayer("ICMP")
    arp = packet.getlayer("ARP")
    dns = packet.getlayer("DNS")

    # ── Common fields ─────────────────────────────────────────────────
    timestamp = datetime.fromtimestamp(
        float(packet.time), tz=timezone.utc
    ).isoformat()

    packet_length = len(bytes(packet))
    src_mac = getattr(eth, "src", None)
    dst_mac = getattr(eth, "dst", None)
    src_ip = getattr(ip_layer, "src", None) or getattr(ipv6, "src", None)
    dst_ip = getattr(ip_layer, "dst", None) or getattr(ipv6, "dst", None)

    src_port: Optional[int] = None
    dst_port: Optional[int] = None
    if tcp:
        src_port = int(getattr(tcp, "sport", 0) or 0) or None
        dst_port = int(getattr(tcp, "dport", 0) or 0) or None
    elif udp:
        src_port = int(getattr(udp, "sport", 0) or 0) or None
        dst_port = int(getattr(udp, "dport", 0) or 0) or None

    ttl = getattr(ip_layer, "ttl", None)
    tcp_flags = _tcp_flag_names(getattr(tcp, "flags", 0)) if tcp else []
    icmp_type = int(getattr(icmp, "type", 0)) if icmp else None
    icmp_code = int(getattr(icmp, "code", 0)) if icmp else None

    # DNS query name
    dns_query_name: Optional[str] = None
    if dns is not None and getattr(dns, "qd", None) is not None:
        try:
            raw_name = dns.qd.qname
            if isinstance(raw_name, bytes):
                dns_query_name = raw_name.decode(errors="ignore").rstrip(".")
            else:
                dns_query_name = str(raw_name).rstrip(".")
        except Exception:
            dns_query_name = None

    # Payload preview (first 16 bytes as hex)
    try:
        raw_payload = bytes(packet.payload.payload.payload) if packet.payload and packet.payload.payload else b""
    except Exception:
        raw_payload = b""
    payload_preview = raw_payload[:16].hex() if raw_payload else None

    # ── Classification ────────────────────────────────────────────────
    vehicle_type = "hatchback"
    classification_reason = "No matching Ethernet/IP/transport rule was found."
    protocol_name = "Other"
    lane = "general"

    if arp is not None or (eth is not None and getattr(eth, "type", None) == 0x0806):
        vehicle_type = "bicycle"
        classification_reason = "EtherType 0x0806 — ARP request/reply."
        protocol_name = "ARP"
        lane = "control"

    elif icmp is not None or (ip_layer is not None and getattr(ip_layer, "proto", None) == 1):
        vehicle_type = "police car"
        classification_reason = "IP protocol 1 — ICMP control message."
        protocol_name = "ICMP"
        lane = "priority"

    elif tcp is not None or (ip_layer is not None and getattr(ip_layer, "proto", None) == 6):
        sport = int(getattr(tcp, "sport", 0) or 0)
        dport = int(getattr(tcp, "dport", 0) or 0)
        if sport == 443 or dport == 443:
            vehicle_type = "city bus"
            classification_reason = "TCP port 443 → HTTPS over TCP."
            protocol_name = "HTTPS over TCP"
            lane = "express"
        elif sport == 80 or dport == 80:
            vehicle_type = "box truck"
            classification_reason = "TCP port 80 → HTTP over TCP."
            protocol_name = "HTTP over TCP"
            lane = "delivery"
        elif sport == 22 or dport == 22:
            vehicle_type = "taxi"
            classification_reason = "TCP port 22 → SSH session."
            protocol_name = "SSH over TCP"
            lane = "priority"
        elif sport == 53 or dport == 53:
            vehicle_type = "motorcycle"
            classification_reason = "TCP port 53 → DNS over TCP."
            protocol_name = "DNS over TCP"
            lane = "control"
        else:
            vehicle_type = "sedan"
            classification_reason = f"Generic TCP ({sport}→{dport}), no well-known service port matched."
            protocol_name = "TCP"
            lane = "general"

    elif udp is not None or (ip_layer is not None and getattr(ip_layer, "proto", None) == 17):
        sport = int(getattr(udp, "sport", 0) or 0)
        dport = int(getattr(udp, "dport", 0) or 0)
        if sport == 53 or dport == 53:
            vehicle_type = "motorcycle"
            classification_reason = "UDP port 53 → DNS over UDP."
            protocol_name = "DNS over UDP"
            lane = "control"
        elif (sport == 443 or dport == 443) and looks_like_quic(raw_payload):
            vehicle_type = "sports car"
            classification_reason = "UDP port 443 with QUIC long/short header detected."
            protocol_name = "QUIC"
            lane = "express"
        else:
            vehicle_type = "panel van"
            classification_reason = f"Generic UDP ({sport}→{dport}), not DNS or QUIC."
            protocol_name = "UDP"
            lane = "delivery"

    else:
        if ip_layer is not None:
            protocol_name = f"IP proto {getattr(ip_layer, 'proto', 'unknown')}"

    # ── Summary line ──────────────────────────────────────────────────
    summary_parts = [protocol_name]
    if src_ip or dst_ip:
        summary_parts.append(f"{src_ip or '?'} → {dst_ip or '?'}")
    if src_port or dst_port:
        summary_parts.append(f":{src_port or '?'} → :{dst_port or '?'}")

    # ── Raw layer summaries ───────────────────────────────────────────
    raw = {
        "eth": _safe_summary(eth),
        "ip": _safe_summary(ip_layer),
        "arp": _safe_summary(arp),
        "tcp": _safe_summary(tcp),
        "udp": _safe_summary(udp),
        "icmp": _safe_summary(icmp),
        "dns": _safe_summary(dns),
    }

    # ── Size bucket ───────────────────────────────────────────────────
    if packet_length > 1200:
        size_bucket = "large"
    elif packet_length > 500:
        size_bucket = "medium"
    else:
        size_bucket = "small"

    return ClassifiedPacket(
        timestamp=timestamp,
        src_mac=src_mac,
        dst_mac=dst_mac,
        src_ip=src_ip,
        dst_ip=dst_ip,
        src_port=src_port,
        dst_port=dst_port,
        protocol_name=protocol_name,
        packet_length=packet_length,
        ttl=int(ttl) if ttl is not None else None,
        tcp_flags=tcp_flags,
        icmp_type=icmp_type,
        icmp_code=icmp_code,
        dns_query_name=dns_query_name,
        vehicle_type=vehicle_type,
        classification_reason=classification_reason,
        lane=lane,
        packet_size_bucket=size_bucket,
        payload_preview=payload_preview,
        summary=" | ".join(summary_parts),
        raw=raw,
    )