// pages/profile/profile.js
const app = getApp();
const BASE_URL =
  "https://bunblebee-back-142595-4-1344851180.sh.run.tcloudbase.com";

Page({
  /**
   * 页面的初始数据
   */
  data: {
    isLoggedIn: false,
    userInfo: null,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    // 初始化云托管环境
    wx.cloud.init({
      env: "prod-4gv7hplz5e8dc437",
    });
    this.checkLoginStatus();
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {},

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    this.checkLoginStatus();
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {},

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {},

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {},

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {},

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {},

  checkLoginStatus() {
    const token = wx.getStorageSync("token");
    const userInfo = wx.getStorageSync("userInfo");

    if (token && userInfo) {
      this.setData({
        isLoggedIn: true,
        userInfo,
      });
    }
  },

  handleLogin() {
    wx.showLoading({
      title: "登录中...",
    });

    // 获取用户信息
    wx.getUserProfile({
      desc: "用于完善会员资料",
      success: (res) => {
        const userInfo = res.userInfo;
        console.log("获取到的用户信息:", userInfo);

        // 获取登录code
        wx.login({
          success: (loginRes) => {
            if (loginRes.code) {
              console.log("获取到的登录code:", loginRes.code);

              // 构造登录请求数据
              const loginData = {
                code: loginRes.code,
                userInfo: {
                  nickname: userInfo.nickName,
                  avatar_url: userInfo.avatarUrl,
                  gender: userInfo.gender,
                  country: userInfo.country,
                  province: userInfo.province,
                  city: userInfo.city,
                  language: userInfo.language,
                },
              };

              // 调用云托管登录接口
              wx.cloud.callContainer({
                config: {
                  env: "prod-4gv7hplz5e8dc437",
                },
                path: "/auth/login",
                header: {
                  "X-WX-SERVICE": "bunblebee-back",
                  "content-type": "application/json",
                },
                method: "POST",
                data: loginData,
                success: (result) => {
                  console.log("登录接口返回:", result.data);

                  if (result.data.success) {
                    // 保存token和用户信息
                    wx.setStorageSync("token", result.data.data.token);
                    wx.setStorageSync("userInfo", result.data.data.userInfo);

                    this.setData({
                      isLoggedIn: true,
                      userInfo: result.data.data.userInfo,
                    });

                    wx.showToast({
                      title: "登录成功",
                      icon: "success",
                    });
                  } else {
                    wx.showToast({
                      title: result.data.message || "登录失败",
                      icon: "error",
                    });
                  }
                },
                fail: (error) => {
                  console.error("登录失败:", error);
                  wx.showToast({
                    title: "登录失败",
                    icon: "error",
                  });
                },
                complete: () => {
                  wx.hideLoading();
                },
              });
            }
          },
          fail: (error) => {
            console.error("获取code失败:", error);
            wx.hideLoading();
            wx.showToast({
              title: "登录失败",
              icon: "error",
            });
          },
        });
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({
          title: "用户取消授权",
          icon: "none",
        });
      },
    });
  },

  // 修改为使用button的open-type="getPhoneNumber"来获取手机号
  getPhoneNumber(e) {
    if (e.detail.errMsg !== "getPhoneNumber:ok") {
      wx.showToast({
        title: "获取手机号失败",
        icon: "none",
      });
      return;
    }

    wx.showLoading({
      title: "绑定中...",
    });

    const token = wx.getStorageSync("token");

    // 调用云托管绑定手机号接口
    wx.cloud.callContainer({
      config: {
        env: "prod-4gv7hplz5e8dc437",
      },
      path: "/user/bind-phone",
      header: {
        "X-WX-SERVICE": "bunblebee-back",
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      method: "POST",
      data: {
        cloudID: e.detail.cloudID,
      },
      success: (result) => {
        if (result.data.success) {
          // 更新本地存储的用户信息
          const userInfo = wx.getStorageSync("userInfo");
          userInfo.phone = result.data.data.phone;
          wx.setStorageSync("userInfo", userInfo);

          this.setData({
            userInfo: userInfo,
          });

          wx.showToast({
            title: "绑定成功",
            icon: "success",
          });
        }
      },
      fail: (error) => {
        console.error("绑定手机号失败:", error);
        wx.showToast({
          title: "绑定失败",
          icon: "error",
        });
      },
      complete: () => {
        wx.hideLoading();
      },
    });
  },

  handleLogout() {
    wx.showModal({
      title: "提示",
      content: "确定要退出登录吗？",
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync("token");
          wx.removeStorageSync("userInfo");

          this.setData({
            isLoggedIn: false,
            userInfo: null,
          });

          wx.showToast({
            title: "已退出登录",
            icon: "success",
          });
        }
      },
    });
  },

  // 页面跳转函数
  navigateToMyBookings() {
    if (!this.data.isLoggedIn) {
      this.showLoginTip();
      return;
    }
    wx.navigateTo({
      url: "/pages/my-bookings/my-bookings",
    });
  },

  navigateToMyCourses() {
    if (!this.data.isLoggedIn) {
      this.showLoginTip();
      return;
    }
    wx.navigateTo({
      url: "/pages/my-courses/my-courses",
    });
  },

  navigateToMyAchievements() {
    if (!this.data.isLoggedIn) {
      this.showLoginTip();
      return;
    }
    wx.navigateTo({
      url: "/pages/my-achievements/my-achievements",
    });
  },

  showLoginTip() {
    wx.showToast({
      title: "请先登录",
      icon: "none",
    });
  },
});
