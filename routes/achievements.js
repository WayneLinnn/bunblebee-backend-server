const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");

// 获取成就列表
router.get("/", async (req, res) => {
  try {
    const [achievements] = await req.app.locals.db.query(
      "SELECT * FROM achievements ORDER BY points DESC"
    );
    res.json({
      success: true,
      data: achievements,
    });
  } catch (error) {
    console.error("获取成就列表失败:", error);
    res.status(500).json({
      success: false,
      message: "获取成就列表失败",
    });
  }
});

// 获取用户成就列表
router.get("/user/my-achievements", async (req, res) => {
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

    const [userAchievements] = await req.app.locals.db.query(
      `SELECT a.*, ua.achieved_at 
       FROM achievements a 
       JOIN user_achievements ua ON a.id = ua.achievement_id 
       WHERE ua.user_id = ? 
       ORDER BY ua.achieved_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      data: userAchievements,
    });
  } catch (error) {
    console.error("获取用户成就列表失败:", error);
    res.status(500).json({
      success: false,
      message: "获取用户成就列表失败",
    });
  }
});

// 授予用户成就
router.post("/:id/award", async (req, res) => {
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

    // 检查成就是否存在
    const [achievement] = await req.app.locals.db.query(
      "SELECT * FROM achievements WHERE id = ?",
      [req.params.id]
    );

    if (achievement.length === 0) {
      return res.status(404).json({
        success: false,
        message: "成就不存在",
      });
    }

    // 检查用户是否已获得该成就
    const [existingAchievement] = await req.app.locals.db.query(
      "SELECT * FROM user_achievements WHERE user_id = ? AND achievement_id = ?",
      [userId, req.params.id]
    );

    if (existingAchievement.length > 0) {
      return res.status(400).json({
        success: false,
        message: "用户已获得该成就",
      });
    }

    // 授予成就
    await req.app.locals.db.query(
      "INSERT INTO user_achievements (user_id, achievement_id) VALUES (?, ?)",
      [userId, req.params.id]
    );

    res.json({
      success: true,
      message: "成就已授予",
      data: achievement[0],
    });
  } catch (error) {
    console.error("授予成就失败:", error);
    res.status(500).json({
      success: false,
      message: "授予成就失败",
    });
  }
});

module.exports = router;
