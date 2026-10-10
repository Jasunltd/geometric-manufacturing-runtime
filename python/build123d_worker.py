#!/usr/bin/env python3
import json
import pathlib
import re
import sys
from build123d import (
    Circle,
    ExportSVG,
    LineType,
    Pos,
    Polyline,
    export_step,
    export_stl,
    extrude,
    make_face,
)
import build123d


CANONICAL_STEP_TIMESTAMP = "1970-01-01T00:00:00"


def fail(message: str) -> None:
    raise ValueError(message)


def normalize_step_header(step_path: pathlib.Path) -> None:
    text = step_path.read_text()
    pattern = (
        r"(FILE_NAME\('Open CASCADE Shape Model',')"
        r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}"
        r"(')"
    )
    normalized, replacements = re.subn(
        pattern,
        rf"\g<1>{CANONICAL_STEP_TIMESTAMP}\2",
        text,
        count=1,
    )
    if replacements != 1:
        fail("STEP export header did not contain the expected OCCT timestamp")
    step_path.write_text(normalized)


def main() -> None:
    if len(sys.argv) != 3:
        fail("usage: build123d_worker.py REQUEST_JSON OUTPUT_DIR")

    request_path = pathlib.Path(sys.argv[1])
    output_dir = pathlib.Path(sys.argv[2])
    request = json.loads(request_path.read_text())
    if request.get("schema") != "gmr.build123d-request/v1":
        fail("unsupported request schema")

    candidate = request.get("candidate")
    if not isinstance(candidate, dict):
        fail("candidate is required")
    profile = candidate.get("profile")
    holes = candidate.get("holes")
    parameters = candidate.get("parameters")
    if not isinstance(profile, list) or len(profile) < 2:
        fail("candidate profile requires at least two points")
    if not isinstance(holes, list):
        fail("candidate holes must be an array")
    if not isinstance(parameters, dict):
        fail("candidate parameters are required")

    thickness = float(parameters["thicknessMm"])
    if thickness <= 0:
        fail("thickness must be positive")

    upper = [
        (float(point["xMm"]), float(point["halfWidthMm"]))
        for point in profile
    ]
    lower = [(x, -half_width) for x, half_width in reversed(upper)]
    perimeter = Polyline(*(upper + lower), close=True)
    sketch = make_face(perimeter.edges())
    part = extrude(sketch, amount=thickness)

    for hole in holes:
        center = hole["center"]
        radius = float(hole["diameterMm"]) / 2.0
        hole_sketch = (
            Pos(float(center["x"]), float(center["y"])) * Circle(radius)
        )
        cutter = extrude(hole_sketch, amount=thickness)
        part = part - cutter

    output_dir.mkdir(parents=True, exist_ok=True)
    step_path = output_dir / "model.step"
    stl_path = output_dir / "model.stl"
    svg_path = output_dir / "top.svg"

    if not export_step(part, step_path):
        fail("STEP export failed")
    normalize_step_header(step_path)
    if not export_stl(part, stl_path):
        fail("STL export failed")

    visible, hidden = part.project_to_viewport(
        (0, 0, max(100.0, thickness * 20.0)),
        (0, 1, 0),
    )
    max_dimension = max(
        part.bounding_box().size.X,
        part.bounding_box().size.Y,
        1.0,
    )
    exporter = ExportSVG(scale=160.0 / max_dimension, margin=5)
    exporter.add_layer("Visible")
    exporter.add_layer("Hidden", line_type=LineType.ISO_DOT)
    exporter.add_shape(visible, layer="Visible")
    exporter.add_shape(hidden, layer="Hidden")
    exporter.write(svg_path)

    bbox = part.bounding_box().size
    center = part.center()
    result = {
        "schema": "gmr.build123d-worker-result/v1",
        "candidateId": candidate["id"],
        "candidateDigest": candidate["candidateDigest"],
        "backend": {
            "name": "build123d",
            "version": build123d.__version__,
            "mode": "algebra",
        },
        "valid": bool(part.is_valid),
        "volumeMm3": float(part.volume),
        "surfaceAreaMm2": float(part.area),
        "centerOfMassMm": {
            "x": float(center.X),
            "y": float(center.Y),
            "z": float(center.Z),
        },
        "boundingBoxMm": {
            "x": float(bbox.X),
            "y": float(bbox.Y),
            "z": float(bbox.Z),
        },
        "topology": {
            "solids": len(part.solids()),
            "faces": len(part.faces()),
            "edges": len(part.edges()),
        },
        "artifacts": {
            "step": str(step_path),
            "stl": str(stl_path),
            "svg": str(svg_path),
        },
    }
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
