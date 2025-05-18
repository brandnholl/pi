import { Hono } from "hono";
type Bindings = {
  PI: R2Bucket;
};
const app = new Hono<{ Bindings: Bindings }>();

app.get("/api/pi", async (c) => {
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

// Web UI as the root route
app.get("/", (c) => {
  const html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      body {
        margin: 0;
        padding: 0;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        font-family: monospace;
        background-color: #f5f5f5;
        overflow: hidden;
      }
      #pi-container {
        font-size: 24px;
        letter-spacing: 2px;
        line-height: 1.5;
        text-align: center;
        max-width: 80%;
        word-wrap: break-word;
      }
    </style>
  </head>
  <body>
    <div id="pi-container"></div>
    
    <script>
      const piContainer = document.getElementById('pi-container');
      let currentPosition = 0;
      const chunkSize = 1000;
      
      async function fetchPiDigits(start, length) {
        try {
          const response = await fetch(\`/api/pi?start=\${start}&length=\${length}\`);
          if (!response.ok) throw new Error('Failed to fetch pi digits');
          return await response.text();
        } catch (error) {
          console.error('Error fetching pi digits:', error);
          return '';
        }
      }
      
      async function streamPiDigits() {
        const digits = await fetchPiDigits(currentPosition, chunkSize);
        if (digits) {
          piContainer.textContent += digits;
          currentPosition += chunkSize;
          
          // Auto-scroll to keep recent digits visible
          window.scrollTo(0, document.body.scrollHeight);
          
          // Continue streaming after a short delay
          setTimeout(streamPiDigits, 1000);
        }
      }
      
      // Start streaming
      streamPiDigits();
    </script>
  </body>
  </html>
  `;
  
  return c.html(html);
});

export default app;
