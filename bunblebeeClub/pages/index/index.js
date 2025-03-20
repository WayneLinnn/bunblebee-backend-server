// index.js
Page({
  data: {
    banners: [{ id: 1 }, { id: 2 }, { id: 3 }],
    courses: [
      { id: 1, name: "青少年足球培训班", price: 299 },
      { id: 2, name: "成人足球技术课程", price: 399 },
      { id: 3, name: "暑期特训营", price: 1999 },
    ],
    news: [
      { id: 1, title: "大黄蜂足球俱乐部夏季联赛开始报名", date: "2024-03-20" },
      { id: 2, title: "新教练加入我们的团队", date: "2024-03-19" },
    ],
  },

  onLoad() {
    // 页面加载时可以从服务器获取数据
  },

  // 导航函数
  navigateToCourses() {
    wx.switchTab({
      url: "/pages/courses/courses",
    });
  },

  navigateToFieldBooking() {
    wx.navigateTo({
      url: "/pages/field-booking/field-booking",
    });
  },

  navigateToNews() {
    wx.navigateTo({
      url: "/pages/news/news",
    });
  },

  navigateToCoaches() {
    wx.navigateTo({
      url: "/pages/coaches/coaches",
    });
  },

  navigateToCourseDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/course-detail/course-detail?id=${id}`,
    });
  },

  navigateToNewsDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/news/detail?id=${id}`,
    });
  },
});
