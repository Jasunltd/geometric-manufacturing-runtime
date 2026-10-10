# Clamp Load Bows Datum A

**Scenario:** clamp-induced-distortion
**Claim level:** simulated process-recovery exercise, not physical-machine evidence
**Case digest:** sha256:3f2773a31f4c056c86d3a8ef82b4353d0c3cf0620ce9b53b95192cb1da53643f

## Objective

Separate incoming stock flatness from fixture-induced distortion using unclamped/clamped metrology plus a human setup correction, then reduce clamp load and remeasure.

## Incoming observations

| Observation | Source | Kind | Evidence |
| --- | --- | --- | --- |
| OBS-CLAMP-METROLOGY-01 | metrology:fixture-cmm/clamped-vs-unclamped-plane-fit | fixture-distortion | unclamped flatness 0.032 mm; clamped 0.192 mm; clamp scale 1.000 |
| OBS-CLAMP-HUMAN-01 | human:setup-tech-01/setup-technician | human-correction | clamp-force-scale corrected 1.000 -> 1.200; Torque-wrench setting on the actual setup was 20% above the nominal traveler value. |

## Diagnosis

**clamp-induced-distortion** — evidence quality: **sufficient**

- Unclamped flatness 0.032 mm is acceptable.
- Clamped flatness 0.192 mm exceeds the 0.150 mm portfolio limit.
- Clamping adds 0.160 mm of apparent distortion.
- Human setup correction changed clamp-force scale from 1.000 to observed 1.200.

## Adjustment

**Set clamp-force scale 1.200 -> 0.720**

Part is acceptable unclamped but fails flatness while clamped; reduce clamp load and remeasure before machining.

The adjustment changes process-control state revision 0 -> 1; nominal design geometry and candidate identity remain unchanged.

## Verification observations

| Observation | Source | Evidence |
| --- | --- | --- |
| OBS-CLAMP-VERIFY-01 | metrology:fixture-cmm/clamped-vs-unclamped-plane-fit | unclamped flatness 0.033 mm; clamped 0.072 mm; clamp scale 0.720 |

**Verification:** restored

- Verification clamped flatness=0.072 mm.
- Clamp-induced delta=0.039 mm.

## What this demonstrates

- Comparing unclamped and clamped metrology separates incoming-part shape from fixture-induced distortion.
- A human setup correction can supersede stale controller/setup metadata without bypassing the same typed observation compiler.
- Clamp-force reduction is verified by a second clamped measurement before release.

## Limits

- This case study uses deterministic simulated observations to exercise process-diagnosis and recovery semantics; it is not physical-machine evidence.
- Thresholds and correction bounds are portfolio hypotheses and require machine/process-specific validation before production use.
- Human observations enter through the same typed compiler but remain observations, not privileged authority that can bypass evidence gates.
- Machine feedback is treated as evidence only when its declared measurement system is trusted; failed measurement-system studies block process compensation.
- Recovery verification checks the bounded scenario's declared response; unknown physical causes remain possible and require escalation when observations do not match the model.
