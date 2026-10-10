# Bore Drift Before Scrap

**Scenario:** bore-tool-wear-drift
**Claim level:** simulated process-recovery exercise, not physical-machine evidence
**Case digest:** sha256:e7457d7b30ef16bb88a1fe4bf8080558fdb7e1054c4046ade744c248ef6f1cd5

## Objective

Detect a trusted payload-bore size trend approaching the lower limit, apply a bounded finish-bore diameter correction, and verify recovery before release.

## Incoming observations

| Observation | Source | Kind | Evidence |
| --- | --- | --- | --- |
| OBS-BORE-TREND-01 | machine:machine-probe/in-process-bore-probe | dimensional-trend | IC-PAYLOAD-BORE-SIZE = [16.0100, 16.0085, 16.0070, 16.0050, 16.0030] mm; limits 16.0000..16.0180 |

## Diagnosis

**tool-wear-drift** — evidence quality: **sufficient**

- Bore series decreased from 16.010 to 16.003 mm.
- Last measurement is 0.003 mm above the lower specification limit.
- Measurement system machine-probe is currently trusted.

## Adjustment

**Adjust T3.finish-bore diameter correction by +0.0060 mm**

Trusted bore trend is monotonically approaching the lower size limit; apply a bounded diameter correction and remeasure before release.

The adjustment changes process-control state revision 0 -> 1; nominal design geometry and candidate identity remain unchanged.

## Verification observations

| Observation | Source | Evidence |
| --- | --- | --- |
| OBS-BORE-VERIFY-01 | machine:machine-probe/in-process-bore-probe | IC-PAYLOAD-BORE-SIZE = [16.0075, 16.0080, 16.0090, 16.0095, 16.0085] mm; limits 16.0000..16.0180 |

**Verification:** restored

- Post-adjustment bore range=0.0020 mm.
- All verification measurements are within size limits.

## What this demonstrates

- Trusted in-process dimensional feedback can trigger a bounded tool-diameter correction before a feature crosses its size limit.
- The correction is applied to process-control state rather than changing nominal design geometry.
- Post-adjustment measurements must independently demonstrate recovery.

## Limits

- This case study uses deterministic simulated observations to exercise process-diagnosis and recovery semantics; it is not physical-machine evidence.
- Thresholds and correction bounds are portfolio hypotheses and require machine/process-specific validation before production use.
- Human observations enter through the same typed compiler but remain observations, not privileged authority that can bypass evidence gates.
- Machine feedback is treated as evidence only when its declared measurement system is trusted; failed measurement-system studies block process compensation.
- Recovery verification checks the bounded scenario's declared response; unknown physical causes remain possible and require escalation when observations do not match the model.
