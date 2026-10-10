# Bad Measurement System Blocks Compensation

**Scenario:** gage-rr-failure
**Claim level:** simulated process-recovery exercise, not physical-machine evidence
**Case digest:** sha256:eadcc32a15488c77bb8be8d8b4bc05066fe7f8750f8f4e1c4952a4ca5578db99

## Objective

Reject machining compensation when the bore measurement system fails GR&R, quarantine the gauge, and verify measurement-system recovery separately.

## Incoming observations

| Observation | Source | Kind | Evidence |
| --- | --- | --- | --- |
| OBS-GRR-FAIL-01 | metrology:bore-gage-cmm/crossed-gage-rr | gage-rr | bore-gage-cmm %GRR 38.0%; ndc 3.0 |

## Diagnosis

**measurement-system-inadequate** — evidence quality: **measurement-system-untrusted**

- %GRR=38.0%.
- ndc=3.0.
- Do not use this measurement system to drive tool/process compensation.

## Adjustment

**Quarantine measurement system bore-gage-cmm**

Measurement system variation is too large for trusted compensation decisions; quarantine it before adjusting the machining process.

The adjustment changes process-control state revision 0 -> 1; nominal design geometry and candidate identity remain unchanged.

## Verification observations

| Observation | Source | Evidence |
| --- | --- | --- |
| OBS-GRR-VERIFY-01 | metrology:bore-gage-cmm/crossed-gage-rr-after-fixture-and-procedure-correction | bore-gage-cmm %GRR 8.7%; ndc 7.0 |

**Verification:** measurement-system-restored

- Verification %GRR=8.7%.
- Verification ndc=7.0.
- Measurement system can be considered for release after quality approval; machining compensation remains unchanged.

## What this demonstrates

- A failed gage R&R blocks machining compensation instead of allowing bad measurement data to steer the process.
- The measurement system is quarantined and the process is held while its measurement capability is restored.
- A passing follow-up study supports release consideration but does not silently alter the machining process.

## Limits

- This case study uses deterministic simulated observations to exercise process-diagnosis and recovery semantics; it is not physical-machine evidence.
- Thresholds and correction bounds are portfolio hypotheses and require machine/process-specific validation before production use.
- Human observations enter through the same typed compiler but remain observations, not privileged authority that can bypass evidence gates.
- Machine feedback is treated as evidence only when its declared measurement system is trusted; failed measurement-system studies block process compensation.
- Recovery verification checks the bounded scenario's declared response; unknown physical causes remain possible and require escalation when observations do not match the model.
