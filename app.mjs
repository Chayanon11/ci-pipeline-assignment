import express from "express";
import cors from "cors";
import { blogPosts } from "./db/index.mjs";
import helmet from "helmet";

// สร้าง Express application
const app = express();
const port = process.env.PORT || 4001;

// การตั้งค่า CORS สำหรับความปลอดภัย
const corsOptions = {
  origin: function (origin, callback) {
    // อนุญาตให้ requests ที่ไม่มี origin (เช่น mobile apps หรือ curl)
    if (!origin) return callback(null, true);
    
    // รายการ origins ที่อนุญาต จาก environment variable หรือ default
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true); // อนุญาต
    } else {
      callback(new Error('Not allowed by CORS')); // ปฏิเสธ
    }
  },
  methods: ['GET'], // อนุญาตเฉพาะ GET methods สำหรับ API นี้
  optionsSuccessStatus: 200,
  credentials: false, // ปิดการส่ง credentials เพื่อความปลอดภัย
  maxAge: 86400 // cache preflight response เป็นเวลา 24 ชั่วโมง
};

// การตั้งค่า helmet สำหรับ security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"], // อนุญาตเฉพาะ same-origin
      scriptSrc: ["'self'"], // script จาก same-origin เท่านั้น
      styleSrc: ["'self'", "'unsafe-inline'"], // style จาก same-origin และ inline
      imgSrc: ["'self'", "data:", "https:"], // รูปภาพจาก same-origin, data URLs และ HTTPS
    },
  },
  hsts: {
    maxAge: 31536000, // HTTPS Strict Transport Security เป็นเวลา 1 ปี
    includeSubDomains: true, // รวม subdomains ด้วย
    preload: true // เพิ่มใน browser preload list
  },
  frameguard: { action: 'deny' } // ป้องกัน clickjacking โดยห้าม iframe
}));

app.use(cors(corsOptions));

// จำกัดขนาด JSON payload เพื่อป้องกัน DoS
app.use(express.json({ limit: '10mb' }));

// ลบ X-Powered-By header เพื่อไม่เปิดเผยข้อมูล server
app.disable('x-powered-by');

// เพิ่ม request timeout เพื่อป้องกัน slow loris attacks
app.use((req, res, next) => {
  res.setTimeout(30000, () => {
    res.status(408).json({ error: 'Request timeout' });
  });
  next();
});

// ฟังก์ชันตรวจสอบพารามิเตอร์การแบ่งหน้า (pagination)
function validatePaginationParams(page, limit) {
  const errors = [];
  
  if (page !== undefined) {
    if (isNaN(Number(page)) || Number(page) < 1) {
      errors.push('Page must be a positive number'); // หน้าต้องเป็นเลขบวก
    }
    if (Number(page) > 1000000) {
      errors.push('Page number too large'); // หน้าใหญ่เกินไป
    }
  }
  
  if (limit !== undefined) {
    if (isNaN(Number(limit)) || Number(limit) < 1) {
      errors.push('Limit must be a positive number'); // จำนวนต้องเป็นเลขบวก
    }
    if (Number(limit) > 100) {
      errors.push('Limit cannot exceed 100'); // จำกัดสูงสุด 100 รายการ
    }
  }
  
  return errors;
}

// ฟังก์ชันทำความสะอาดข้อความ (sanitization)
function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str.trim().toLowerCase(); // ตัดช่องว่างและแปลงเป็นตัวเล็ก
}

// Endpoint หลัก - หน้าแรกของ API
app.get("/", (req, res) => {
  res.json({ 
    message: "Hello TechUp!",
    version: "1.0.0",
    timestamp: new Date().toISOString() // เวลาปัจจุบัน
  });
});

// ฟังก์ชันกรองโพสต์ตามหมวดหมู่ (category)
function filterByCategory(posts, category) {
  if (!category) return posts; // ถ้าไม่มี category ให้คืนโพสต์ทั้งหมด
  
  const sanitizedCategory = sanitizeString(category);
  if (!sanitizedCategory) return posts;
  
  // กรองโพสต์ที่มี category ตรงกัน
  return posts.filter(
    (post) => sanitizeString(post.category) === sanitizedCategory
  );
}

// ฟังก์ชันกรองโพสต์ตามคำค้นหา (keyword)
function filterByKeyword(posts, keyword) {
  if (!keyword) return { filteredPosts: posts, error: null };
  
  const trimmedKeyword = keyword.trim();
  // ตรวจสอบความยาวคำค้นหา - ต้องมีอย่างน้อย 2 ตัวอักษร
  if (trimmedKeyword.length > 0 && trimmedKeyword.length < 2) {
    return { 
      filteredPosts: posts, 
      error: "Keyword must be at least 2 characters long" 
    };
  }
  
  const sanitizedKeyword = sanitizeString(keyword);
  if (!sanitizedKeyword || sanitizedKeyword.length < 2) {
    return { filteredPosts: posts, error: null };
  }
  
  // ค้นหาในหัวข้อ, รายละเอียด, เนื้อหา และหมวดหมู่
  const filtered = posts.filter(
    (post) =>
      sanitizeString(post.title).includes(sanitizedKeyword) ||
      sanitizeString(post.description).includes(sanitizedKeyword) ||
      sanitizeString(post.content).includes(sanitizedKeyword) ||
      sanitizeString(post.category).includes(sanitizedKeyword)
  );
  
  return { filteredPosts: filtered, error: null };
}

