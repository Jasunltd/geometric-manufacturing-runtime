# Chatter Traced to Actual Tool Stickout

**Scenario:** chatter-excessive-stickout
**Claim level:** simulated process-recovery exercise, not physical-machine evidence
**Case digest:** sha256:9222ff8ced160ef6c4106b109df9bf80721de71f9ff8ed8ed24f86c2772cce38

## Objective

Combine machine vibration with a human correction to stale tool-stickout metadata, shorten the profile tool, and verify stable cutting.

## Incoming observations

| Observation | Source | Kind | Evidence |
| --- | --- | --- | --- |
| OBS-VIBRATION-01 | machine:accelerometer/spindle-vibration | vibration | T4.profile chatter index 1.36; RMS 4.80 g |
| OBS-STICKOUT-HUMAN-01 | human:machinist-01/machinist | human-correction | tool-stickout-mm corrected 30.000 -> 42.000; Measured from holder face to cutter tip after the loaded assembly did not match the setup metadata. |

## Diagnosis

**chatter-excessive-stickout** — evidence quality: **sufficient**

- Machine chatter index=1.36.
- Human correction establishes actual stickout=42.0 mm rather than controller metadata=30.0 mm.
- Stickout/diameter ratio=4.20 (>3).

## Adjustment

**Set T4.profile stickout 42.0 -> 28.0 mm**

Measured stickout exceeds 3x diameter while vibration shows chatter; shorten the tool first, then re-run the cut.

The adjustment changes process-control state revision 0 -> 1; nominal design geometry and candidate identity remain unchanged.

## Verification observations

| Observation | Source | Evidence |
| --- | --- | --- |
| OBS-VIBRATION-VERIFY-01 | machine:accelerometer/spindle-vibration | T4.profile chatter index 0.56; RMS 1.70 g |

**Verification:** restored

- Verification chatter index=0.56.
- RMS acceleration=1.70 g.

## What this demonstrates

- Machine vibration establishes the process symptom while a human setup observation establishes the actual stickout needed for diagnosis.
- The preferred correction reduces tool stickout before changing feeds/speeds when geometric clearance permits.
- A second vibration observation verifies whether the stability problem was actually removed.

## Limits

- This case study uses deterministic simulated observations to exercise process-diagnosis and recovery semantics; it is not physical-machine evidence.
- Thresholds and correction bounds are portfolio hypotheses and require machine/process-specific validation before production use.
- Human observations enter through the same typed compiler but remain observations, not privileged authority that can bypass evidence gates.
- Machine feedback is treated as evidence only when its declared measurement system is trusted; failed measurement-system studies block process compensation.
- Recovery verification checks the bounded scenario's declared response; unknown physical causes remain possible and require escalation when observations do not match the model.
