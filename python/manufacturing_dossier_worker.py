#!/usr/bin/env python3
from __future__ import annotations

import csv
import hashlib
import html
import json
import math
import os
import sys
import textwrap
from pathlib import Path

from reportlab.lib.pagesizes import landscape, TABLOID
from reportlab.pdfgen import canvas

PAGE = landscape(TABLOID)
W, H = PAGE
MARGIN = 28
FONT = "Helvetica"
BOLD = "Helvetica-Bold"


def load(path: Path):
    return json.loads(path.read_text())


def save_text(path: Path, text: str):
    path.write_text(text, encoding="utf-8")


def pdf_canvas(path: Path):
    return canvas.Canvas(
        str(path),
        pagesize=PAGE,
        pageCompression=0,
        invariant=1,
    )


def draw_title(c, title, subtitle=""):
    c.setFont(BOLD, 15)
    c.drawString(MARGIN, H - 32, title)
    if subtitle:
        c.setFont(FONT, 8)
        c.drawRightString(W - MARGIN, H - 30, subtitle)
    c.line(MARGIN, H - 40, W - MARGIN, H - 40)

def dim_h(c, x1, x2, object_y, dim_y, label):
    c.setLineWidth(0.45)
    c.line(x1, object_y, x1, dim_y)
    c.line(x2, object_y, x2, dim_y)
    c.line(x1, dim_y, x2, dim_y)
    tick = 4
    c.line(x1-tick, dim_y-tick, x1+tick, dim_y+tick)
    c.line(x2-tick, dim_y-tick, x2+tick, dim_y+tick)
    c.setFont(BOLD, 7)
    c.drawCentredString((x1+x2)/2, dim_y+4, label)


def dim_v(c, y1, y2, object_x, dim_x, label):
    c.setLineWidth(0.45)
    c.line(object_x, y1, dim_x, y1)
    c.line(object_x, y2, dim_x, y2)
    c.line(dim_x, y1, dim_x, y2)
    tick = 4
    c.line(dim_x-tick, y1-tick, dim_x+tick, y1+tick)
    c.line(dim_x-tick, y2-tick, dim_x+tick, y2+tick)
    c.saveState()
    c.translate(dim_x-7, (y1+y2)/2)
    c.rotate(90)
    c.setFont(BOLD, 7)
    c.drawCentredString(0, 0, label)
    c.restoreState()


def leader(c, x1, y1, x2, y2, text):
    c.setLineWidth(0.45)
    c.line(x1, y1, x2, y2)
    c.line(x2, y2, x2+90, y2)
    c.setFont(BOLD, 7)
    c.drawString(x2+4, y2+3, text)


def wrapped(c, text, x, y, width_chars=100, leading=10, font=FONT, size=8):
    c.setFont(font, size)
    for line in textwrap.wrap(str(text), width=width_chars) or [""]:
        c.drawString(x, y, line)
        y -= leading
    return y


def table(c, headers, rows, x, y, widths, row_height=18, font_size=7):
    c.setFont(BOLD, font_size)
    xx = x
    for header, width in zip(headers, widths):
        c.rect(xx, y - row_height, width, row_height)
        c.drawString(xx + 3, y - row_height + 5, str(header)[:60])
        xx += width
    y -= row_height
    c.setFont(FONT, font_size)
    for row in rows:
        lines = []
        max_lines = 1
        for value, width in zip(row, widths):
            chars = max(8, int(width / (font_size * 0.53)))
            cell_lines = textwrap.wrap(str(value), width=chars) or [""]
            lines.append(cell_lines)
            max_lines = max(max_lines, len(cell_lines))
        height = max(row_height, 5 + max_lines * (font_size + 2))
        xx = x
        for cell_lines, width in zip(lines, widths):
            c.rect(xx, y - height, width, height)
            yy = y - font_size - 3
            for line in cell_lines:
                c.drawString(xx + 3, yy, line)
                yy -= font_size + 2
            xx += width
        y -= height
        if y < 55:
            c.showPage()
            draw_title(c, "CONTINUED")
            y = H - 55
    return y


