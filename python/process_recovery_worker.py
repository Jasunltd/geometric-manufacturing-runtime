#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
import textwrap
from pathlib import Path

from reportlab.lib.pagesizes import landscape, TABLOID
from reportlab.pdfgen import canvas

PAGE = landscape(TABLOID)
W, H = PAGE
MARGIN = 30
FONT = "Helvetica"
BOLD = "Helvetica-Bold"


def wrap(c, text, x, y, width=110, leading=10, size=7, font=FONT):
    c.setFont(font, size)
    for line in textwrap.wrap(str(text), width=width) or [""]:
        c.drawString(x, y, line)
        y -= leading
    return y


def source_label(obs):
    src = obs["source"]
    if src["kind"] == "machine-feedback":
        return f'machine:{src["systemId"]}/{src["channel"]}'
    if src["kind"] == "metrology":
        return f'metrology:{src["systemId"]}/{src["method"]}'
    return f'human:{src["operatorId"]}/{src["role"]}'


def observation_summary(obs):
    kind = obs["kind"]
    if kind == "dimensional-trend":
        vals = ", ".join(f'{x:.4f}' for x in obs["valuesMm"])
        return f'{obs["characteristicId"]}: [{vals}] mm, limits {obs["lowerLimitMm"]:.4f}..{obs["upperLimitMm"]:.4f}'
    if kind == "fixture-distortion":
        return f'unclamped {obs["unclampedFlatnessMm"]:.3f} mm, clamped {obs["clampedFlatnessMm"]:.3f} mm, clamp scale {obs["clampForceScale"]:.3f}'
    if kind == "vibration":
        return f'{obs["toolId"]}: chatter index {obs["chatterIndex"]:.2f}, RMS {obs["rmsAccelerationG"]:.2f} g'
    if kind == "human-correction":
        return f'{obs["field"]}: {obs["previousValue"]:.3f} -> {obs["correctedValue"]:.3f}; {obs["reason"]}'
    if kind == "gage-rr":
        return f'{obs["measurementSystemId"]}: %GRR {obs["percentGrr"]:.1f}%, ndc {obs["ndc"]:.1f}'
    if kind == "thermal-drift":
        return f'{obs["axis"].upper()} bias {obs["measuredBiasMm"]:.3f} mm, temp {obs["baselineTemperatureC"]:.1f}->{obs["currentTemperatureC"]:.1f} C'
    return kind


def action_summary(action):
    tag = action["_tag"]
    if tag == "AdjustToolDiameter":
        return f'{tag}: {action["toolId"]} delta {action["deltaMm"]:+.4f} mm'
    if tag == "SetClampForceScale":
        return f'{tag}: {action["from"]:.3f} -> {action["to"]:.3f}'
    if tag == "SetToolStickout":
        return f'{tag}: {action["toolId"]} {action["fromMm"]:.1f} -> {action["toMm"]:.1f} mm'
    if tag == "SetCutLoadScale":
        return f'{tag}: {action["toolId"]} spindle x{action["spindleScale"]:.2f}, feed x{action["feedScale"]:.2f}'
    if tag == "QuarantineMeasurementSystem":
        return f'{tag}: {action["measurementSystemId"]}'
    if tag == "ReleaseMeasurementSystem":
        return f'{tag}: {action["measurementSystemId"]}'
    if tag == "SetProcessHold":
        return f'{tag}: {"HOLD" if action["hold"] else "RELEASE"}'
    if tag == "ApplyThermalWorkOffset":
        return f'{tag}: {action["axis"].upper()} {action["deltaMm"]:+.4f} mm'
    return tag


def table(c, headers, rows, x, y, widths, row_height=18, font_size=7):
    c.setFont(BOLD, font_size)
    xx = x
    for header, width in zip(headers, widths):
        c.rect(xx, y-row_height, width, row_height)
        c.drawString(xx+3, y-row_height+5, str(header))
        xx += width
    y -= row_height
    c.setFont(FONT, font_size)
    for row in rows:
        wrapped = []
        max_lines = 1
        for value, width in zip(row, widths):
            chars = max(8, int(width/(font_size*0.53)))
            lines = textwrap.wrap(str(value), width=chars) or [""]
            wrapped.append(lines)
            max_lines = max(max_lines, len(lines))
        height = max(row_height, 5 + max_lines*(font_size+2))
        xx = x
        for lines, width in zip(wrapped, widths):
            c.rect(xx, y-height, width, height)
            yy = y-font_size-3
            for line in lines:
                c.drawString(xx+3, yy, line)
                yy -= font_size+2
            xx += width
        y -= height
    return y


