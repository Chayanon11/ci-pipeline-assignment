import request from "supertest";
import app from "./app.mjs";
import { blogPosts } from "./db/index.mjs";
import { jest } from '@jest/globals';

// Mock console.error to avoid noise in tests
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});

afterAll(() => {
  console.error = originalConsoleError;
});

describe("Security Headers", () => {
  it("should set security headers", async () => {
    const res = await request(app)
      .get("/")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it("should enforce CORS policy", async () => {
    const res = await request(app)
      .get("/")
      .set('Origin', 'http://malicious-site.com');
    
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('CORS error');
  });
});

describe("GET /", () => {
  it("should return structured response with metadata", async () => {
    const res = await request(app)
      .get("/")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("message", "Hello TechUp!");
    expect(res.body).toHaveProperty("version");
    expect(res.body).toHaveProperty("timestamp");
  });

  it("should return valid JSON", async () => {
    const res = await request(app)
      .get("/")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.type).toBe('application/json');
    expect(typeof res.body).toBe('object');
  });
});

describe("GET /health", () => {
  it("should return health status", async () => {
    const res = await request(app)
      .get("/health")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("status", "healthy");
    expect(res.body).toHaveProperty("timestamp");
    expect(res.body).toHaveProperty("uptime");
    expect(res.body).toHaveProperty("version");
  });
});

describe("GET /posts", () => {
  it("should return list of posts with pagination info", async () => {
    const res = await request(app)
      .get("/posts")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("posts");
    expect(res.body).toHaveProperty("totalPosts");
    expect(res.body).toHaveProperty("totalPages");
    expect(res.body).toHaveProperty("currentPage");
    expect(res.body).toHaveProperty("limit");
    expect(res.body).toHaveProperty("hasNextPage");
    expect(res.body).toHaveProperty("hasPreviousPage");
  });

  it("should handle pagination parameters correctly", async () => {
    const res = await request(app)
      .get("/posts?page=2&limit=3")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(200);
    expect(res.body.currentPage).toBe(2);
    expect(res.body.limit).toBe(3);
    expect(res.body.posts.length).toBeLessThanOrEqual(3);
  });

  it("should handle category filter with case insensitivity", async () => {
    const category = "CAT";
    const res = await request(app)
      .get(`/posts?category=${category}`)
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(200);
    if (res.body.posts.length > 0) {
      res.body.posts.forEach(post => {
        expect(post.category.toLowerCase()).toBe(category.toLowerCase());
      });
    }
  });

  it("should handle keyword search with minimum length validation", async () => {
    const keyword = "mindfulness";
    const res = await request(app)
      .get(`/posts?keyword=${keyword}`)
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.posts)).toBe(true);
  });

  it("should reject keywords that are too short", async () => {
    const res = await request(app)
      .get("/posts?keyword=a")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Keyword must be at least 2 characters long");
  });

  it("should handle invalid pagination parameters", async () => {
    const res = await request(app)
      .get("/posts?page=invalid&limit=abc")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Invalid pagination parameters");
    expect(res.body.details).toBeInstanceOf(Array);
  });

  it("should handle negative pagination values", async () => {
    const res = await request(app)
      .get("/posts?page=-1&limit=-5")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Invalid pagination parameters");
  });

  it("should handle very large pagination numbers", async () => {
    const res = await request(app)
      .get("/posts?page=2000000")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Pagination values too large");
  });

  it("should handle invalid pagination parameters", async () => {
    const res = await request(app)
      .get("/posts?page=invalid&limit=abc")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Invalid pagination parameters");
    expect(res.body.details).toBeInstanceOf(Array);
  });

  it("should limit page size to maximum allowed", async () => {
    const res = await request(app)
      .get("/posts?limit=200")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(400);
    expect(res.body.details).toContain("Limit cannot exceed 100");
  });

  it("should handle empty category filter", async () => {
    const res = await request(app)
      .get("/posts?category=")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(200);
    expect(res.body.posts.length).toBe(Math.min(6, blogPosts.length));
  });

  it("should handle empty keyword filter", async () => {
    const res = await request(app)
      .get("/posts?keyword=")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(200);
    expect(res.body.posts.length).toBe(Math.min(6, blogPosts.length));
  });

  it("should handle combined category and keyword filters", async () => {
    const res = await request(app)
      .get("/posts?category=General&keyword=mindfulness")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.posts)).toBe(true);
  });

  it("should return zero results for non-existent category", async () => {
    const res = await request(app)
      .get("/posts?category=NonExistentCategory")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(200);
    expect(res.body.posts).toHaveLength(0);
    expect(res.body.totalPosts).toBe(0);
  });

  it("should handle pagination beyond available pages", async () => {
    const res = await request(app)
      .get("/posts?page=999")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(200);
    expect(res.body.posts).toHaveLength(0);
    expect(res.body.currentPage).toBe(999);
  });

  it("should maintain data integrity (not mutate original array)", async () => {
    const originalLength = blogPosts.length;
    
    await request(app)
      .get("/posts?category=Test")
      .set('Origin', 'http://localhost:3000');
    
    expect(blogPosts.length).toBe(originalLength);
  });
});

