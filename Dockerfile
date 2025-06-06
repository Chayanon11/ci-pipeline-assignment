# Dockerfile สำหรับแอป Node.js ด้วย Express.js

# เริ่มต้นด้วย image พื้นฐานที่มี Node.js ติดตั้งไว้แล้ว
FROM node:18

# WORKDIR คือ directory หลักที่ container จะใช้เป็นพื้นที่ทำงาน (เหมือน cd /app)
# ถ้า directory ยังไม่มี มันจะถูกสร้างขึ้น
WORKDIR /app

# COPY package*.json ./ 
# คัดลอกไฟล์ package.json และ package-lock.json (ถ้ามี) ไปยัง WORKDIR ใน container
# ขั้นตอนนี้แยกออกจากการ copy โค้ดทั้งหมด เพื่อให้ Docker ใช้ cache ในการติดตั้ง dependencies ได้
COPY package*.json ./

# RUN npm install จะติดตั้ง dependencies ที่ระบุใน package.json
RUN npm install

# คัดลอกไฟล์ทั้งหมดจากเครื่องเรา (current directory) ไปไว้ใน WORKDIR ของ container
# รวมถึง source code เช่น app.js, route/, middleware/ หรือไฟล์อื่นที่ใช้รันแอป
COPY . .

# ระบุว่า container จะเปิดพอร์ต 4001 (แอป Express.js ของเราฟังอยู่ที่พอร์ตนี้)
# EXPOSE ไม่ได้เปิด port จริง ๆ แต่ใช้เป็น metadata เพื่อบอก Kubernetes หรือ Docker tools อื่น ๆ
EXPOSE 4001

# CMD เป็นคำสั่งสุดท้ายที่จะรันเมื่อ container เริ่มทำงาน
# ที่นี่เรารัน npm start → ซึ่งจะรัน script ใน package.json (start: "node server.js" หรือคล้ายกัน)
CMD ["npm", "start"]

