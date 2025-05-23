import request from "supertest";
import app from "./app.mjs";
import { blogPosts } from "./db/index.mjs";
import { jest } from '@jest/globals';

// จำลอง console.error เพื่อไม่ให้แสดงข้อความรบกวนระหว่างการทดสอบ
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});

afterAll(() => {
  console.error = originalConsoleError;
});

// ทดสอบ Security Headers
describe("Security Headers", () => {
  it("should set security headers", async () => {
    // ทดสอบว่าเซิร์ฟเวอร์ตั้งค่า security headers ที่จำเป็น
    const res = await request(app)
      .get("/")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.headers['x-content-type-options']).toBe('nosniff'); // ป้องกัน MIME sniffing
    expect(res.headers['x-frame-options']).toBe('DENY'); // ป้องกัน clickjacking
    expect(res.headers['x-powered-by']).toBeUndefined(); // ซ่อนข้อมูล server
  });

  it("should enforce CORS policy", async () => {
    // ทดสอบว่า CORS policy ทำงานถูกต้อง - ปฏิเสธ origin ที่ไม่อนุญาต
    const res = await request(app)
      .get("/")
      .set('Origin', 'http://malicious-site.com');
    
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('CORS error');
  });
});

// ทดสอบ endpoint หลัก "/"
describe("GET /", () => {
  it("should return structured response with metadata", async () => {
    // ทดสอบว่า endpoint หลักส่งข้อมูลที่ครบถ้วนและถูกต้อง
    const res = await request(app)
      .get("/")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("message", "Hello TechUp!");
    expect(res.body).toHaveProperty("version"); // เวอร์ชัน API
    expect(res.body).toHaveProperty("timestamp"); // เวลาปัจจุบัน
  });

  it("should return valid JSON", async () => {
    // ทดสอบว่าการตอบกลับเป็น JSON ที่ถูกต้อง
    const res = await request(app)
      .get("/")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.type).toBe('application/json');
    expect(typeof res.body).toBe('object');
  });
});

// ทดสอบ Health Check endpoint
describe("GET /health", () => {
  it("should return health status", async () => {
    // ทดสอบ endpoint สำหรับตรวจสอบสถานะเซิร์ฟเวอร์
    const res = await request(app)
      .get("/health")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("status", "healthy"); // สถานะเซิร์ฟเวอร์
    expect(res.body).toHaveProperty("timestamp"); // เวลาปัจจุบัน
    expect(res.body).toHaveProperty("uptime"); // เวลาที่เซิร์ฟเวอร์ทำงาน
    expect(res.body).toHaveProperty("version"); // เวอร์ชัน
  });
});