def profile_points(candidate):
    return [(p["xMm"], p["halfWidthMm"]) for p in candidate["profile"]]


def full_contour(candidate):
    upper = profile_points(candidate)
    lower = [(x, -y) for x, y in reversed(upper)]
    return upper + lower + [upper[0]]


def drawing_transform(candidate, x0, y0, width, height):
    contour = full_contour(candidate)
    xs = [p[0] for p in contour]
    ys = [p[1] for p in contour]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    spanx = max(maxx - minx, 1)
    spany = max(maxy - miny, 1)
    scale = min(width / spanx, height / spany)
    def t(point):
        x, y = point
        return (
            x0 + (x - minx) * scale,
            y0 + (y - miny) * scale,
        )
    return t, scale, (minx, maxx, miny, maxy)


def render_svg(candidate, dossier, out):
    drawing = dossier["drawing"]
    width, height = 1600, 1000
    t, scale, bounds = drawing_transform(candidate, 120, 300, 850, 480)
    contour = full_contour(candidate)
    pts = " ".join(f"{t(p)[0]:.2f},{height-t(p)[1]:.2f}" for p in contour)
    svg = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" fill="white"/>',
        '<g stroke="black" fill="none" stroke-width="2">',
        f'<polyline points="{pts}"/>',
    ]
    for hole in candidate["holes"]:
        cx, cy = t((hole["center"]["x"], hole["center"]["y"]))
        r = hole["diameterMm"] / 2 * scale
        svg.append(f'<circle cx="{cx:.2f}" cy="{height-cy:.2f}" r="{r:.2f}"/>')
        svg.append(f'<line x1="{cx-r-10:.2f}" y1="{height-cy:.2f}" x2="{cx+r+10:.2f}" y2="{height-cy:.2f}" stroke-width="1"/>')
        svg.append(f'<line x1="{cx:.2f}" y1="{height-cy-r-10:.2f}" x2="{cx:.2f}" y2="{height-cy+r+10:.2f}" stroke-width="1"/>')
    svg.append('</g>')
    svg += [
        f'<text x="50" y="55" font-family="Helvetica" font-size="28" font-weight="bold">{html.escape(drawing["title"])}</text>',
        f'<text x="50" y="85" font-family="Helvetica" font-size="16">DWG {html.escape(drawing["drawingNumber"])} REV {drawing["revision"]} | UNITS mm | SCALE {drawing["scale"]}</text>',
        '<text x="1020" y="150" font-family="Helvetica" font-size="18" font-weight="bold">GD&amp;T / FUNCTIONAL CONTROLS</text>',
    ]
    yy = 185
    for req in drawing["geometricRequirements"]:
        drf = "|".join(req["datumReferenceFrame"])
        suffix = f" | {drf}" if drf else ""
        line = f'{req["control"].upper()} | {req["toleranceMm"]:.3f}{suffix}'
        svg.append(f'<rect x="1020" y="{yy-20}" width="500" height="30" fill="none" stroke="black"/>')
        svg.append(f'<text x="1030" y="{yy}" font-family="Helvetica" font-size="15">{html.escape(line)}</text>')
        yy += 42
    svg.append('<text x="1020" y="350" font-family="Helvetica" font-size="18" font-weight="bold">SIZE REQUIREMENTS</text>')
    yy = 380
    for req in drawing["sizes"]:
        line = f'{req["id"]}: {req["nominalMm"]:.3f} [{req["lowerLimitMm"]:.3f}, {req["upperLimitMm"]:.3f}]'
        svg.append(f'<text x="1020" y="{yy}" font-family="Helvetica" font-size="14">{html.escape(line)}</text>')
        yy += 28
    svg.append('<text x="1020" y="540" font-family="Helvetica" font-size="18" font-weight="bold">DATUM SCHEME</text>')
    yy = 570
    for datum in drawing["datums"]:
        svg.append(f'<text x="1020" y="{yy}" font-family="Helvetica" font-size="14">{datum["id"]}: {html.escape(datum["role"])}</text>')
        yy += 45
    svg.append('<text x="50" y="900" font-family="Helvetica" font-size="15" font-weight="bold">PORTFOLIO / RESEARCH DRAWING - NOT RELEASED FOR PRODUCTION</text>')
    svg.append('</svg>')
    save_text(out, "\n".join(svg) + "\n")


