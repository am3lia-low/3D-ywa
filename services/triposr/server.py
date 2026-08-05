"""Small persistent HTTP wrapper around the official TripoSR model."""

from __future__ import annotations

import argparse
import base64
import binascii
import hashlib
import io
import json
import re
import sys
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

MAX_REQUEST_BYTES = 24 * 1024 * 1024
SUPPORTED_IMAGES = {"image/png", "image/jpeg", "image/webp"}


class ReconstructionRuntime:
    def __init__(self, triposr_repo: Path, output_dir: Path, public_url: str) -> None:
        self.triposr_repo = triposr_repo.resolve()
        self.output_dir = output_dir.resolve()
        self.public_url = "/" + public_url.strip("/")
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._model: Any = None
        self._device = "unloaded"
        self._rembg_session: Any = None

    @property
    def status(self) -> dict[str, Any]:
        return {
            "ok": True,
            "provider": "triposr-local",
            "modelLoaded": self._model is not None,
            "device": self._device,
        }

    def _load(self) -> None:
        if self._model is not None:
            return
        if not self.triposr_repo.joinpath("tsr", "system.py").is_file():
            raise RuntimeError(f"TripoSR was not found at '{self.triposr_repo}'.")
        sys.path.insert(0, str(self.triposr_repo))

        import rembg
        import torch
        from tsr.system import TSR

        if not torch.cuda.is_available():
            raise RuntimeError("CUDA is unavailable; this local provider requires an NVIDIA GPU.")
        self._device = "cuda:0"
        self._model = TSR.from_pretrained(
            "stabilityai/TripoSR",
            config_name="config.yaml",
            weight_name="model.ckpt",
        )
        self._model.renderer.set_chunk_size(8192)
        self._model.to(self._device)
        self._rembg_session = rembg.new_session()

    def reconstruct(self, entity_id: str, image_bytes: bytes, resolution: int) -> dict[str, str]:
        with self._lock:
            self._load()

            import numpy as np
            import torch
            from PIL import Image
            from tsr.utils import remove_background, resize_foreground, to_gradio_3d_orientation

            image = Image.open(io.BytesIO(image_bytes))
            image.load()
            image = remove_background(image, self._rembg_session)
            image = resize_foreground(image, 0.85)
            rgba = np.array(image).astype(np.float32) / 255.0
            rgb = rgba[:, :, :3] * rgba[:, :, 3:4] + (1 - rgba[:, :, 3:4]) * 0.5
            prepared = Image.fromarray((rgb * 255.0).astype(np.uint8))

            with torch.no_grad():
                scene_codes = self._model([prepared], device=self._device)
                mesh = self._model.extract_mesh(
                    scene_codes,
                    True,
                    resolution=resolution,
                )[0]
            mesh = to_gradio_3d_orientation(mesh)

            digest = hashlib.sha256(image_bytes + str(resolution).encode()).hexdigest()[:12]
            safe_id = re.sub(r"[^A-Za-z0-9._-]+", "-", entity_id).strip("-.") or "asset"
            filename = f"{safe_id}-{digest}.glb"
            output_path = self.output_dir.joinpath(filename).resolve()
            if output_path.parent != self.output_dir:
                raise RuntimeError("Refusing to write outside the configured output directory.")
            mesh.export(output_path, file_type="glb")
            return {
                "artifactId": f"triposr:{entity_id}:{digest}",
                "modelUrl": f"{self.public_url}/{filename}",
            }


def create_handler(runtime: ReconstructionRuntime):
    class Handler(BaseHTTPRequestHandler):
        server_version = "StoryWorldTripoSR/1.0"

        def _headers(self, status: int, content_type: str = "application/json") -> None:
            self.send_response(status)
            self.send_header("content-type", f"{content_type}; charset=utf-8")
            self.send_header("access-control-allow-origin", "*")
            self.send_header("access-control-allow-headers", "content-type")
            self.send_header("access-control-allow-methods", "GET, POST, OPTIONS")
            self.end_headers()

        def _json(self, status: int, payload: dict[str, Any]) -> None:
            body = json.dumps(payload).encode()
            self._headers(status)
            self.wfile.write(body)

        def do_OPTIONS(self) -> None:  # noqa: N802
            self._headers(HTTPStatus.NO_CONTENT)

        def do_GET(self) -> None:  # noqa: N802
            if self.path != "/health":
                self._json(HTTPStatus.NOT_FOUND, {"error": "not found"})
                return
            self._json(HTTPStatus.OK, runtime.status)

        def do_POST(self) -> None:  # noqa: N802
            if self.path != "/v1/reconstruct":
                self._json(HTTPStatus.NOT_FOUND, {"error": "not found"})
                return
            try:
                length = int(self.headers.get("content-length", "0"))
                if length <= 0 or length > MAX_REQUEST_BYTES:
                    raise ValueError("request body must be between 1 byte and 24 MiB")
                payload = json.loads(self.rfile.read(length))
                entity_id = payload.get("entityId")
                image = payload.get("image")
                resolution = payload.get("meshResolution", 256)
                if not isinstance(entity_id, str) or not entity_id.strip():
                    raise ValueError("entityId must be a non-empty canonical ID")
                if not isinstance(image, dict) or image.get("mimeType") not in SUPPORTED_IMAGES:
                    raise ValueError("image must be PNG, JPEG, or WebP")
                if not isinstance(resolution, int) or not 64 <= resolution <= 512:
                    raise ValueError("meshResolution must be an integer from 64 to 512")
                encoded = image.get("base64")
                if not isinstance(encoded, str):
                    raise ValueError("image.base64 must be a string")
                try:
                    image_bytes = base64.b64decode(encoded, validate=True)
                except (binascii.Error, ValueError) as error:
                    raise ValueError("image.base64 is invalid") from error
                result = runtime.reconstruct(entity_id, image_bytes, resolution)
                self._json(HTTPStatus.OK, result)
            except ValueError as error:
                self._json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
            except Exception as error:  # Keep the job retryable in the TypeScript worker.
                self._json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": str(error)})

        def log_message(self, format: str, *args: Any) -> None:
            print(f"[triposr] {self.address_string()} {format % args}", flush=True)

    return Handler


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8123, type=int)
    parser.add_argument("--triposr-repo", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--public-url", default="/generated")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    runtime = ReconstructionRuntime(args.triposr_repo, args.output_dir, args.public_url)
    server = ThreadingHTTPServer((args.host, args.port), create_handler(runtime))
    print(f"TripoSR service listening on http://{args.host}:{args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