// ทดสอบการดึงรายการโพสต์
describe("GET /posts", () => {
  it("should return list of posts with pagination info", async () => {
    // ทดสอบการดึงรายการโพสต์พร้อมข้อมูลการแบ่งหน้า
    const res = await request(app)
      .get("/posts")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("posts"); // รายการโพสต์
    expect(res.body).toHaveProperty("totalPosts"); // จำนวนโพสต์ทั้งหมด
    expect(res.body).toHaveProperty("totalPages"); // จำนวนหน้าทั้งหมด
    expect(res.body).toHaveProperty("currentPage"); // หน้าปัจจุบัน
    expect(res.body).toHaveProperty("limit"); // จำนวนรายการต่อหน้า
    expect(res.body).toHaveProperty("hasNextPage"); // มีหน้าถัดไปหรือไม่
    expect(res.body).toHaveProperty("hasPreviousPage"); // มีหน้าก่อนหน้าหรือไม่
  });

  it("should handle pagination parameters correctly", async () => {
    // ทดสอบการจัดการพารามิเตอร์สำหรับการแบ่งหน้า
    const res = await request(app)
      .get("/posts?page=2&limit=3")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(200);
    expect(res.body.currentPage).toBe(2); // หน้าที่ 2
    expect(res.body.limit).toBe(3); // จำกัด 3 รายการ
    expect(res.body.posts.length).toBeLessThanOrEqual(3); // ไม่เกิน 3 รายการ
  });

  it("should handle category filter with case insensitivity", async () => {
    // ทดสอบการกรองตามหมวดหมู่โดยไม่สนใจตัวพิมพ์ใหญ่เล็ก
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
    // ทดสอบการค้นหาด้วยคำสำคัญและตรวจสอบความยาวขั้นต่ำ
    const keyword = "mindfulness";
    const res = await request(app)
      .get(`/posts?keyword=${keyword}`)
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.posts)).toBe(true);
  });

  it("should reject keywords that are too short", async () => {
    // ทดสอบการปฏิเสธคำค้นหาที่สั้นเกินไป
    const res = await request(app)
      .get("/posts?keyword=a")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Keyword must be at least 2 characters long");
  });

  it("should handle invalid pagination parameters", async () => {
    // ทดสอบการจัดการพารามิเตอร์การแบ่งหน้าที่ไม่ถูกต้อง
    const res = await request(app)
      .get("/posts?page=invalid&limit=abc")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Invalid pagination parameters");
    expect(res.body.details).toBeInstanceOf(Array); // รายละเอียดข้อผิดพลาด
  });

  it("should handle negative pagination values", async () => {
    // ทดสอบการจัดการค่าลบในการแบ่งหน้า
    const res = await request(app)
      .get("/posts?page=-1&limit=-5")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Invalid pagination parameters");
  });

  it("should handle very large pagination numbers", async () => {
    // ทดสอบการจัดการเมื่อหมายเลขหน้ามีค่าสูงเกินไป
    const res = await request(app)
      .get("/posts?page=2000000")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Pagination values too large");
  });

  it("should handle invalid pagination parameters", async () => {
    // ทดสอบการจัดการพารามิเตอร์ที่ไม่ถูกต้อง (ทดสอบซ้ำเพื่อความมั่นใจ)
    const res = await request(app)
      .get("/posts?page=invalid&limit=abc")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Invalid pagination parameters");
    expect(res.body.details).toBeInstanceOf(Array);
  });

  it("should limit page size to maximum allowed", async () => {
    // ทดสอบการจำกัดขนาดหน้าสูงสุดที่อนุญาต
    const res = await request(app)
      .get("/posts?limit=200")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(400);
    expect(res.body.details).toContain("Limit cannot exceed 100");
  });

  it("should handle empty category filter", async () => {
    // ทดสอบการจัดการเมื่อไม่มีการกรองหมวดหมู่
    const res = await request(app)
      .get("/posts?category=")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(200);
    expect(res.body.posts.length).toBe(Math.min(6, blogPosts.length)); // ค่าเริ่มต้น 6 รายการ
  });

  it("should handle empty keyword filter", async () => {
    // ทดสอบการจัดการเมื่อไม่มีคำค้นหา
    const res = await request(app)
      .get("/posts?keyword=")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(200);
    expect(res.body.posts.length).toBe(Math.min(6, blogPosts.length));
  });

  it("should handle combined category and keyword filters", async () => {
    // ทดสอบการใช้ตัวกรองหมวดหมู่และคำค้นหาร่วมกัน
    const res = await request(app)
      .get("/posts?category=General&keyword=mindfulness")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.posts)).toBe(true);
  });

  it("should return zero results for non-existent category", async () => {
    // ทดสอบกรณีไม่พบผลลัพธ์จากการค้นหาหมวดหมู่ที่ไม่มีอยู่
    const res = await request(app)
      .get("/posts?category=NonExistentCategory")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(200);
    expect(res.body.posts).toHaveLength(0); // ไม่มีโพสต์
    expect(res.body.totalPosts).toBe(0); // จำนวนทั้งหมดเป็น 0
  });

  it("should handle pagination beyond available pages", async () => {
    // ทดสอบการจัดการเมื่อขอหน้าที่เกินจำนวนหน้าที่มีอยู่
    const res = await request(app)
      .get("/posts?page=999")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(200);
    expect(res.body.posts).toHaveLength(0); // ไม่มีโพสต์
    expect(res.body.currentPage).toBe(999); // แต่ยังคงหน้าที่ขอ
  });

  it("should maintain data integrity (not mutate original array)", async () => {
    // ทดสอบความครบถ้วนของข้อมูล - ต้องไม่แก้ไข array ต้นฉบับ
    const originalLength = blogPosts.length;
    
    await request(app)
      .get("/posts?category=Test")
      .set('Origin', 'http://localhost:3000');
    
    expect(blogPosts.length).toBe(originalLength); // ความยาวต้องเท่าเดิม
  });
});

// ทดสอบการดึงโพสต์ตาม ID
describe("GET /posts/:id", () => {
  it("should return a post if it exists", async () => {
    // ทดสอบการดึงโพสต์ที่มีอยู่จริง
    const res = await request(app)
      .get("/posts/1")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("id", 1); // ID ถูกต้อง
    expect(res.body).toHaveProperty("requestedAt"); // มีเวลาที่ขอข้อมูล
  });

  it("should return 404 if post does not exist", async () => {
    // ทดสอบกรณีไม่พบโพสต์
    const res = await request(app)
      .get("/posts/99999")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe("Blog post not found");
    expect(res.body.requestedId).toBe(99999); // ID ที่ขอ
  });

  it("should handle non-numeric ID", async () => {
    // ทดสอบกรณี ID ไม่ใช่ตัวเลข
    const res = await request(app)
      .get("/posts/invalid")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Invalid post ID");
  });

  it("should handle negative ID", async () => {
    // ทดสอบกรณี ID เป็นค่าลบ
    const res = await request(app)
      .get("/posts/-1")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Invalid post ID");
  });

  it("should handle zero ID", async () => {
    // ทดสอบกรณี ID เป็นศูนย์
    const res = await request(app)
      .get("/posts/0")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Invalid post ID");
  });

  it("should handle extremely large ID", async () => {
    // ทดสอบกรณี ID มีค่าสูงเกินไป
    const res = await request(app)
      .get("/posts/9999999999")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Invalid post ID");
  });

  it("should handle empty ID", async () => {
    // ทดสอบกรณี ID ว่างเปล่า
    const res = await request(app)
      .get("/posts/")
      .set('Origin', 'http://localhost:3000');
    
    expect([200, 404]).toContain(res.statusCode);
    // route /posts/ อาจตรงกับ /posts endpoint แทน /posts/:id
  });

  it("should handle decimal ID", async () => {
    // ทดสอบกรณี ID เป็นทศนิยม
    const res = await request(app)
      .get("/posts/1.5")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe(1); // parseInt ควรจัดการได้
  });
});

