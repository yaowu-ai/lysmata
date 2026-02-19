import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => c.json({ message: "Hello from Hono Sidecar!" }));
app.get("/ping", (c) => c.json({ data: "pong" }));
app.post("/add", async (c) => {
  const { a, b } = await c.req.json();
  return c.json({ result: a + b });
});

const port = Number(process.env.PORT) || 3000;

Bun.serve({
  port,
  hostname: "127.0.0.1",
  fetch: app.fetch,
});

console.info(`Hono Sidecar running on http://127.0.0.1:${port}`);

export default app;
