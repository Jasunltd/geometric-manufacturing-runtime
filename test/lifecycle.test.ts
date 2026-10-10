import assert from "node:assert/strict";
import test from "node:test";
import { createActor } from "xstate";
import { executionLifecycleMachine } from "../src/index.js";
import type { Digest } from "../src/model.js";

const d = (char: string): Digest =>
  `sha256:${char.repeat(64)}`;

test("execution lifecycle crosses an explicit observation barrier", () => {
  const actor = createActor(executionLifecycleMachine);
  actor.start();

  actor.send({ type: "START" });
  assert.equal(actor.getSnapshot().value, "draft");

  actor.send({ type: "COMPILED", programDigest: d("a") });
  assert.equal(actor.getSnapshot().value, "compiled");

  actor.send({ type: "PLANNED", planDigest: d("b") });
  assert.equal(actor.getSnapshot().value, "ready");

  actor.send({ type: "COMMIT", commitId: "commit-1" });
  assert.equal(actor.getSnapshot().value, "committed");

  actor.send({ type: "START" });
  assert.equal(actor.getSnapshot().value, "executing");

  actor.send({ type: "BARRIER", barrierId: "probe-1" });
  assert.equal(actor.getSnapshot().value, "awaitingObservation");

  actor.send({ type: "RESUME" });
  assert.equal(actor.getSnapshot().value, "awaitingObservation");

  actor.send({ type: "OBSERVED", observationDigest: d("c") });
  assert.equal(actor.getSnapshot().value, "pausedAfterObservation");

  actor.send({ type: "RESUME" });
  assert.equal(actor.getSnapshot().value, "executing");

  actor.send({ type: "COMPLETE", receiptDigest: d("d") });
  const snapshot = actor.getSnapshot();
  assert.equal(snapshot.value, "completed");
  assert.equal(snapshot.context.receiptDigest, d("d"));
  actor.stop();
});
