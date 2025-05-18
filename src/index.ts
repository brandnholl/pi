import { Hono } from "hono";

type Bindings = {
  PI: R2Bucket;
};

const app = new Hono<{ Bindings: Bindings }>();

// Function to get pi digits using streaming with smaller chunks
async function getPiDigits(env: Bindings, start: number, length: number) {
  console.log(`Fetching pi digits from ${start} to ${start + length}`);
  
  try {
    // Limit the maximum chunk size to avoid memory issues
    const safeLength = Math.min(length, 1000);
    
    const object = await env.PI.get("pi-billion.txt", {
      range: {
        offset: start,
        length: safeLength
      }
    });
    
    if (!object) {
      console.error("π file not found in R2 bucket");
      return null;
    }
    
    console.log("Successfully retrieved pi file slice from R2");
    const slice = await object.text();
    console.log(`Returning slice of length: ${slice.length}`);
    return slice;
  } catch (error) {
    console.error("Error fetching pi digits:", error);
    return null;
  }
}

// Simple API endpoint for pi digits
app.get("/pi", async (c) => {
  console.log("Pi endpoint called with query params:", c.req.query());
  
  const start = parseInt(c.req.query("start") || "0", 10);
  const length = parseInt(c.req.query("length") || "10", 10);

  if (isNaN(start) || isNaN(length) || start < 0 || length > 10_000) {
    console.error(`Invalid query parameters: start=${start}, length=${length}`);
    return c.text("Invalid query", 400);
  }

  const digits = await getPiDigits(c.env, start, length);
  if (!digits) {
    return c.text("π file not found", 404);
  }

  return c.text(digits, 200, {
    "Content-Type": "text/plain",
    "Cache-Control": "public, max-age=86400",
  });
});

export default app;
