require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");

// 打印环境变量，用于调试
console.log("Environment variables:", {
  WX_APPID: process.env.WX_APPID,
  DB_HOST: process.env.DB_HOST,
  NODE_ENV: process.env.NODE_ENV,
});

const app = express();

// 启用 CORS，允许所有来源访问
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

// 数据库连接配置
const pool = mysql.createPool({
  host: process.env.DB_HOST || "10.41.111.100",
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "Linfeng19960110",
  database: process.env.DB_DATABASE || "bunblebee",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// 检查数据库连接
pool.getConnection((err, connection) => {
  if (err) {
    console.error("Database connection error:", err);
  } else {
    console.log("Database connected successfully");
    connection.release();
  }
});

// 将数据库连接池添加到 app.locals
app.locals.db = pool.promise();

// 导入路由
const authRoutes = require("./routes/auth");

// 注册路由
app.use("/auth", authRoutes);

// 欢迎页面
app.get("/", (req, res) => {
  res.json({
    message: "Welcome to Bunblebee Backend Server",
    status: "running",
    timestamp: new Date().toISOString(),
    config: {
      wxAppId: process.env.WX_APPID,
      dbHost: process.env.DB_HOST,
    },
  });
});

// 测试数据库连接
app.get("/test-db", async (req, res) => {
  try {
    // 测试连接
    const [result] = await app.locals.db.query("SELECT 1 + 1 AS solution");

    // 获取数据库版本信息
    const [version] = await app.locals.db.query("SELECT VERSION() as version");

    // 获取当前数据库名
    const [database] = await app.locals.db.query(
      "SELECT DATABASE() as database_name"
    );

    res.json({
      status: "success",
      message: "Database connection successful",
      details: {
        solution: result[0].solution,
        version: version[0].version,
        database: database[0].database_name,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Database connection error:", error);
    res.status(500).json({
      status: "error",
      message: "Database connection failed",
      error: error.message,
    });
  }
});

// 健康检查接口
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "bunblebee-backend",
    environment: process.env.NODE_ENV || "development",
    config: {
      wxAppId: process.env.WX_APPID,
      dbHost: process.env.DB_HOST,
    },
  });
});

const PORT = process.env.PORT || 80;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Database host: ${process.env.DB_HOST || "10.41.111.100"}`);
  console.log(`WX_APPID: ${process.env.WX_APPID}`);
});
