const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");

// 获取课程列表
router.get("/", async (req, res) => {
  try {
    const [courses] = await req.app.locals.db.query(
      "SELECT * FROM courses ORDER BY created_at DESC"
    );
    res.json({
      success: true,
      data: courses,
    });
  } catch (error) {
    console.error("获取课程列表失败:", error);
    res.status(500).json({
      success: false,
      message: "获取课程列表失败",
    });
  }
});

// 获取课程详情
router.get("/:id", async (req, res) => {
  try {
    const [course] = await req.app.locals.db.query(
      "SELECT * FROM courses WHERE id = ?",
      [req.params.id]
    );
    if (course.length === 0) {
      return res.status(404).json({
        success: false,
        message: "课程不存在",
      });
    }
    res.json({
      success: true,
      data: course[0],
    });
  } catch (error) {
    console.error("获取课程详情失败:", error);
    res.status(500).json({
      success: false,
      message: "获取课程详情失败",
    });
  }
});

// 购买课程
router.post("/:id/purchase", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "未登录",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    // 获取课程信息
    const [course] = await req.app.locals.db.query(
      "SELECT * FROM courses WHERE id = ?",
      [req.params.id]
    );

    if (course.length === 0) {
      return res.status(404).json({
        success: false,
        message: "课程不存在",
      });
    }

    // 创建订单
    const [orderResult] = await req.app.locals.db.query(
      "INSERT INTO orders (user_id, total_price, status) VALUES (?, ?, 'pending')",
      [userId, course[0].price]
    );

    // 创建用户课程记录
    await req.app.locals.db.query(
      "INSERT INTO user_courses (user_id, course_id, remaining_sessions) VALUES (?, ?, ?)",
      [userId, req.params.id, course[0].total_sessions]
    );

    res.json({
      success: true,
      data: {
        orderId: orderResult.insertId,
        courseId: req.params.id,
      },
    });
  } catch (error) {
    console.error("购买课程失败:", error);
    res.status(500).json({
      success: false,
      message: "购买课程失败",
    });
  }
});

// 获取用户的课程列表
router.get("/user/my-courses", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "未登录",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    const [userCourses] = await req.app.locals.db.query(
      `SELECT c.*, uc.remaining_sessions, uc.enrolled_at 
       FROM courses c 
       JOIN user_courses uc ON c.id = uc.course_id 
       WHERE uc.user_id = ?`,
      [userId]
    );

    res.json({
      success: true,
      data: userCourses,
    });
  } catch (error) {
    console.error("获取用户课程列表失败:", error);
    res.status(500).json({
      success: false,
      message: "获取用户课程列表失败",
    });
  }
});

module.exports = router;
