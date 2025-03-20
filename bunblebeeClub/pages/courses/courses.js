Page({
  data: {
    currentCategory: 1,
    categories: [
      { id: 1, name: "青少年" },
      { id: 2, name: "成人" },
      { id: 3, name: "特训营" },
    ],
    courses: [
      {
        id: 1,
        name: "青少年足球培训班",
        price: 299,
        description: "专业教练指导，培养孩子的足球技能和团队精神",
        coach: "张教练",
        duration: 90,
        tags: ["基础", "团队协作", "趣味教学"],
      },
      {
        id: 2,
        name: "成人足球技术课程",
        price: 399,
        description: "针对成人的专业足球训练，提升个人技术水平",
        coach: "李教练",
        duration: 120,
        tags: ["进阶", "体能", "技术提升"],
      },
    ],
  },

  onLoad() {
    // 页面加载时从服务器获取课程数据
    this.fetchCourses();
  },

  switchCategory(e) {
    const categoryId = e.currentTarget.dataset.id;
    this.setData({
      currentCategory: categoryId,
    });
    this.fetchCourses(categoryId);
  },

  fetchCourses(categoryId = this.data.currentCategory) {
    // TODO: 从服务器获取对应分类的课程数据
    // wx.request({
    //   url: 'your-api-endpoint',
    //   data: { categoryId },
    //   success: (res) => {
    //     this.setData({
    //       courses: res.data
    //     })
    //   }
    // })
  },

  navigateToCourseDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/course-detail/course-detail?id=${id}`,
    });
  },
});
