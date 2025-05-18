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
    const safeLength = Math.min(length, 100_000);
    
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

  if (isNaN(start) || isNaN(length) || start < 0 || length > 100_000) {
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
        const chunkSize = 100000; // Larger chunk size for prefetching
        const prefetchThreshold = 10; // Number of chunks to prefetch ahead
        let isLoading = false;
        let hasMoreDigits = true;
        let prefetchedDigits = '';
        let nextFetchPosition = 1;
        let prefetchQueue = [];
        
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
        
        // Start multiple prefetch requests in parallel
        function startPrefetching() {
          // Clear existing queue
          prefetchQueue = [];
          
          // Start multiple prefetch requests
          for (let i = 0; i < prefetchThreshold; i++) {
            const fetchPosition = nextFetchPosition + (i * chunkSize);
            const promise = fetchMoreDigits(fetchPosition, chunkSize)
              .then(digits => {
                if (digits.length > 0) {
                  prefetchedDigits += digits;
                  return digits.length;
                }
                return 0;
              });
            
            prefetchQueue.push(promise);
          }
          
          // When all prefetches complete, update the next fetch position
          Promise.all(prefetchQueue)
            .then(results => {
              const totalFetched = results.reduce((sum, length) => sum + length, 0);
              nextFetchPosition += totalFetched;
              
              // If we still have room for more prefetching, continue
              if (hasMoreDigits && prefetchedDigits.length < chunkSize * prefetchThreshold) {
                setTimeout(startPrefetching, 0);
              }
            });
        }
        
        // Add digits to the display
        function addDigitsToDisplay() {
          if (prefetchedDigits.length > 0) {
            // Take a portion of the prefetched digits
            const displayChunkSize = Math.min(chunkSize, prefetchedDigits.length);
            const digitsToAdd = prefetchedDigits.substring(0, displayChunkSize);
            prefetchedDigits = prefetchedDigits.substring(displayChunkSize);
            
            piDigitsElement.textContent += digitsToAdd;
            currentPosition += digitsToAdd.length;
            
            // Trigger more prefetching if our buffer is getting low
            if (prefetchedDigits.length < chunkSize * (prefetchThreshold / 2) && prefetchQueue.length === 0 && hasMoreDigits) {
              startPrefetching();
            }
          }
        }
        
        // Check if we need to load more digits when scrolling
        function checkScroll() {
          const scrollPosition = window.innerHeight + window.scrollY;
          const bodyHeight = document.body.offsetHeight;
          
          // Load more when user scrolls near the bottom (500px threshold)
          if (scrollPosition >= bodyHeight - 500) {
            addDigitsToDisplay();
          }
        }
        
        // Start prefetching immediately
        startPrefetching();
        
        // Initial display after a short delay to allow prefetching to start
        setTimeout(() => {
          addDigitsToDisplay();
        }, 50);
        
        // Add scroll event listener with throttling to improve performance
        let scrollTimeout;
        window.addEventListener('scroll', () => {
          if (!scrollTimeout) {
            scrollTimeout = setTimeout(() => {
              checkScroll();
              scrollTimeout = null;
            }, 50);
          }
        });
        
        // Also check periodically in case the page is taller than the viewport
        setInterval(() => {
          if (document.body.offsetHeight <= window.innerHeight * 2 && prefetchedDigits.length > 0) {
            addDigitsToDisplay();
          }
          
          // If we're running low on prefetched digits, start more prefetching
          if (prefetchedDigits.length < chunkSize * (prefetchThreshold / 2) && prefetchQueue.length === 0 && hasMoreDigits) {
            startPrefetching();
          }
        }, 100);
      </script>
    </body>
    </html>
  `);
});

export default app;
