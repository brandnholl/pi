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
      <title>Pi Digits</title>
      <style>
        body {
          font-family: monospace;
          margin: 0;
          padding: 0;
          background-color: white;
          color: black;
          display: flex;
          justify-content: center;
          align-items: flex-start;
          min-height: 100vh;
          overflow-x: hidden;
        }
        #pi-container {
          padding: 20px;
          font-size: 16px;
          line-height: 1.5;
          max-width: 100%;
          text-align: center;
          margin-top: 20px;
        }
        #pi-digits {
          word-wrap: break-word;
          white-space: pre-wrap;
        }
      </style>
    </head>
    <body>
      <div id="pi-container">
        <span id="pi-digits">3.</span>
      </div>
      
      <script>
        const piDigitsElement = document.getElementById('pi-digits');
        
        let currentPosition = 1; // Start after the decimal point (3.)
        const chunkSize = 5000; // Larger chunk size for prefetching
        const prefetchThreshold = 3; // Number of chunks to prefetch ahead
        let isLoading = false;
        let hasMoreDigits = true;
        let prefetchedDigits = '';
        let nextFetchPosition = 1;
        
        // Load more digits
        async function fetchMoreDigits(position, length) {
          try {
            const response = await fetch(\`/pi?start=\${position}&length=\${length}\`);
            
            if (!response.ok) {
              throw new Error('Failed to fetch Pi digits');
            }
            
            const digits = await response.text();
            
            if (digits.length === 0) {
              hasMoreDigits = false;
              return '';
            }
            
            return digits;
          } catch (error) {
            console.error('Error loading Pi digits:', error);
            return '';
          }
        }
        
        // Prefetch digits in advance
        async function prefetchDigits() {
          if (!hasMoreDigits || isLoading) return;
          
          isLoading = true;
          
          try {
            const newDigits = await fetchMoreDigits(nextFetchPosition, chunkSize);
            prefetchedDigits += newDigits;
            nextFetchPosition += newDigits.length;
            
            // Continue prefetching if we need more
            if (prefetchedDigits.length < chunkSize * prefetchThreshold && hasMoreDigits) {
              setTimeout(prefetchDigits, 100);
            }
          } finally {
            isLoading = false;
          }
        }
        
        // Add digits to the display
        function addDigitsToDisplay() {
          if (prefetchedDigits.length > 0) {
            // Take a portion of the prefetched digits
            const digitsToAdd = prefetchedDigits.substring(0, chunkSize);
            prefetchedDigits = prefetchedDigits.substring(chunkSize);
            
            piDigitsElement.textContent += digitsToAdd;
            currentPosition += digitsToAdd.length;
            
            // Trigger more prefetching if our buffer is getting low
            if (prefetchedDigits.length < chunkSize * prefetchThreshold && !isLoading) {
              prefetchDigits();
            }
          }
        }
        
        // Check if we need to load more digits when scrolling
        function checkScroll() {
          const scrollPosition = window.innerHeight + window.scrollY;
          const bodyHeight = document.body.offsetHeight;
          
          // Load more when user scrolls near the bottom (300px threshold)
          if (scrollPosition >= bodyHeight - 300) {
            addDigitsToDisplay();
          }
        }
        
        // Start prefetching immediately
        prefetchDigits();
        
        // Initial display after a short delay to allow prefetching to start
        setTimeout(() => {
          addDigitsToDisplay();
        }, 100);
        
        // Add scroll event listener
        window.addEventListener('scroll', checkScroll);
        
        // Also check periodically in case the page is taller than the viewport
        setInterval(() => {
          if (document.body.offsetHeight <= window.innerHeight * 1.5 && prefetchedDigits.length > 0) {
            addDigitsToDisplay();
          }
        }, 200);
      </script>
    </body>
    </html>
  `);
});

export default app;
