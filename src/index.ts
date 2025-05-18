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

// Root route to serve the Pi digits UI
app.get("/", (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Pi Digits Viewer</title>
      <style>
        body {
          font-family: monospace;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f5f5f5;
        }
        h1 {
          text-align: center;
          color: #333;
        }
        #pi-container {
          background-color: white;
          padding: 20px;
          border-radius: 5px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          margin-top: 20px;
          font-size: 16px;
          line-height: 1.6;
          overflow-wrap: break-word;
          white-space: pre-wrap;
        }
        #loading {
          text-align: center;
          margin-top: 20px;
          color: #666;
        }
        .digit-group {
          display: inline-block;
          margin-right: 5px;
        }
        .decimal-point {
          color: red;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <h1>π Digits Viewer</h1>
      <div id="pi-container">
        <span class="decimal-point">3.</span><span id="pi-digits"></span>
      </div>
      <div id="loading">Loading more digits...</div>
      
      <script>
        const piDigitsElement = document.getElementById('pi-digits');
        const loadingElement = document.getElementById('loading');
        
        let currentPosition = 1; // Start after the decimal point (3.)
        const chunkSize = 1000;
        let isLoading = false;
        let hasMoreDigits = true;
        
        // Format digits with groups of 5 for better readability
        function formatDigits(digits) {
          let formatted = '';
          for (let i = 0; i < digits.length; i++) {
            if (i > 0 && i % 5 === 0) {
              formatted += ' ';
            }
            formatted += digits[i];
          }
          return formatted;
        }
        
        // Load more digits
        async function loadMoreDigits() {
          if (isLoading || !hasMoreDigits) return;
          
          isLoading = true;
          loadingElement.textContent = 'Loading more digits...';
          
          try {
            const response = await fetch(\`/pi?start=\${currentPosition}&length=\${chunkSize}\`);
            
            if (!response.ok) {
              throw new Error('Failed to fetch Pi digits');
            }
            
            const digits = await response.text();
            
            if (digits.length === 0) {
              hasMoreDigits = false;
              loadingElement.textContent = 'No more digits available';
              return;
            }
            
            piDigitsElement.innerHTML += formatDigits(digits);
            currentPosition += digits.length;
            
          } catch (error) {
            console.error('Error loading Pi digits:', error);
            loadingElement.textContent = 'Error loading digits. Scroll to try again.';
          } finally {
            isLoading = false;
          }
        }
        
        // Check if we need to load more digits when scrolling
        function checkScroll() {
          const scrollPosition = window.innerHeight + window.scrollY;
          const bodyHeight = document.body.offsetHeight;
          
          // Load more when user scrolls near the bottom (200px threshold)
          if (scrollPosition >= bodyHeight - 200 && !isLoading) {
            loadMoreDigits();
          }
        }
        
        // Initial load
        loadMoreDigits();
        
        // Add scroll event listener
        window.addEventListener('scroll', checkScroll);
        
        // Also check periodically in case the page is taller than the viewport
        setInterval(() => {
          if (document.body.offsetHeight <= window.innerHeight && !isLoading && hasMoreDigits) {
            loadMoreDigits();
          }
        }, 1000);
      </script>
    </body>
    </html>
  `);
});

export default app;
