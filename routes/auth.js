const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const axios = require("axios");
const { promisify } = require("util");
const jwtVerify = promisify(jwt.verify);

// 微信小程序配置
const WX_APPID = process.env.WX_APPID;
const WX_SECRET = process.env.WX_SECRET;
const JWT_SECRET = process.env.JWT_SECRET;

// 打印配置信息
console.log("Auth route configuration:", {
  WX_APPID: process.env.WX_APPID,
  WX_SECRET: process.env.WX_SECRET ? "已设置" : "未设置",
  JWT_SECRET: process.env.JWT_SECRET ? "已设置" : "未设置",
});

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

    return {
      openid: response.data.openid,
      unionid: response.data.unionid,
    };
  } catch (error) {
    console.error("获取openid失败:", error.response?.data || error.message);
    throw new Error(
      "获取openid失败: " + (error.response?.data?.errmsg || error.message)
    );
  }
}

// 微信登录
router.post("/wx-login", async (req, res) => {
  try {
    const { code } = req.body;
    console.log("Received login request with code:", code);

    if (!code) {
      return res.status(400).json({
        success: false,
        message: "缺少登录码",
      });
    }

    if (!WX_APPID || !WX_SECRET) {
      console.error("Missing WeChat configuration:", {
        WX_APPID: WX_APPID,
        WX_SECRET: WX_SECRET ? "已设置" : "未设置",
      });
      return res.status(500).json({
        success: false,
        message: "服务器配置错误：缺少微信配置",
      });
    }

    // 获取openid和unionid
    const { openid, unionid } = await getWxOpenid(code);
    console.log("Successfully got openid:", openid);

    // 查询用户是否已存在
    const [existingUser] = await req.app.locals.db.query(
      "SELECT * FROM users WHERE openid = ?",
      [openid]
    );

    let userId;
    if (existingUser.length === 0) {
      // 创建新用户
      const [result] = await req.app.locals.db.query(
        "INSERT INTO users (openid, nickname, avatar_url, role) VALUES (?, ?, ?, ?)",
        [
          openid,
          "微信用户",
          "https://thirdwx.qlogo.cn/mmopen/vi_32/POgEwh4mIHO4nibH0KlMECNjjGxQUq24ZEaGT4poC6icRiccVGKSyXwibcPq4BWmiaIGuG1icwxaQX6grC9VemZoJ8rg/132",
          "student",
        ]
      );
      userId = result.insertId;
      console.log("Created new user with ID:", userId);
    } else {
      userId = existingUser[0].id;
      console.log("User already exists with ID:", userId);
    }

    // 生成JWT token
    const token = jwt.sign(
      { userId, openid },
      JWT_SECRET || "0093fd72356299b864ca022824b5487f",
      { expiresIn: "30d" }
    );

    // 获取完整的用户信息
    const [userData] = await req.app.locals.db.query(
      "SELECT id, openid, nickname, avatar_url, phone, role FROM users WHERE id = ?",
      [userId]
    );

    // 返回token和用户信息
    res.json({
      success: true,
      data: {
        token,
        userInfo: userData[0],
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: `登录失败: ${error.message}`,
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
