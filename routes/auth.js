const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const axios = require("axios");
const { promisify } = require("util");
const jwtVerify = promisify(jwt.verify);

// 微信小程序配置
const WX_APPID = "wx5b89b5f779f7991a";
const WX_SECRET =
  "AAQ9G7sEAAABAAAAAABR+kavYvy0X9H/j13MZyAAAAAraAdzKm8i8JwFJ68cDOJBtIHsmv3F8e00LCv7f+tYvvO8llGSXKzvv5bROCiOVue6NNuq8qxEMtFPLZe0V56nvQFhBsJFJzW+QUxyDq/vnXYsLxfkFrGvhE1H6uugbcamOVACFMvdNnkAtZGh1mtCICPle4/W";
const JWT_SECRET = "your-jwt-secret-key"; // 建议使用环境变量存储

// 获取微信用户 openid
async function getWxOpenid(code) {
  try {
    const response = await axios.get(
      "https://api.weixin.qq.com/sns/jscode2session",
      {
        params: {
          appid: WX_APPID,
          secret: WX_SECRET,
          js_code: code,
          grant_type: "authorization_code",
        },
      }
    );
    return response.data.openid;
  } catch (error) {
    console.error("获取openid失败:", error);
    throw new Error("获取openid失败");
  }
}

// 微信登录
router.post("/login", async (req, res) => {
  try {
    const { code, userInfo } = req.body;

    if (!code || !userInfo) {
      return res.status(400).json({
        success: false,
        message: "缺少必要参数",
      });
    }

    // 获取openid
    const openid = await getWxOpenid(code);

    // 查询或创建用户
    const [user] = await req.app.locals.db.query(
      "SELECT * FROM users WHERE openid = ?",
      [openid]
    );

    let userId;
    if (user.length === 0) {
      // 创建新用户
      const [result] = await req.app.locals.db.query(
        "INSERT INTO users (openid, nickname, avatar_url, gender) VALUES (?, ?, ?, ?)",
        [openid, userInfo.nickName, userInfo.avatarUrl, userInfo.gender]
      );
      userId = result.insertId;
    } else {
      userId = user[0].id;
      // 更新用户信息
      await req.app.locals.db.query(
        "UPDATE users SET nickname = ?, avatar_url = ?, gender = ? WHERE id = ?",
        [userInfo.nickName, userInfo.avatarUrl, userInfo.gender, userId]
      );
    }

    // 生成 JWT token
    const token = jwt.sign({ userId, openid }, JWT_SECRET, {
      expiresIn: "30d",
    });

    // 获取用户完整信息
    const [userData] = await req.app.locals.db.query(
      "SELECT id, nickname, avatar_url, gender, phone FROM users WHERE id = ?",
      [userId]
    );

    res.json({
      success: true,
      data: {
        token,
        userInfo: userData[0],
      },
    });
  } catch (error) {
    console.error("登录失败:", error);
    res.status(500).json({
      success: false,
      message: "登录失败",
    });
  }
});

// 手机号绑定
router.post("/bind-phone", async (req, res) => {
  try {
    const { cloudID } = req.body;
    const token = req.headers.authorization?.split(" ")[1];

    if (!token || !cloudID) {
      return res.status(400).json({
        success: false,
        message: "缺少必要参数",
      });
    }

    // 验证 token
    const decoded = await jwtVerify(token, JWT_SECRET);
    const userId = decoded.userId;

    // 使用微信云托管解析手机号
    const { phoneNumber } =
      await req.app.locals.wx.cloud.openapi.security.getPhoneNumber({
        code: cloudID,
      });

    // 更新用户手机号
    await req.app.locals.db.query("UPDATE users SET phone = ? WHERE id = ?", [
      phoneNumber,
      userId,
    ]);

    res.json({
      success: true,
      data: {
        phone: phoneNumber,
      },
    });
  } catch (error) {
    console.error("绑定手机号失败:", error);
    res.status(500).json({
      success: false,
      message: "绑定手机号失败",
    });
  }
});

module.exports = router;
