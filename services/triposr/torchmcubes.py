"""API-compatible CPU fallback for TripoSR's optional torchmcubes extension."""

from __future__ import annotations

import numpy as np
import torch
from skimage.measure import marching_cubes as skimage_marching_cubes


def marching_cubes(volume: torch.Tensor, isovalue: float):
    """Return vertices/faces with the interface expected by TripoSR."""
    values = volume.detach().float().cpu().numpy()
    vertices, faces, _normals, _values = skimage_marching_cubes(values, level=isovalue)
    return (
        torch.from_numpy(np.ascontiguousarray(vertices, dtype=np.float32)),
        torch.from_numpy(np.ascontiguousarray(faces, dtype=np.int64)),
    )
