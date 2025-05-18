import { Hono } from "hono";
import { jsx } from "hono/jsx";

type Bindings = {
  PI: R2Bucket;
};

const app = new Hono<{ Bindings: Bindings }>();

// Function to get pi digits using streaming
async function getPiDigits(env: Bindings, start: number, length: number) {
  console.log(`Fetching pi digits from ${start} to ${start + length}`);
  
  try {
    const object = await env.PI.get("pi-billion.txt", {
      range: {
        offset: start,
        length: length
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

// API endpoint for raw pi digits
app.get("/api/pi", async (c) => {
  console.log("API endpoint called with query params:", c.req.query());
  
  const start = parseInt(c.req.query("start") || "0", 10);
  const length = parseInt(c.req.query("length") || "1000", 10);

  if (isNaN(start) || isNaN(length) || start < 0 || length > 10_000_000) {
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

// Server-side rendered UI as the root route
app.get("/", async (c) => {
  console.log("Root route accessed, preparing server-side rendering");
  
  // Get initial pi digits for server-side rendering (smaller chunk to avoid memory issues)
  const initialDigits = await getPiDigits(c.env, 0, 2000) || "";
  console.log(`Initial digits length for SSR: ${initialDigits.length}`);
  
  return c.html(
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Pi Digits</title>
        <style>{`
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
        `}</style>
      </head>
      <body>
        <div id="pi-container">{initialDigits}</div>
        
        <script>{`
          const piContainer = document.getElementById('pi-container');
          let currentPosition = ${initialDigits.length};
          const chunkSize = 500; // Smaller chunk size to avoid memory issues
          
          async function fetchMorePiDigits() {
            console.log("Fetching more digits starting at position:", currentPosition);
            try {
              const response = await fetch(\`/api/pi?start=\${currentPosition}&length=\${chunkSize}\`);
              if (!response.ok) {
                console.error('Response not OK:', response.status, response.statusText);
                throw new Error('Failed to fetch pi digits');
              }
              const digits = await response.text();
              console.log(\`Received \${digits.length} more digits\`);
              return digits;
            } catch (error) {
              console.error('Error fetching more pi digits:', error);
              return '';
            }
          }
          
          async function streamPiDigits() {
            console.log("Streaming more pi digits...");
            try {
              const digits = await fetchMorePiDigits();
              if (digits && digits.length > 0) {
                console.log(\`Appending \${digits.length} digits to display\`);
                piContainer.textContent += digits;
                currentPosition += digits.length;
                
                // Auto-scroll to keep recent digits visible
                window.scrollTo(0, document.body.scrollHeight);
                
                // Continue streaming after a short delay
                setTimeout(streamPiDigits, 1000);
              } else {
                console.log('No more digits returned, stopping stream');
              }
            } catch (error) {
              console.error('Error in streamPiDigits:', error);
            }
          }
          
          // Start streaming additional digits after a delay
          console.log("Initial render complete, will start streaming more digits soon");
          setTimeout(streamPiDigits, 2000);
        `}</script>
      </body>
    </html>
  );
});

export default app;
