# Engineering contracts

> Start with the [portfolio overview](../README.md) or the [documentation map](../docs/README.md) before reading these implementation contracts.

These contracts specialize the owner's Agent Workbench engineering doctrine for
this repository. They have **no execution or research authority**.

The current architecture is v0.2:

- `PUBLIC-API-v0.2.md` — current bounded public semantic surface.
- `DESIGN-CONTRACT-v0.2.md` — current source-of-truth and ownership rules.
- `CODE-CONTRACT-v0.2.md` — TypeScript/Effect/XState/build123d/controller rules.
- `INTEGRATION-CONTRACT-v0.2.md` — frontend, geometry, FEA, manufacturing,
  controller, and future physical-execution seams.
- `deep-module-*-v2.json` — current deep-module budgets, including the state/action search, controller-verification, manufacturing-dossier, and observation/recovery surfaces.

The v0.1 contracts remain frozen historical evidence for the original
tool-generated-geometry / measured-tool late-binding spike. They are still
tested where their subsystem remains public, but they are not the primary
v0.2 design authority.

Governing patterns remain:

- small stable interfaces hiding coherent complexity;
- one semantic owner per concept;
- open input compiled before trusted policy;
- exhaustive tagged semantic alternatives;
- typed expected failures;
- mechanisms/projections are non-authoritative;
- tests at stable public seams;
- independent/falsifying checks for consequential calculations.