def render_drawing_pdf(candidate, dossier, out):
    d = dossier["drawing"]
    c = pdf_canvas(out)
    draw_title(c, d["title"], f'{d["drawingNumber"]} REV {d["revision"]}')
    c.setFont(FONT, 7)
    c.drawString(MARGIN, H - 52, f'UNITS: {d["units"]}   SCALE: {d["scale"]}   MATERIAL: {d["material"]}')

    t, scale, bounds = drawing_transform(candidate, 55, 175, 500, 360)
    contour = full_contour(candidate)
    p = c.beginPath()
    x, y = t(contour[0])
    p.moveTo(x, y)
    for point in contour[1:]:
        x, y = t(point)
        p.lineTo(x, y)
    c.drawPath(p)

    for hole in candidate["holes"]:
        cx, cy = t((hole["center"]["x"], hole["center"]["y"]))
        r = hole["diameterMm"] / 2 * scale
        c.circle(cx, cy, r)
        c.setLineWidth(0.35)
        c.line(cx-r-7, cy, cx+r+7, cy)
        c.line(cx, cy-r-7, cx, cy+r+7)
        c.setLineWidth(1)

    c.setFont(BOLD, 8)
    c.drawString(55, 550, "TOP VIEW - GENERATED NOMINAL PROFILE")

    # shop-style dimensions and feature leaders
    left_mid = t((0, 0))[0]
    right_mid = t((bounds[1], 0))[0]
    root_top = t((0, bounds[3]))[1]
    root_bottom = t((0, bounds[2]))[1]
    dim_h(c, left_mid, right_mid, root_bottom, 160, f'{bounds[1]-bounds[0]:.3f} OAL')
    dim_v(c, root_bottom, root_top, left_mid, 42, f'{bounds[3]-bounds[2]:.3f} MAX WIDTH')

    upper = next(h for h in candidate["holes"] if h["id"].endswith(".upper"))
    lower = next(h for h in candidate["holes"] if h["id"].endswith(".lower"))
    load = next(h for h in candidate["holes"] if h["role"] == "load")
    ux, uy = t((upper["center"]["x"], upper["center"]["y"]))
    lx, ly = t((lower["center"]["x"], lower["center"]["y"]))
    px, py = t((load["center"]["x"], load["center"]["y"]))
    origin_x = t((0, 0))[0]
    dim_v(c, ly, uy, ux, ux-28, f'[{abs(upper["center"]["y"]-lower["center"]["y"]):.3f} BASIC]')
    dim_h(c, origin_x, ux, root_top, 523, f'[{upper["center"]["x"]:.3f} BASIC]')
    dim_h(c, origin_x, px, root_top, 540, f'[{load["center"]["x"]:.3f} BASIC]')
    leader(c, ux, uy, ux+35, uy+35, '2X DIA 6.600 +0.100/-0.000 THRU')
    leader(c, px, py, px+40, py+55, 'DIA 16.000 +0.018/-0.000 FINISH BORE')

    # simple datum callouts
    c.rect(70, 135, 18, 16); c.drawCentredString(79, 140, "A")
    c.rect(155, 420, 18, 16); c.drawCentredString(164, 425, "B")
    c.rect(155, 250, 18, 16); c.drawCentredString(164, 255, "C")

    # side view
    side_x, side_y = 80, 82
    side_w = 420
    side_h = max(12, candidate["parameters"]["thicknessMm"] * 6)
    c.rect(side_x, side_y, side_w, side_h)
    c.setFont(FONT, 7)
    c.drawString(side_x, side_y - 12, f'THICKNESS {candidate["parameters"]["thicknessMm"]:.3f}  LIMITS {d["sizes"][0]["lowerLimitMm"]:.3f}-{d["sizes"][0]["upperLimitMm"]:.3f}')

    # dimensions / notes
    x0 = 585
    y0 = H - 75
    c.setFont(BOLD, 9)
    c.drawString(x0, y0, "BASIC DIMENSIONS")
    y0 -= 14
    c.setFont(FONT, 7)
    for item in d["basicDimensions"]:
        c.drawString(x0, y0, f'[{item["valueMm"]:.3f} BASIC] {item["from"]} -> {item["to"]}')
        y0 -= 12

    y0 -= 8
    c.setFont(BOLD, 9); c.drawString(x0, y0, "SIZE REQUIREMENTS"); y0 -= 14
    c.setFont(FONT, 7)
    for item in d["sizes"]:
        c.drawString(x0, y0, f'{item["id"]}: {item["nominalMm"]:.3f}  LIMITS {item["lowerLimitMm"]:.3f}/{item["upperLimitMm"]:.3f}')
        y0 -= 12

    y0 -= 8
    c.setFont(BOLD, 9); c.drawString(x0, y0, "FEATURE CONTROL FRAMES (TEXT FORM)"); y0 -= 14
    for item in d["geometricRequirements"]:
        drf = " | ".join(item["datumReferenceFrame"])
        text = f'{item["control"].upper()} | {item["toleranceMm"]:.3f}' + (f' | {drf}' if drf else '')
        c.rect(x0, y0 - 4, 235, 16)
        c.setFont(BOLD, 7); c.drawString(x0 + 4, y0, text)
        y0 -= 24

    c.setFont(BOLD, 8); c.drawString(x0, y0, "GENERAL NOTES"); y0 -= 12
    for note in d["notes"]:
        y0 = wrapped(c, note, x0, y0, width_chars=66, leading=9, size=6.7)
        y0 -= 3

    # title block
    c.rect(W - 310, 18, 282, 62)
    c.setFont(BOLD, 8); c.drawString(W - 304, 65, d["drawingNumber"])
    c.setFont(FONT, 7)
    c.drawString(W - 304, 52, f'REV {d["revision"]}  UNITS {d["units"]}  SCALE {d["scale"]}')
    c.drawString(W - 304, 39, "STATUS: PORTFOLIO / RESEARCH - NOT PRODUCTION RELEASE")
    c.drawString(W - 304, 26, "SOURCE: GMR DrawingSpec; geometry remains bound to candidate digest")
    c.save()


