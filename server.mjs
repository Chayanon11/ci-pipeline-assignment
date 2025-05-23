import app from "./app.mjs";

// Cloud Run ใช้ PORT environment variable, fallback เป็น 4001 สำหรับ local
const port = process.env.PORT || 4001;

// Bind กับ 0.0.0.0 เพื่อให้ Cloud Run เข้าถึงได้
app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running at port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});