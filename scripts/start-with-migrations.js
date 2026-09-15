const { spawn } = require("node:child_process");

const MAX_ATTEMPTS = 6;
const RETRY_DELAY_MS = 5000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "inherit", env: process.env });
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

async function main() {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    console.log(`[startup] prisma migrate deploy attempt ${attempt}/${MAX_ATTEMPTS}`);
    const code = await run("npx", ["prisma", "migrate", "deploy"]);
    if (code === 0) {
      console.log("[startup] migrations complete");
      const nextCode = await run("npx", ["next", "start"]);
      process.exit(nextCode);
    }

    if (attempt < MAX_ATTEMPTS) {
      console.warn(`[startup] migration failed with code ${code}; retrying in ${RETRY_DELAY_MS / 1000}s`);
      await sleep(RETRY_DELAY_MS);
    }
  }

  console.error("[startup] prisma migrations failed after all retries");
  process.exit(1);
}

main().catch((error) => {
  console.error("[startup] unexpected startup error", error);
  process.exit(1);
});