def render_dfm_pdf(dossier, out):
    c = pdf_canvas(out)
    d = dossier["dfm"]
    draw_title(c, "DESIGN FOR MANUFACTURING REVIEW", f'DFM {d["disposition"]}')
    rows = [
        [x["id"], x["category"], x["disposition"], x["statement"], x["evidence"]]
        for x in d["checks"]
    ]
    y = table(c, ["ID", "CATEGORY", "STATUS", "STATEMENT", "EVIDENCE"], rows, MARGIN, H-60, [90, 70, 55, 250, 300], row_height=20)
    y -= 16
    c.setFont(BOLD, 8); c.drawString(MARGIN, y, "LIMITATIONS"); y -= 12
    for note in d["limitations"]:
        y = wrapped(c, note, MARGIN, y, 125, 9, size=7)
    c.save()


def render_inspection_pdf(dossier, out):
    c = pdf_canvas(out)
    d = dossier["inspection"]
    draw_title(c, "INSPECTION PLAN", "SIMULATED/PORTFOLIO CONTROL PLAN")
    rows = []
    for x in d["characteristics"]:
        if "maximumMm" in x:
            tol = f'<= {x["maximumMm"]:.3f}'
        else:
            tol = f'{x["lowerLimitMm"]:.3f}..{x["upperLimitMm"]:.3f}'
        rows.append([x["id"], x["description"], tol, x["method"], f'{x["resolutionMm"]:.3f}', x["sampling"]])
    y = table(c, ["CHAR", "DESCRIPTION", "ACCEPT", "METHOD", "RES", "SAMPLING"], rows, MARGIN, H-60, [105, 155, 70, 100, 45, 300], row_height=20)
    y -= 16
    c.setFont(BOLD, 8); c.drawString(MARGIN, y, "NOTES"); y -= 12
    for note in d["notes"]:
        y = wrapped(c, note, MARGIN, y, 125, 9, size=7)
    c.save()