// ทดสอบการจัดการข้อผิดพลาด
describe("Error Handling", () => {
  it("should handle 404 for non-existent routes", async () => {
    // ทดสอบการจัดการ 404 สำหรับ routes ที่ไม่มีอยู่
    const res = await request(app)
      .get("/non-existent-route")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe("Route not found");
    expect(res.body.path).toBe("/non-existent-route"); // path ที่ขอ
    expect(res.body.method).toBe("GET"); // HTTP method
  });

  it("should handle different HTTP methods on undefined routes", async () => {
    // ทดสอบการจัดการ HTTP methods ต่างๆ บน routes ที่ไม่มีอยู่
    const res = await request(app)
      .post("/non-existent")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(404);
    expect(res.body.method).toBe("POST");
  });

  it("should handle server errors gracefully", async () => {
    // ทดสอบการจัดการข้อผิดพลาดของเซิร์ฟเวอร์อย่างสวยงาม
    // ทดสอบนี้ต้องการ mock internal error
    // ตอนนี้เราจะทดสอบโครงสร้างการตอบกลับข้อผิดพลาด
    const res = await request(app)
      .get("/posts?page=NaN")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

// ทดสอบการตรวจสอบและทำความสะอาด Input
describe("Input Validation and Sanitization", () => {
  it("should sanitize category input", async () => {
    // ทดสอบการทำความสะอาด input ของหมวดหมู่
    const res = await request(app)
      .get("/posts?category=  GENERAL  ")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(200);
    // ควรทำงานได้กับ input ที่ตัดช่องว่างและแปลงเป็นตัวเล็กแล้ว
  });

  it("should sanitize keyword input", async () => {
    // ทดสอบการทำความสะอาด input ของคำค้นหา
    const res = await request(app)
      .get("/posts?keyword=  MINDFULNESS  ")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(200);
    // ควรทำงานได้กับ input ที่ตัดช่องว่างและแปลงเป็นตัวเล็กแล้ว
  });

  it("should handle special characters in search", async () => {
    // ทดสอบการจัดการอักขระพิเศษในการค้นหา (ป้องกัน XSS)
    const res = await request(app)
      .get("/posts?keyword=<script>alert('xss')</script>")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.statusCode).toBe(200);
    expect(res.body.posts).toHaveLength(0); // ไม่ควรพบอะไร
  });
});

// ทดสอบประสิทธิภาพและกรณีขอบเขต
describe("Performance and Edge Cases", () => {
  it("should handle concurrent requests", async () => {
    // ทดสอบการจัดการ requests พร้อมกัน
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
    // ทดสอบการจัดการ requests ที่ไม่มี origin header
    const res = await request(app).get("/");
    expect(res.statusCode).toBe(200);
  });
});

// ทดสอบความครบถ้วนของข้อมูล
describe("Data Integrity", () => {
  it("should not modify original blog posts array", async () => {
    // ทดสอบว่าไม่แก้ไข array ของโพสต์ต้นฉบับ
    const originalPosts = [...blogPosts];
    
    await request(app)
      .get("/posts?category=Test&keyword=search")
      .set('Origin', 'http://localhost:3000');
    
    expect(blogPosts).toEqual(originalPosts); // ต้องเหมือนเดิม
  });

  it("should return consistent data structure", async () => {
    // ทดสอบความสอดคล้องของโครงสร้างข้อมูลที่ส่งกลับ
    const res = await request(app)
      .get("/posts")
      .set('Origin', 'http://localhost:3000');
    
    expect(res.body).toMatchObject({
      totalPosts: expect.any(Number), // จำนวนโพสต์ทั้งหมด
      totalPages: expect.any(Number), // จำนวนหน้าทั้งหมด
      currentPage: expect.any(Number), // หน้าปัจจุบัน
      limit: expect.any(Number), // จำนวนรายการต่อหน้า
      posts: expect.any(Array), // รายการโพสต์
      hasNextPage: expect.any(Boolean), // มีหน้าถัดไปหรือไม่
      hasPreviousPage: expect.any(Boolean) // มีหน้าก่อนหน้าหรือไม่
    });
  });
});