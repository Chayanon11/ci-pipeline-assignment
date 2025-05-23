import express from "express";
import cors from "cors";
import { blogPosts } from "./db/index.mjs";
import helmet from "helmet";

const app = express();
const port = process.env.PORT || 4001;

// Security: Enhanced CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET'], // Only allow GET methods for this API
  optionsSuccessStatus: 200,
  credentials: false, // Security: Disable credentials
  maxAge: 86400 // Cache preflight response for 24 hours
};

// Security: Enhanced helmet configuration
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  frameguard: { action: 'deny' }
}));

app.use(cors(corsOptions));

// Security: Limit JSON payload size
app.use(express.json({ limit: '10mb' }));

// Remove X-Powered-By header
app.disable('x-powered-by');

// Security: Add request timeout
app.use((req, res, next) => {
  res.setTimeout(30000, () => {
    res.status(408).json({ error: 'Request timeout' });
  });
  next();
});

// Utility function for input validation
function validatePaginationParams(page, limit) {
  const errors = [];
  
  if (page !== undefined) {
    if (isNaN(Number(page)) || Number(page) < 1) {
      errors.push('Page must be a positive number');
    }
    if (Number(page) > 1000000) {
      errors.push('Page number too large');
    }
  }
  
  if (limit !== undefined) {
    if (isNaN(Number(limit)) || Number(limit) < 1) {
      errors.push('Limit must be a positive number');
    }
    if (Number(limit) > 100) {
      errors.push('Limit cannot exceed 100');
    }
  }
  
  return errors;
}

// Utility function for input sanitization
function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str.trim().toLowerCase();
}

app.get("/", (req, res) => {
  res.json({ 
    message: "Hello TechUp!",
    version: "1.0.0",
    timestamp: new Date().toISOString()
  });
});

app.get("/posts", (req, res) => {
  try {
    const { page, limit, category, keyword } = req.query;

    // First check for extremely large numbers that are still valid numbers
    if (page && !isNaN(Number(page)) && Number(page) > 1000000) {
      return res.status(400).json({
        error: "Pagination values too large"
      });
    }

    if (limit && !isNaN(Number(limit)) && Number(limit) > 1000000) {
      return res.status(400).json({
        error: "Pagination values too large"
      });
    }

    // Validate pagination parameters
    const validationErrors = validatePaginationParams(page, limit);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: "Invalid pagination parameters",
        details: validationErrors
      });
    }

    const numPage = Math.max(1, Number(page) || 1);
    const numLimit = Math.max(1, Math.min(100, Number(limit) || 6));

    let filteredPosts = [...blogPosts]; // Create a copy to avoid mutation

    // Filter by category with input sanitization
    if (category) {
      const sanitizedCategory = sanitizeString(category);
      if (sanitizedCategory) {
        filteredPosts = filteredPosts.filter(
          (post) => sanitizeString(post.category) === sanitizedCategory
        );
      }
    }

    // Search by keyword with input sanitization
    if (keyword) {
      const sanitizedKeyword = sanitizeString(keyword);
      if (sanitizedKeyword && sanitizedKeyword.length >= 2) { // Minimum 2 characters
        filteredPosts = filteredPosts.filter(
          (post) =>
            sanitizeString(post.title).includes(sanitizedKeyword) ||
            sanitizeString(post.description).includes(sanitizedKeyword) ||
            sanitizeString(post.content).includes(sanitizedKeyword) ||
            sanitizeString(post.category).includes(sanitizedKeyword)
        );
      } else if (keyword && keyword.trim().length < 2) {
        return res.status(400).json({
          error: "Keyword must be at least 2 characters long"
        });
      }
    }

    const startIndex = (numPage - 1) * numLimit;
    const endIndex = startIndex + numLimit;
    const totalPages = Math.ceil(filteredPosts.length / numLimit);

    const results = {
      totalPosts: filteredPosts.length,
      totalPages,
      currentPage: numPage,
      limit: numLimit,
      posts: filteredPosts.slice(startIndex, endIndex),
      hasNextPage: endIndex < filteredPosts.length,
      hasPreviousPage: startIndex > 0
    };

    if (results.hasNextPage) {
      results.nextPage = numPage + 1;
    }

    if (results.hasPreviousPage) {
      results.previousPage = numPage - 1;
    }

    return res.json(results);
  } catch (error) {
    console.error('Error in /posts endpoint:', error);
    return res.status(500).json({
      error: "Internal server error",
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
});

app.get("/posts/:id", (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ID parameter
    if (!id || isNaN(Number(id))) {
      return res.status(400).json({ 
        error: "Invalid post ID",
        message: "Post ID must be a valid number"
      });
    }

    const postId = parseInt(id, 10);
    
    // Security: Check for reasonable ID range
    if (postId < 1 || postId > 1000000) {
      return res.status(400).json({ 
        error: "Invalid post ID",
        message: "Post ID out of valid range"
      });
    }

    const post = blogPosts.find((post) => post.id === postId);

    if (!post) {
      return res.status(404).json({ 
        error: "Blog post not found",
        requestedId: postId
      });
    }

    // Return post with metadata
    res.json({
      ...post,
      requestedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in /posts/:id endpoint:', error);
    return res.status(500).json({
      error: "Internal server error",
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: "1.0.0"
  });
});

// Security: Handle 404 for undefined routes
app.use('*', (req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.originalUrl,
    method: req.method
  });
});

// Security: Global error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  
  if (error.message === 'Not allowed by CORS') {
    return res.status(403).json({
      error: 'CORS error',
      message: 'Origin not allowed'
    });
  }
  
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

export default app;