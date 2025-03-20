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
    console.log("Requesting openid with code:", code);
    console.log("Using AppID:", WX_APPID);

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

    console.log("WeChat API response:", response.data);

    if (response.data.errcode) {
      throw new Error(`WeChat API error: ${response.data.errmsg}`);
    }

    return response.data.openid;
  } catch (error) {
    console.error("获取openid失败:", error.response?.data || error.message);
    throw new Error(
      "获取openid失败: " + (error.response?.data?.errmsg || error.message)
    );
  }
}

// 微信登录
router.post("/login", async (req, res) => {
  try {
    console.log("Received login request:", req.body);
    const { code, userInfo } = req.body;

    if (!code || !userInfo) {
      console.log("Missing required parameters:", {
        code: !!code,
        userInfo: !!userInfo,
      });
      return res.status(400).json({
        success: false,
        message: "缺少必要参数",
      });
    }

    // 获取openid
    console.log("Getting openid...");
    const openid = await getWxOpenid(code);
    console.log("Got openid:", openid);

    // 查询或创建用户
    console.log("Checking user in database...");
    const [user] = await req.app.locals.db.query(
      "SELECT * FROM users WHERE openid = ?",
      [openid]
    );

    let userId;
    if (user.length === 0) {
      console.log("Creating new user...");
      // 创建新用户
      const [result] = await req.app.locals.db.query(
        "INSERT INTO users (openid, nickname, avatar_url, gender) VALUES (?, ?, ?, ?)",
        [openid, userInfo.nickname, userInfo.avatar_url, userInfo.gender]
      );
      userId = result.insertId;
      console.log("New user created with ID:", userId);
    } else {
      userId = user[0].id;
      console.log("Updating existing user:", userId);
      // 更新用户信息
      await req.app.locals.db.query(
        "UPDATE users SET nickname = ?, avatar_url = ?, gender = ? WHERE id = ?",
        [userInfo.nickname, userInfo.avatar_url, userInfo.gender, userId]
      );
    }

    // 生成 JWT token
    console.log("Generating JWT token...");
    const token = jwt.sign({ userId, openid }, JWT_SECRET, {
      expiresIn: "30d",
    });

    // 获取用户完整信息
    console.log("Getting user info...");
    const [userData] = await req.app.locals.db.query(
      "SELECT id, nickname, avatar_url, gender, phone FROM users WHERE id = ?",
      [userId]
    );

    console.log("Login successful for user:", userData[0]);
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
      message: "登录失败: " + error.message,
    });
  }
});

// 手机号绑定
router.post("/bind-phone", async (req, res) => {
  try {
    console.log("Received bind phone request:", req.body);
    const { cloudID } = req.body;
    const token = req.headers.authorization?.split(" ")[1];

    if (!token || !cloudID) {
      console.log("Missing required parameters:", {
        token: !!token,
        cloudID: !!cloudID,
      });
      return res.status(400).json({
        success: false,
        message: "缺少必要参数",
      });
    }

    // 验证 token
    console.log("Verifying token...");
    const decoded = await jwtVerify(token, JWT_SECRET);
    const userId = decoded.userId;
    console.log("Token verified for user:", userId);

    // 使用微信云托管解析手机号
    console.log("Getting phone number from cloudID...");
    const { phoneNumber } =
      await req.app.locals.wx.cloud.openapi.security.getPhoneNumber({
        code: cloudID,
      });
    console.log("Got phone number:", phoneNumber);

    // 更新用户手机号
    console.log("Updating user phone number...");
    await req.app.locals.db.query("UPDATE users SET phone = ? WHERE id = ?", [
      phoneNumber,
      userId,
    ]);

    console.log("Phone binding successful");
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
      message: "绑定手机号失败: " + error.message,
    });
  }
});

module.exports = router;
