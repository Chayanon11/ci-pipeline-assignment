import request from "supertest";
import app from "./app.mjs";
import { blogPosts } from "./db/index.mjs";


// ทดสอบ endpoint หลัก "/"
describe("GET /", () => {
  it("should return Hello TechUp!", async () => {
    const res = await request(app).get("/");
    expect(res.statusCode).toBe(200);
    expect(res.text).toBe("Hello TechUp!");
  });
});

// ทดสอบการดึงรายการบทความ
describe("GET /posts", () => {

  // ทดสอบการแสดงรายการบทความพร้อมข้อมูลการแบ่งหน้า
  it("should return list of posts with pagination info", async () => {
    const res = await request(app).get("/posts");
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("posts");
    expect(res.body).toHaveProperty("totalPosts");
  });

    // ทดสอบการจัดการพารามิเตอร์สำหรับการแบ่งหน้า
  it("should handle pagination parameters", async () => {
    const res = await request(app).get("/posts?page=2&limit=3");
    expect(res.statusCode).toBe(200);
    expect(res.body.currentPage).toBe(2);
    expect(res.body.limit).toBe(3);
    expect(res.body.posts.length).toBeLessThanOrEqual(3);
  });

    // ทดสอบการกรองตามหมวดหมู่
  it("should handle category filter", async () => {
    const category = "Cat";
    const res = await request(app).get(`/posts?category=${category}`);
    expect(res.statusCode).toBe(200);
    res.body.posts.forEach(post => {
      expect(post.category.toLowerCase()).toBe(category.toLowerCase());
    });
  });

    // ทดสอบการค้นหาด้วยคำสำคัญ
  it("should handle keyword search", async () => {
    const keyword = "mindfulness";
    const res = await request(app).get(`/posts?keyword=${keyword}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.posts.length).toBeGreaterThan(0);
  });

    // ทดสอบการจัดการพารามิเตอร์การแบ่งหน้าที่ไม่ถูกต้อง
  it("should handle invalid pagination parameters", async () => {
    const res = await request(app).get("/posts?page=invalid");
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("message", "Invalid pagination parameters");
  });

    // ทดสอบการจัดการเมื่อหมายเลขหน้ามีค่าสูงเกินไป
  it("should handle very large pagination numbers", async () => {
    const res = await request(app).get("/posts?page=9999999999");
    expect(res.statusCode).toBe(500);
    expect(res.body).toHaveProperty("message", "Pagination values too large");
  });
});

// ทดสอบการดึงบทความตาม ID
describe("GET /posts/:id", () => {
    // ทดสอบการดึงบทความที่มีอยู่จริง
  it("should return a post if it exists", async () => {
    const res = await request(app).get("/posts/1");
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("id", 1);
  });

    // ทดสอบกรณีไม่พบบทความ
  it("should return 404 if post does not exist", async () => {
    const res = await request(app).get("/posts/99999");
    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty("error", "Blog post not found");
  });

   // ทดสอบกรณี ID ไม่ใช่ตัวเลข
  it("should handle non-numeric ID", async () => {
    const res = await request(app).get("/posts/invalid");
    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty("error");
  });
});

// ทดสอบการจัดการข้อผิดพลาดต่างๆ
describe("GET /posts error handling", () => {
  let originalFilter;
  const originalBlogPosts = [...blogPosts];
  
    // เตรียมข้อมูลก่อนการทดสอบแต่ละครั้ง
  beforeEach(() => {
    // Save original filter method
    originalFilter = Array.prototype.filter;
    // Restore original posts before each test
    while (blogPosts.length) blogPosts.pop();
    originalBlogPosts.forEach(post => blogPosts.push(post));
  });

    // คืนค่าเดิมหลังการทดสอบแต่ละครั้ง
  afterEach(() => {
    // Restore original filter method
    Array.prototype.filter = originalFilter;
  });

    // ทำความสะอาดข้อมูลหลังเสร็จการทดสอบทั้งหมด
  afterAll(() => {
    // Cleanup after all tests
    while (blogPosts.length) blogPosts.pop();
    originalBlogPosts.forEach(post => blogPosts.push(post));
  });

    // ทดสอบการจัดการข้อผิดพลาดของเซิร์ฟเวอร์
  it("should handle server errors gracefully", async () => {
    Array.prototype.filter = function() {
      throw new Error('Simulated error');
    };

    const res = await request(app).get("/posts?category=test");
    expect(res.statusCode).toBe(500);
    expect(res.body).toHaveProperty("message", "Simulated error");
  });

    // ทดสอบกรณีไม่พบผลลัพธ์จากการค้นหา
  it("should handle zero results with category and keyword", async () => {
    const res = await request(app)
      .get("/posts?category=NonExistent&keyword=ImpossibleToMatch");
    expect(res.statusCode).toBe(200);
    expect(res.body.posts).toHaveLength(0);
    expect(res.body.totalPages).toBe(0);
  });

    // ทดสอบการใช้ตัวกรองหมวดหมู่และคำค้นหาร่วมกัน
  it("should handle combined category and keyword filters", async () => {
    const category = "Technology";
    const keyword = "software"; 
    const res = await request(app)
      .get(`/posts?category=${category}&keyword=${keyword}`);
    expect(res.statusCode).toBe(200);
    if (res.body.posts.length > 0) {
      res.body.posts.forEach(post => {
        expect(post.category.toLowerCase()).toBe(category.toLowerCase());
        expect(
          post.title.toLowerCase().includes(keyword.toLowerCase()) ||
          post.description.toLowerCase().includes(keyword.toLowerCase()) ||
          post.content.toLowerCase().includes(keyword.toLowerCase()) ||
          post.category.toLowerCase().includes(keyword.toLowerCase())
        ).toBeTruthy();
      });
    }
  });

    // ทดสอบการจัดการค่าต่ำสุดของการจำกัดจำนวนผลลัพธ์
  it("should handle minimum limit value correctly", async () => {
    const res = await request(app).get("/posts?limit=0");
    expect(res.statusCode).toBe(200);
    expect(res.body.limit).toBe(6); 
    expect(Array.isArray(res.body.posts)).toBe(true);
    expect(res.body.posts.length).toBeLessThanOrEqual(6);
  });
});