def render_metrology_csv(dossier, out):
    m = dossier["metrology"]
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["record_type", "characteristic_id", "sample_index", "actual_mm", "measured_mm", "uncertainty_mm", "disposition", "cp", "cpk", "pass_rate"])
        for obs in m["firstArticle"]:
            w.writerow(["first_article", obs["characteristicId"], 1, f'{obs["actualValueMm"]:.9f}', f'{obs["measuredValueMm"]:.9f}', f'{obs["measurementUncertaintyMm"]:.9f}', obs["disposition"], "", "", ""])
        for cap in m["capability"]:
            for i, value in enumerate(cap["observationsMm"], 1):
                w.writerow(["synthetic_lot", cap["characteristicId"], i, "", f'{value:.9f}', "", "", f'{cap.get("cp", "")}', f'{cap.get("cpk", "")}', f'{cap["observedPassRate"]:.6f}'])


def render_metrology_pdf(dossier, out):
    c = pdf_canvas(out)
    m = dossier["metrology"]
    draw_title(c, "SIMULATED METROLOGY / FIRST ARTICLE", "NOT PHYSICAL MEASUREMENT")
    rows = []
    for x in m["firstArticle"]:
        rows.append([
            x["characteristicId"],
            f'{x["actualValueMm"]:.5f}',
            f'{x["measuredValueMm"]:.5f}',
            f'+/- {x["measurementUncertaintyMm"]:.5f}',
            x["method"],
            x["disposition"],
        ])
    y = table(c, ["CHAR", "MODEL ACTUAL", "MEASURED", "UNCERTAINTY", "METHOD", "STATUS"], rows, MARGIN, H-60, [130, 85, 85, 90, 120, 60], row_height=20)
    y -= 18
    c.setFont(BOLD, 9); c.drawString(MARGIN, y, "SYNTHETIC CAPABILITY PROJECTION (N=30)"); y -= 8
    cap_rows = []
    for x in m["capability"]:
        cap_rows.append([
            x["characteristicId"],
            f'{x["meanMm"]:.5f}',
            f'{x["sampleStdDevMm"]:.5f}',
            "" if "cp" not in x else f'{x["cp"]:.3f}',
            "" if "cpk" not in x else f'{x["cpk"]:.3f}',
            f'{100*x["observedPassRate"]:.1f}%',
        ])
    y = table(c, ["CHAR", "MEAN", "S", "Cp", "Cpk", "PASS RATE"], cap_rows, MARGIN, y, [150, 90, 90, 70, 70, 80], row_height=18)
    y -= 16
    c.setFont(BOLD, 8); c.drawString(MARGIN, y, "LIMITATIONS"); y -= 12
    for note in m["limitations"]:
        y = wrapped(c, note, MARGIN, y, 125, 9, size=7)
    c.save()