describe("GET /posts/:id", () => {
  it("should return a post if it exists", async () => {
    const res = await request(app)
      .get("/posts/1")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("id", 1);
    expect(res.body).toHaveProperty("requestedAt");
  });

  it("should return 404 if post does not exist", async () => {
    const res = await request(app)
      .get("/posts/99999")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe("Blog post not found");
    expect(res.body.requestedId).toBe(99999);
  });

  it("should handle non-numeric ID", async () => {
    const res = await request(app)
      .get("/posts/invalid")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Invalid post ID");
  });

  it("should handle negative ID", async () => {
    const res = await request(app)
      .get("/posts/-1")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Invalid post ID");
  });

  it("should handle zero ID", async () => {
    const res = await request(app)
      .get("/posts/0")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Invalid post ID");
  });

  it("should handle extremely large ID", async () => {
    const res = await request(app)
      .get("/posts/9999999999")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Invalid post ID");
  });

  it("should handle empty ID", async () => {
    const res = await request(app)
      .get("/posts/")
      .set('Origin', 'http://localhost:3000');
    
    expect([200, 404]).toContain(res.statusCode);
    // The route /posts/ might match /posts endpoint instead of /posts/:id
  });

  it("should handle decimal ID", async () => {
    const res = await request(app)
      .get("/posts/1.5")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe(1); // parseInt should handle this
  });
});

describe("Error Handling", () => {
  it("should handle 404 for non-existent routes", async () => {
    const res = await request(app)
      .get("/non-existent-route")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe("Route not found");
    expect(res.body.path).toBe("/non-existent-route");
    expect(res.body.method).toBe("GET");
  });

  it("should handle different HTTP methods on undefined routes", async () => {
    const res = await request(app)
      .post("/non-existent")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(404);
    expect(res.body.method).toBe("POST");
  });

  // Test error handling in posts endpoint
  it("should handle server errors gracefully", async () => {
    // This test would need to mock an internal error
    // For now, we'll test the error response structure
    const res = await request(app)
      .get("/posts?page=NaN")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

describe("Input Validation and Sanitization", () => {
  it("should sanitize category input", async () => {
    const res = await request(app)
      .get("/posts?category=  GENERAL  ")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(200);
    // Should work with trimmed and lowercased input
  });

  it("should sanitize keyword input", async () => {
    const res = await request(app)
      .get("/posts?keyword=  MINDFULNESS  ")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(200);
    // Should work with trimmed and lowercased input
  });

  it("should handle special characters in search", async () => {
    const res = await request(app)
      .get("/posts?keyword=<script>alert('xss')</script>")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(200);
    expect(res.body.posts).toHaveLength(0); // Should not find anything
  });
});

describe("Performance and Edge Cases", () => {
  it("should handle concurrent requests", async () => {
    const requests = Array(5).fill().map(() => 
      request(app)
        .get("/posts")
        .set('Origin', 'http://localhost:3000')
    );
    
    const responses = await Promise.all(requests);
    responses.forEach(res => {
      expect(res.statusCode).toBe(200);
    });
  });

  it("should handle requests without origin header", async () => {
    const res = await request(app).get("/");
    expect(res.statusCode).toBe(200);
  });
});

describe("Data Integrity", () => {
  it("should not modify original blog posts array", async () => {
    const originalPosts = [...blogPosts];
    
    await request(app)
      .get("/posts?category=Test&keyword=search")
      .set('Origin', 'http://localhost:3000');
    
    expect(blogPosts).toEqual(originalPosts);
  });

  it("should return consistent data structure", async () => {
    const res = await request(app)
      .get("/posts")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.body).toMatchObject({
      totalPosts: expect.any(Number),
      totalPages: expect.any(Number),
      currentPage: expect.any(Number),
      limit: expect.any(Number),
      posts: expect.any(Array),
      hasNextPage: expect.any(Boolean),
      hasPreviousPage: expect.any(Boolean)
    });
  });
});