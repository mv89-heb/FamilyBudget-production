import assert from "node:assert/strict";
import test from "node:test";
import { isTransientDatabaseError, withDatabaseReadRetry } from "../lib/database-retry";

test("recognizes Prisma connection failures as transient", () => {
  assert.equal(isTransientDatabaseError({ code: "P1017", message: "Server has closed the connection" }), true);
  assert.equal(isTransientDatabaseError(new Error("Connection reset by peer")), true);
  assert.equal(isTransientDatabaseError(new Error("Error in PostgreSQL connection: Closed")), true);
  assert.equal(isTransientDatabaseError({ message: "outer", cause: { code: "P1001" } }), true);
});

test("does not classify validation and application errors as transient", () => {
  assert.equal(isTransientDatabaseError({ code: "P2002", message: "Unique constraint failed" }), false);
  assert.equal(isTransientDatabaseError(new Error("Invalid user input")), false);
});

test("retries a transient read and returns the successful result", async () => {
  let attempts = 0;
  const messages: string[] = [];

  const result = await withDatabaseReadRetry(
    "User.findMany",
    async () => {
      attempts += 1;
      if (attempts < 3) throw { code: "P1017", message: "Connection closed" };
      return ["ok"];
    },
    { delaysMs: [0, 0], onRetry: (message) => messages.push(message) },
  );

  assert.deepEqual(result, ["ok"]);
  assert.equal(attempts, 3);
  assert.equal(messages.length, 2);
});

test("does not retry non-transient errors", async () => {
  let attempts = 0;
  const expected = new Error("Invalid query");

  await assert.rejects(
    withDatabaseReadRetry(
      "User.findMany",
      async () => {
        attempts += 1;
        throw expected;
      },
      { delaysMs: [0, 0] },
    ),
    expected,
  );

  assert.equal(attempts, 1);
});

test("stops after the bounded retry budget", async () => {
  let attempts = 0;

  await assert.rejects(
    withDatabaseReadRetry(
      "User.findMany",
      async () => {
        attempts += 1;
        throw { code: "P1001", message: "Database unavailable" };
      },
      { delaysMs: [0, 0] },
    ),
    (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "P1001" && "message" in error && error.message === "Database unavailable"),
  );

  assert.equal(attempts, 3);
});