def render(study, output):
    c = canvas.Canvas(
        str(output),
        pagesize=PAGE,
        pageCompression=0,
        invariant=1,
    )
    c.setFont(BOLD, 16)
    c.drawString(MARGIN, H-32, study["title"])
    c.setFont(FONT, 8)
    c.drawRightString(W-MARGIN, H-30, study["scenarioId"])
    c.line(MARGIN, H-40, W-MARGIN, H-40)

    y = H-58
    c.setFont(BOLD, 8)
    c.drawString(MARGIN, y, "OBJECTIVE")
    y -= 12
    y = wrap(c, study["objective"], MARGIN, y, width=145, leading=10, size=7)
    y -= 8

    rows = [
        [obs["id"], source_label(obs), obs["kind"], observation_summary(obs)]
        for obs in study["observations"]
    ]
    y = table(
        c,
        ["OBSERVATION", "SOURCE", "KIND", "EVIDENCE"],
        rows,
        MARGIN,
        y,
        [120, 165, 110, 390],
        row_height=20,
    )
    y -= 14

    c.setFont(BOLD, 10)
    c.drawString(MARGIN, y, f'DIAGNOSIS: {study["assessment"]["diagnosis"]}')
    c.setFont(FONT, 8)
    c.drawString(MARGIN+260, y, f'Evidence quality: {study["assessment"]["evidenceQuality"]}')
    y -= 14
    for item in study["assessment"]["evidence"]:
        y = wrap(c, "• " + item, MARGIN, y, width=145, leading=9, size=7)
    y -= 8

    action = study["application"]["action"]
    c.setFont(BOLD, 10)
    c.drawString(MARGIN, y, "ADJUSTMENT")
    y -= 14
    c.setFont(BOLD, 9)
    c.drawString(MARGIN+10, y, action_summary(action))
    y -= 12
    if "basis" in action:
        y = wrap(c, action["basis"], MARGIN+10, y, width=140, leading=9, size=7)
    c.setFont(FONT, 7)
    c.drawString(
        MARGIN+10,
        y,
        f'Process state revision {study["initialState"]["revision"]} -> {study["application"]["after"]["revision"]}; candidate geometry unchanged.',
    )
    y -= 20

    verify_rows = [
        [obs["id"], source_label(obs), observation_summary(obs)]
        for obs in study["verificationObservations"]
    ]
    y = table(
        c,
        ["VERIFICATION OBSERVATION", "SOURCE", "EVIDENCE"],
        verify_rows,
        MARGIN,
        y,
        [150, 180, 455],
        row_height=20,
    )
    y -= 12
    c.setFont(BOLD, 10)
    c.drawString(
        MARGIN,
        y,
        "VERIFICATION: " + study["verification"]["disposition"].upper(),
    )
    y -= 13
    for item in study["verification"]["evidence"]:
        y = wrap(c, "• " + item, MARGIN, y, width=145, leading=9, size=7)

    right_x = 840
    right_y = H-70
    c.setFont(BOLD, 9)
    c.drawString(right_x, right_y, "WHAT THIS DEMONSTRATES")
    right_y -= 14
    for item in study["claims"]:
        right_y = wrap(c, "• " + item, right_x, right_y, width=60, leading=9, size=7)
        right_y -= 3
    right_y -= 8
    c.setFont(BOLD, 9)
    c.drawString(right_x, right_y, "LIMITS")
    right_y -= 14
    for item in study["limitations"]:
        right_y = wrap(c, "• " + item, right_x, right_y, width=60, leading=9, size=7)
        right_y -= 2

    c.setFont(BOLD, 8)
    c.drawString(
        MARGIN,
        24,
        "SIMULATED PROCESS-RECOVERY CASE STUDY — NOT PHYSICAL MACHINE EVIDENCE",
    )
    c.setFont(FONT, 6.5)
    c.drawRightString(W-MARGIN, 24, "case " + study["caseStudyDigest"])
    c.save()


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: process_recovery_worker.py STUDY_JSON OUTPUT_DIR")
    study_path = Path(sys.argv[1]).resolve()
    output_dir = Path(sys.argv[2]).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    study = json.loads(study_path.read_text())
    if study.get("schema") != "gmr.process-recovery-case-study/v1":
        raise TypeError("unsupported recovery case study")
    output = output_dir / "process-recovery-case-study.pdf"
    render(study, output)
    import reportlab
    print(json.dumps({
        "schema": "gmr.process-recovery-render-result/v1",
        "caseStudyDigest": study["caseStudyDigest"],
        "reportlabVersion": reportlab.Version,
        "reportPdf": str(output),
    }, separators=(",", ":")))


if __name__ == "__main__":
    main()
