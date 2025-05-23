// security-middleware.mjs
// ไฟล์ middleware สำหรับการรักษาความปลอดภัย
import rateLimit from 'express-rate-limit';

// การกำหนดค่า Rate Limiting เพื่อป้องกันการโจมตี DDoS
export const createRateLimit = () => {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 นาที (ช่วงเวลาสำหรับการนับ request)
    max: 100, // จำกัด IP แต่ละตัวไม่เกิน 100 requests ต่อ 15 นาที
    message: {
      error: 'Too many requests from this IP', // ข้อความแจ้งเตือนเมื่อเกินขีดจำกัด
      retryAfter: '15 minutes' // แจ้งเวลาที่ควรลองใหม่
    },
    standardHeaders: true, // ส่ง standard rate limit headers
    legacyHeaders: false, // ไม่ส่ง legacy headers เพื่อความปลอดภัย
    handler: (req, res) => {
      // ฟังก์ชันจัดการเมื่อเกินขีดจำกัด rate limit
      res.status(429).json({
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil(req.rateLimit.resetTime / 1000) // เวลาที่เหลือจนจะ reset (วินาที)
      });
    }
  });
};

// Middleware สำหรับการตรวจสอบและทำความสะอาด input
export const validateInput = (req, res, next) => {
  // ทำความสะอาด query parameters เพื่อป้องกัน XSS
  if (req.query) {
    Object.keys(req.query).forEach(key => {
      if (typeof req.query[key] === 'string') {
        // ลบ script tags และ javascript code ที่อันตราย
        req.query[key] = req.query[key]
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // ลบ <script> tags
          .replace(/javascript:/gi, '') // ลบ javascript: protocol
          .replace(/on\w+\s*=/gi, ''); // ลบ event handlers เช่น onclick, onload
      }
    });
  }
  
  // ตรวจสอบ Content-Type สำหรับ POST requests
  if (req.method === 'POST' && req.headers['content-type']) {
    if (!req.headers['content-type'].includes('application/json')) {
      return res.status(400).json({
        error: 'Invalid content type',
        message: 'Content-Type must be application/json' // ต้องเป็น JSON เท่านั้น
      });
    }
  }
  
  next(); // ดำเนินการต่อไปยัง middleware ถัดไป
};

// Middleware สำหรับตั้งค่า Security Headers
export const securityHeaders = (req, res, next) => {
  // ป้องกัน Clickjacking attacks
  res.setHeader('X-Frame-Options', 'DENY'); // ห้ามแสดงเว็บไซต์ใน frame/iframe
  
  // ป้องกันการ MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff'); // บังคับให้ browser ใช้ MIME type ที่ระบุเท่านั้น
  
  // เปิดใช้งาน XSS Protection ของ browser
  res.setHeader('X-XSS-Protection', '1; mode=block'); // บล็อกหน้าเว็บหากตรวจพบ XSS
  
  // กำหนด Referrer Policy เพื่อความปลอดภัยของข้อมูล
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin'); // ส่ง referrer เฉพาะ same-origin หรือ HTTPS
  
  // จำกัดการเข้าถึง browser APIs ที่อันตราย
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()'); // ห้ามใช้ location, mic, camera
  
  next(); // ดำเนินการต่อไปยัง middleware ถัดไป
};