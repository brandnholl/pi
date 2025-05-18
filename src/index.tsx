import { Hono } from "hono";
import { jsx } from "hono/jsx";

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

// API endpoint for raw pi digits
app.get("/api/pi", async (c) => {
  console.log("API endpoint called with query params:", c.req.query());
  
  const start = parseInt(c.req.query("start") || "0", 10);
  const length = parseInt(c.req.query("length") || "500", 10);

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

// Server-side rendered UI as the root route
app.get("/", async (c) => {
  console.log("Root route accessed, preparing server-side rendering");
  
  // Start with a much smaller initial chunk to avoid memory issues
  const initialDigits = await getPiDigits(c.env, 0, 500) || "";
  console.log(`Initial digits length for SSR: ${initialDigits.length}`);
  
  // Fallback to hardcoded pi digits if we couldn't fetch from R2
  const piDigits = initialDigits || "3.1415926535897932384626433832795028841971693993751058209749445923078164062862089986280348253421170679";
  
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
            font-family: monospace;
            background-color: #f5f5f5;
            overflow-y: auto;
            height: 100vh;
          }
          .container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }
          #pi-container {
            font-size: 24px;
            letter-spacing: 2px;
            line-height: 1.5;
            text-align: center;
            max-width: 80%;
            word-wrap: break-word;
            margin-bottom: 100vh; /* Add space at the bottom to enable scrolling */
          }
          #loading-indicator {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background-color: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 10px 20px;
            border-radius: 20px;
            font-size: 14px;
            display: none;
          }
        `}</style>
      </head>
      <body>
        <div class="container">
          <div id="pi-container">{piDigits}</div>
          <div id="loading-indicator">Loading more digits...</div>
        </div>
        
        <script>{`
          const piContainer = document.getElementById('pi-container');
          const loadingIndicator = document.getElementById('loading-indicator');
          let currentPosition = ${piDigits.length};
          const chunkSize = 200; // Much smaller chunk size to avoid memory issues
          let isLoading = false;
          
          async function fetchMorePiDigits() {
            console.log("Fetching more digits starting at position:", currentPosition);
            try {
              loadingIndicator.style.display = 'block';
              const response = await fetch(\`/api/pi?start=\${currentPosition}&length=\${chunkSize}\`);
              if (!response.ok) {
                console.error('Response not OK:', response.status, response.statusText);
                throw new Error('Failed to fetch pi digits');
              }
              const digits = await response.text();
              console.log(\`Received \${digits.length} more digits\`);
              loadingIndicator.style.display = 'none';
              return digits;
            } catch (error) {
              console.error('Error fetching more pi digits:', error);
              loadingIndicator.style.display = 'none';
              return '';
            }
          }
          
          async function appendDigits() {
            if (isLoading) return;
            isLoading = true;
            
            try {
              const digits = await fetchMorePiDigits();
              if (digits && digits.length > 0) {
                console.log(\`Appending \${digits.length} digits to display\`);
                piContainer.textContent += digits;
                currentPosition += digits.length;
                
                // Schedule next fetch after a short delay
                setTimeout(appendDigits, 1000);
              } else {
                console.log('No more digits returned, retrying in 3 seconds');
                setTimeout(appendDigits, 3000);
              }
            } catch (error) {
              console.error('Error appending digits:', error);
              setTimeout(appendDigits, 3000);
            } finally {
              isLoading = false;
            }
          }
          
          // Start streaming additional digits after a delay
          console.log("Initial render complete, starting to stream more digits");
          setTimeout(appendDigits, 1000);
          
          // Make sure the page is scrollable initially
          document.body.style.height = '200vh';
        `}</script>
      </body>
    </html>
  );
});

export default app;
