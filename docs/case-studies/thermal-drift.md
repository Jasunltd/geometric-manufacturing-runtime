# Thermal Bias Corrected from In-Process Feedback

**Scenario:** thermal-drift
**Claim level:** simulated process-recovery exercise, not physical-machine evidence
**Case digest:** sha256:809ee097177a3c5d248e181cf5b04ff0bc6efae71d41d6f0f9fac316cf327771

## Objective

Use trusted machine temperature and in-process positional feedback to apply a bounded work-offset correction and verify the residual bias.

## Incoming observations

| Observation | Source | Kind | Evidence |
| --- | --- | --- | --- |
| OBS-THERMAL-01 | machine:machine-probe/thermal-fiducial-probe | thermal-drift | X bias 0.043 mm; temperature 22.0 -> 31.0 C |

## Diagnosis

**thermal-drift** — evidence quality: **sufficient**

- Machine temperature changed by 9.0 C.
- Measured X bias=0.043 mm.
- Measurement system machine-probe is trusted.

## Adjustment

**Apply X thermal work-offset -0.0430 mm**

Trusted in-process measurement shows correlated thermal bias; apply the equal-and-opposite bounded work-offset correction and remeasure.

The adjustment changes process-control state revision 0 -> 1; nominal design geometry and candidate identity remain unchanged.

## Verification observations

| Observation | Source | Evidence |
| --- | --- | --- |
| OBS-THERMAL-VERIFY-01 | machine:machine-probe/thermal-fiducial-probe | X bias 0.006 mm; temperature 22.0 -> 31.5 C |

**Verification:** restored

- Residual measured bias=0.006 mm.

## What this demonstrates

- Trusted machine/metrology feedback can drive a bounded thermal work-offset correction without changing canonical geometry.
- The correction is equal-and-opposite to the observed bias and remains explicit in process-control state.
- Residual bias must be remeasured after compensation.

## Limits

- This case study uses deterministic simulated observations to exercise process-diagnosis and recovery semantics; it is not physical-machine evidence.
- Thresholds and correction bounds are portfolio hypotheses and require machine/process-specific validation before production use.
- Human observations enter through the same typed compiler but remain observations, not privileged authority that can bypass evidence gates.
- Machine feedback is treated as evidence only when its declared measurement system is trusted; failed measurement-system studies block process compensation.
- Recovery verification checks the bounded scenario's declared response; unknown physical causes remain possible and require escalation when observations do not match the model.
