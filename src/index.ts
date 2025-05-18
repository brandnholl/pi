import { Hono } from "hono";
type Bindings = {
  PI: R2Bucket;
};
const app = new Hono<{ Bindings: Bindings }>();

app.get("/", async (c) => {
  const start = parseInt(c.req.query("start") || "0", 10);
  const length = parseInt(c.req.query("length") || "1000", 10);

  if (isNaN(start) || isNaN(length) || start < 0 || length > 10_000_000) {
    return c.text("Invalid query", 400);
  }

  const object = await c.env.PI.get("pi-billion.txt");
  if (!object) return c.text("π file not found", 404);

  const full = await object.text();
  const slice = full.slice(start, start + length);
  return c.text(slice, 200, {
    "Content-Type": "text/plain",
    "Cache-Control": "public, max-age=86400",
  });
});

export default app;