// ฟังก์ชันสร้างผลลัพธ์การแบ่งหน้า (pagination)
function createPaginationResult(posts, numPage, numLimit) {
  const startIndex = (numPage - 1) * numLimit; // ตำแหน่งเริ่มต้น
  const endIndex = startIndex + numLimit; // ตำแหน่งสิ้นสุด
  const totalPages = Math.ceil(posts.length / numLimit); // จำนวนหน้าทั้งหมด

  const results = {
    totalPosts: posts.length, // จำนวนโพสต์ทั้งหมด
    totalPages, // จำนวนหน้าทั้งหมด
    currentPage: numPage, // หน้าปัจจุบัน
    limit: numLimit, // จำนวนรายการต่อหน้า
    posts: posts.slice(startIndex, endIndex), // โพสต์ในหน้านี้
    hasNextPage: endIndex < posts.length, // มีหน้าถัดไปหรือไม่
    hasPreviousPage: startIndex > 0 // มีหน้าก่อนหน้าหรือไม่
  };

  // เพิ่มหมายเลขหน้าถัดไปถ้ามี
  if (results.hasNextPage) {
    results.nextPage = numPage + 1;
  }

  // เพิ่มหมายเลขหน้าก่อนหน้าถ้ามี
  if (results.hasPreviousPage) {
    results.previousPage = numPage - 1;
  }

  return results;
}

// Endpoint สำหรับดึงรายการโพสต์พร้อมการกรองและแบ่งหน้า
app.get("/posts", (req, res) => {
  try {
    const { page, limit, category, keyword } = req.query;

    // ตรวจสอบตัวเลขที่ใหญ่เกินไปแต่ยังเป็น valid number
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

    // ตรวจสอบพารามิเตอร์การแบ่งหน้า
    const validationErrors = validatePaginationParams(page, limit);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: "Invalid pagination parameters",
        details: validationErrors
      });
    }

    // กำหนดค่าหน้าและจำนวนรายการ (มีค่าต่ำสุดและสูงสุด)
    const numPage = Math.max(1, Number(page) || 1);
    const numLimit = Math.max(1, Math.min(100, Number(limit) || 6));

    // เริ่มต้นด้วยสำเนาของโพสต์ทั้งหมด
    let filteredPosts = [...blogPosts];

    // กรองตามหมวดหมู่
    filteredPosts = filterByCategory(filteredPosts, category);

    // กรองตามคำค้นหา
    const keywordResult = filterByKeyword(filteredPosts, keyword);
    if (keywordResult.error) {
      return res.status(400).json({
        error: keywordResult.error
      });
    }
    filteredPosts = keywordResult.filteredPosts;

    // สร้างและส่งผลลัพธ์การแบ่งหน้า
    const results = createPaginationResult(filteredPosts, numPage, numLimit);
    return res.json(results);

  } catch (error) {
    console.error('Error in /posts endpoint:', error);
    return res.status(500).json({
      error: "Internal server error",
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
});

// Endpoint สำหรับดึงโพสต์ตาม ID
app.get("/posts/:id", (req, res) => {
  try {
    const { id } = req.params;
    
    // ตรวจสอบว่า ID เป็นตัวเลขที่ถูกต้อง
    if (!id || isNaN(Number(id))) {
      return res.status(400).json({ 
        error: "Invalid post ID",
        message: "Post ID must be a valid number"
      });
    }

    const postId = parseInt(id, 10);
    
    // ตรวจสอบช่วงของ ID เพื่อความปลอดภัย
    if (postId < 1 || postId > 1000000) {
      return res.status(400).json({ 
        error: "Invalid post ID",
        message: "Post ID out of valid range"
      });
    }

    // ค้นหาโพสต์จาก ID
    const post = blogPosts.find((post) => post.id === postId);

    if (!post) {
      return res.status(404).json({ 
        error: "Blog post not found",
        requestedId: postId
      });
    }

    // ส่งโพสต์พร้อมข้อมูลเพิ่มเติม
    res.json({
      ...post,
      requestedAt: new Date().toISOString() // เวลาที่ขอข้อมูล
    });
  } catch (error) {
    console.error('Error in /posts/:id endpoint:', error);
    return res.status(500).json({
      error: "Internal server error",
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
});

// Endpoint สำหรับตรวจสอบสถานะเซิร์ฟเวอร์ (Health Check)
app.get("/health", (req, res) => {
  res.json({
    status: "healthy", // สถานะเซิร์ฟเวอร์
    timestamp: new Date().toISOString(), // เวลาปัจจุบัน
    uptime: process.uptime(), // เวลาที่เซิร์ฟเวอร์ทำงาน (วินาที)
    version: "1.0.0" // เวอร์ชันของ API
  });
});

// จัดการ 404 สำหรับ routes ที่ไม่มีอยู่
app.use('*', (req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.originalUrl, // path ที่ถูกขอ
    method: req.method // HTTP method ที่ใช้
  });
});

// จัดการข้อผิดพลาดแบบ global
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  
  // จัดการข้อผิดพลาด CORS โดยเฉพาะ
  if (error.message === 'Not allowed by CORS') {
    return res.status(403).json({
      error: 'CORS error',
      message: 'Origin not allowed'
    });
  }
  
  // ข้อผิดพลาดทั่วไป
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

export default app;