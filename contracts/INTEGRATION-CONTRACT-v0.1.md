# Cross-lane integration contract v0.1

Status: initial bounded composition seam.  
Authority: none.

The runtime is intended to compose with the existing Manufacturing CI Research Program lanes without taking ownership of their semantics.

## Mechanical / structural evidence

The mechanical lane may supply an `EngineeringEvidenceBinding` containing:

- exact research-pack/evidence digest;
- exact subject/design revision digest;
- requirement IDs relevant to this manufacturing program;
- declared limitations.

The geometric runtime records this identity. It does not reinterpret FEA, load cases, tolerance validity, or production approval.

## Cyber-physical / operational evidence

The cyber-physical lane may project current machine/tool/setup observations into `gmr.physical-state/v1` at a boundary.

A `CyberPhysicalEvidenceBinding` additionally records the exact upstream evidence/StateMap digest and source identity. The runtime still requires its own typed physical-state snapshot and refuses stale/mismatched input.

The cyber-physical system retains ownership of freshness semantics, grants, leases, fencing, and execution authority.

## Full-system trace

`buildFullSystemTrace` binds:

```text
engineering evidence identity
        +
canonical manufacturing program / geometry
        +
late-bound execution plan
        +
cyber-physical evidence identity
        +
optional execution observation identity
        =
content-addressed FullSystemTrace
```

The trace proves composition/provenance only. It does not upgrade any input's epistemic or execution authority.

## Compatibility rule

Repos exchange versioned, content-addressed boundary records. They do not import each other's internal mutable state or infer identity from local paths.
