import { createAdapter } from "./client-adapter.js";
import { createServer } from "./server.js";
import { parseTransportMode, startStdio, startHttp } from "./transport.js";

async function main(): Promise<void> {
  const adapter = createAdapter();
  const server = createServer(adapter);
  const mode = parseTransportMode(process.argv);

  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  if (mode === "http") {
    const port = parseInt(process.env.PORT ?? "3000", 10);
    await startHttp(server, port);
  } else {
    await startStdio(server);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