def render_setup_pdf(candidate, plan, dossier, out):
    c = pdf_canvas(out)
    draw_title(c, "SETUP SHEET / VIRTUAL PROVE-OUT", candidate["id"])
    setup = plan["setups"][0]
    c.setFont(BOLD, 9)
    c.drawString(MARGIN, H-60, f'SETUP: {setup["id"]}   WCS: {setup["workOffset"]}   FIXTURE: {setup["fixture"]}   CLEARANCE Z: {setup["clearanceZ"]:.3f} mm')
    tool_rows = [[t["number"], t["id"], t["kind"], f'{t["diameterMm"]:.3f}', t["spindleRpm"], t["feedMmPerMin"]] for t in plan["tools"]]
    y = table(c, ["T", "TOOL", "KIND", "DIA", "RPM", "FEED"], tool_rows, MARGIN, H-82, [35, 150, 100, 65, 70, 70], row_height=18)
    y -= 14
    op_rows = []
    for op in setup["operations"]:
        op_rows.append([op["id"], op["_tag"], op["toolId"], json.dumps({k:v for k,v in op.items() if k not in ["id","_tag","toolId"]}, separators=(",",":"))])
    y = table(c, ["OP", "TYPE", "TOOL", "DETAIL"], op_rows, MARGIN, y, [120, 110, 120, 430], row_height=20)
    y -= 14
    p = dossier["proveout"]
    proof_rows = [[x["id"], x["disposition"], x["statement"], x["evidence"]] for x in p["checks"]]
    y = table(c, ["CHECK", "STATUS", "STATEMENT", "EVIDENCE"], proof_rows, MARGIN, y, [125, 65, 270, 320], row_height=20)
    y -= 12
    c.setFont(BOLD, 8); c.drawString(MARGIN, y, "PROCESS ASSUMPTIONS"); y -= 12
    for note in plan["assumptions"]:
        y = wrapped(c, note, MARGIN, y, 125, 9, size=7)
    c.save()


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: manufacturing_dossier_worker.py REQUEST_JSON OUTPUT_DIR")
    request_path = Path(sys.argv[1]).resolve()
    out_dir = Path(sys.argv[2]).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    req = load(request_path)
    if req.get("schema") != "gmr.dossier-render-request/v1":
        raise TypeError("unsupported dossier render request")
    candidate = req["candidate"]
    plan = req["manufacturingPlan"]
    dossier = req["dossier"]
    if dossier["candidateDigest"] != candidate["candidateDigest"]:
        raise TypeError("dossier/candidate identity mismatch")
    if plan["candidateDigest"] != candidate["candidateDigest"]:
        raise TypeError("plan/candidate identity mismatch")

    artifacts = {
        "drawingSvg": out_dir / "engineering-drawing.svg",
        "drawingPdf": out_dir / "engineering-drawing.pdf",
        "dfmPdf": out_dir / "dfm-report.pdf",
        "inspectionPdf": out_dir / "inspection-plan.pdf",
        "metrologyCsv": out_dir / "simulated-metrology.csv",
        "metrologyPdf": out_dir / "simulated-metrology.pdf",
        "setupSheetPdf": out_dir / "setup-sheet.pdf",
    }
    render_svg(candidate, dossier, artifacts["drawingSvg"])
    render_drawing_pdf(candidate, dossier, artifacts["drawingPdf"])
    render_dfm_pdf(dossier, artifacts["dfmPdf"])
    render_inspection_pdf(dossier, artifacts["inspectionPdf"])
    render_metrology_csv(dossier, artifacts["metrologyCsv"])
    render_metrology_pdf(dossier, artifacts["metrologyPdf"])
    render_setup_pdf(candidate, plan, dossier, artifacts["setupSheetPdf"])

    result = {
        "schema": "gmr.dossier-render-result/v1",
        "dossierDigest": dossier["dossierDigest"],
        "artifacts": {key: str(value) for key, value in artifacts.items()},
        "reportlabVersion": __import__("reportlab").Version,
    }
    print(json.dumps(result, separators=(",", ":")))


if __name__ == "__main__":
    main()