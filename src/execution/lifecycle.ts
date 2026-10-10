import { assign, setup } from "xstate";
import type { Digest } from "../model.js";

export interface ExecutionLifecycleContext {
  readonly programDigest: Digest | null;
  readonly planDigest: Digest | null;
  readonly commitId: string | null;
  readonly activeBarrierId: string | null;
  readonly lastObservationDigest: Digest | null;
  readonly receiptDigest: Digest | null;
  readonly refusalReason: string | null;
}

export type ExecutionLifecycleEvent =
  | { readonly type: "COMPILED"; readonly programDigest: Digest }
  | { readonly type: "PLANNED"; readonly planDigest: Digest }
  | { readonly type: "COMMIT"; readonly commitId: string }
  | { readonly type: "START" }
  | { readonly type: "BARRIER"; readonly barrierId: string }
  | { readonly type: "OBSERVED"; readonly observationDigest: Digest }
  | { readonly type: "RESUME" }
  | { readonly type: "COMPLETE"; readonly receiptDigest: Digest }
  | { readonly type: "REFUSE"; readonly reason: string }
  | { readonly type: "ABORT"; readonly reason: string };

const executionLifecycle = setup({
  types: {
    context: {} as ExecutionLifecycleContext,
    events: {} as ExecutionLifecycleEvent,
  },
  guards: {
    hasProgram: ({ context }) => context.programDigest !== null,
    hasPlan: ({ context }) => context.planDigest !== null,
    hasCommit: ({ context }) => context.commitId !== null,
    hasBarrier: ({ context }) => context.activeBarrierId !== null,
    hasObservation: ({ context }) => context.lastObservationDigest !== null,
  },
  actions: {
    captureProgram: assign({
      programDigest: ({ event }) =>
        event.type === "COMPILED" ? event.programDigest : null,
      planDigest: () => null,
      commitId: () => null,
      activeBarrierId: () => null,
      lastObservationDigest: () => null,
      receiptDigest: () => null,
      refusalReason: () => null,
    }),
    capturePlan: assign({
      planDigest: ({ event }) =>
        event.type === "PLANNED" ? event.planDigest : null,
      commitId: () => null,
      activeBarrierId: () => null,
      lastObservationDigest: () => null,
      receiptDigest: () => null,
      refusalReason: () => null,
    }),
    captureCommit: assign({
      commitId: ({ event }) =>
        event.type === "COMMIT" ? event.commitId : null,
      refusalReason: () => null,
    }),
    captureBarrier: assign({
      activeBarrierId: ({ event }) =>
        event.type === "BARRIER" ? event.barrierId : null,
      lastObservationDigest: () => null,
    }),
    captureObservation: assign({
      lastObservationDigest: ({ event }) =>
        event.type === "OBSERVED" ? event.observationDigest : null,
    }),
    clearBarrier: assign({
      activeBarrierId: () => null,
    }),
    captureReceipt: assign({
      receiptDigest: ({ event }) =>
        event.type === "COMPLETE" ? event.receiptDigest : null,
    }),
    captureRefusal: assign({
      refusalReason: ({ event }) =>
        event.type === "REFUSE" || event.type === "ABORT"
          ? event.reason
          : null,
    }),
  },
}).createMachine({
  id: "geometric-manufacturing-execution",
  initial: "draft",
  context: {
    programDigest: null,
    planDigest: null,
    commitId: null,
    activeBarrierId: null,
    lastObservationDigest: null,
    receiptDigest: null,
    refusalReason: null,
  },
  states: {
    draft: {
      on: {
        COMPILED: {
          target: "compiled",
          actions: "captureProgram",
        },
        REFUSE: {
          target: "refused",
          actions: "captureRefusal",
        },
      },
    },
    compiled: {
      on: {
        PLANNED: {
          guard: "hasProgram",
          target: "ready",
          actions: "capturePlan",
        },
        REFUSE: {
          target: "refused",
          actions: "captureRefusal",
        },
      },
    },
    ready: {
      on: {
        COMMIT: {
          guard: "hasPlan",
          target: "committed",
          actions: "captureCommit",
        },
        REFUSE: {
          target: "refused",
          actions: "captureRefusal",
        },
      },
    },
    committed: {
      on: {
        START: {
          guard: "hasCommit",
          target: "executing",
        },
        ABORT: {
          target: "aborted",
          actions: "captureRefusal",
        },
      },
    },
    executing: {
      on: {
        BARRIER: {
          target: "awaitingObservation",
          actions: "captureBarrier",
        },
        COMPLETE: {
          target: "completed",
          actions: "captureReceipt",
        },
        ABORT: {
          target: "aborted",
          actions: "captureRefusal",
        },
      },
    },
    awaitingObservation: {
      on: {
        OBSERVED: {
          guard: "hasBarrier",
          target: "pausedAfterObservation",
          actions: "captureObservation",
        },
        ABORT: {
          target: "aborted",
          actions: "captureRefusal",
        },
      },
    },
    pausedAfterObservation: {
      on: {
        RESUME: {
          guard: "hasObservation",
          target: "executing",
          actions: "clearBarrier",
        },
        ABORT: {
          target: "aborted",
          actions: "captureRefusal",
        },
      },
    },
    completed: {
      type: "final",
    },
    refused: {
      type: "final",
    },
    aborted: {
      type: "final",
    },
  },
});

export const executionLifecycleMachine = executionLifecycle;
