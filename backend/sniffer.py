"""Packet Highway — Sniffer module.

Provides *PacketSniffer*, which wraps Scapy's AsyncSniffer to capture live
traffic, classify each packet, and feed classified batches to a callback at
a throttled rate (default: flush every 100 ms, max 50 packets/batch).
"""

from __future__ import annotations

import argparse
import json
import threading
import time
from collections import deque
from dataclasses import asdict, dataclass
from typing import Any, Callable, Optional

# --------------------------------------------------------------------------
# Scapy import with a clear error if missing
# --------------------------------------------------------------------------
try:
    from scapy.all import AsyncSniffer, get_if_list  # type: ignore[import-untyped]
    from scapy.error import Scapy_Exception  # type: ignore[import-untyped]
except ImportError as _exc:
    raise SystemExit(
        "Scapy is not installed.  Run:  pip install scapy\n"
        "On Windows you also need Npcap: https://npcap.com/#download"
    ) from _exc

from classifier import ClassifiedPacket, classify_packet

# --------------------------------------------------------------------------
# Type alias for the batch handler callback
# --------------------------------------------------------------------------
BatchHandler = Callable[[list[dict[str, Any]]], None]


# --------------------------------------------------------------------------
# Custom exception
# --------------------------------------------------------------------------
class PrivilegeError(RuntimeError):
    """Raised when packet capture fails due to missing OS privileges."""
    pass


# --------------------------------------------------------------------------
# Sniffer status data class
# --------------------------------------------------------------------------
@dataclass(slots=True)
class SnifferStatus:
    running: bool = False
    interface: Optional[str] = None
    packet_count: int = 0
    last_error: Optional[str] = None


# --------------------------------------------------------------------------
# Main sniffer class
# --------------------------------------------------------------------------
class PacketSniffer:
    """Thread-safe packet sniffer with batched output.

    Parameters
    ----------
    batch_handler : callable
        Called with ``list[dict]`` every *batch_interval* seconds (or when
        *max_batch_size* packets have accumulated, whichever comes first).
    batch_interval : float
        Seconds between automatic flushes (default 0.1 → 10 Hz).
    max_batch_size : int
        Maximum packets per batch (default 50).
    """

    def __init__(
        self,
        batch_handler: BatchHandler,
        batch_interval: float = 0.1,
        max_batch_size: int = 50,
    ) -> None:
        self._batch_handler = batch_handler
        self._batch_interval = batch_interval
        self._max_batch_size = max_batch_size

        self._sniffer: Optional[AsyncSniffer] = None
        self._buffer: deque[dict[str, Any]] = deque()
        self._buffer_lock = threading.Lock()
        self._stop_event = threading.Event()
        self._flush_thread: Optional[threading.Thread] = None
        self.status = SnifferStatus()

    # -- public API --------------------------------------------------------

    @staticmethod
    def list_interfaces() -> list[str]:
        """Return names of all available capture interfaces."""
        return list(get_if_list())

    def start(self, interface: str) -> None:
        """Begin capturing on *interface*.

        Raises
        ------
        RuntimeError
            If the sniffer is already running.
        PrivilegeError
            If capture fails due to OS privilege issues.
        """
        if self._sniffer is not None and self.status.running:
            raise RuntimeError("Sniffer is already running.")

        self._stop_event.clear()
        self._buffer.clear()
        self.status = SnifferStatus(
            running=True,
            interface=interface,
            packet_count=0,
            last_error=None,
        )

        def _packet_callback(raw_packet: Any) -> None:
            try:
                classified = classify_packet(raw_packet)
                payload = classified.to_dict()
                with self._buffer_lock:
                    self._buffer.append(payload)
                self.status.packet_count += 1
            except Exception as exc:
                self.status.last_error = str(exc)

        self._sniffer = AsyncSniffer(
            iface=interface,
            prn=_packet_callback,
            store=False,
        )
        try:
            self._sniffer.start()
        except Scapy_Exception as exc:
            self.status.running = False
            self.status.last_error = str(exc)
            msg = str(exc).lower()
            if "permission" in msg or "privilege" in msg or "denied" in msg:
                raise PrivilegeError(
                    "Capture failed — elevated privileges are required.\n"
                    "• Linux/macOS: re-run with sudo\n"
                    "• Windows: run as Administrator and install Npcap"
                ) from exc
            raise
        except PermissionError as exc:
            self.status.running = False
            self.status.last_error = str(exc)
            raise PrivilegeError(
                "Capture failed — elevated privileges are required.\n"
                "• Linux/macOS: re-run with sudo\n"
                "• Windows: run as Administrator and install Npcap"
            ) from exc
        except OSError as exc:
            self.status.running = False
            self.status.last_error = str(exc)
            raise PrivilegeError(
                f"Unable to open interface '{interface}'. "
                "Make sure the name is correct, the adapter is up, and you "
                "have capture privileges."
            ) from exc

        # Start the background flush loop
        self._flush_thread = threading.Thread(
            target=self._flush_loop,
            name="packet-highway-flush",
            daemon=True,
        )
        self._flush_thread.start()

    def stop(self) -> None:
        """Stop capturing."""
        self._stop_event.set()
        if self._sniffer is not None:
            try:
                self._sniffer.stop()
            except Exception:
                pass
        self._sniffer = None
        self.status.running = False

    # -- batch dispatch ----------------------------------------------------

    def _flush_loop(self) -> None:
        """Background thread: drain buffer → handler at a throttled rate."""
        while not self._stop_event.is_set():
            time.sleep(self._batch_interval)
            self._drain_buffer()

    def _drain_buffer(self) -> None:
        batch: list[dict[str, Any]] = []
        with self._buffer_lock:
            while self._buffer and len(batch) < self._max_batch_size:
                batch.append(self._buffer.popleft())
        if batch:
            try:
                self._batch_handler(batch)
            except Exception as exc:
                self.status.last_error = str(exc)


# --------------------------------------------------------------------------
# CLI entry-point  (python sniffer.py --cli)
# --------------------------------------------------------------------------
def _choose_interface() -> str:
    interfaces = PacketSniffer.list_interfaces()
    if not interfaces:
        raise SystemExit("No capture interfaces found.")
    print("\nAvailable interfaces:")
    for idx, name in enumerate(interfaces, 1):
        print(f"  {idx}. {name}")
    while True:
        choice = input("\nSelect interface number: ").strip()
        if choice.isdigit() and 1 <= int(choice) <= len(interfaces):
            return interfaces[int(choice) - 1]
        print("Invalid choice — enter a number from the list above.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Packet Highway — CLI sniffer")
    parser.add_argument("--interface", help="Network interface to sniff on")
    args = parser.parse_args()

    interface = args.interface or _choose_interface()

    def print_batch(batch: list[dict[str, Any]]) -> None:
        for pkt in batch:
            print(json.dumps(pkt, ensure_ascii=False))

    sniffer = PacketSniffer(batch_handler=print_batch)
    try:
        sniffer.start(interface)
        print(f"\n  Sniffing on {interface}  — press Ctrl+C to stop\n")
        while True:
            time.sleep(1)
    except PrivilegeError as exc:
        print(f"\n  ERROR: {exc}\n")
    except KeyboardInterrupt:
        pass
    finally:
        sniffer.stop()
        print("\nCapture stopped.")


if __name__ == "__main__":
    main()
