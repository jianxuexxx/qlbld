Page({
  data: {
    formData: {
      title: '',
      category: '',
      desc: '',
      credit: 10
    },
    maxCredit: getApp().globalData.maxCredit || 500
  },

  onLoad(options) {
    // 如果是从详情页跳转过来的编辑操作，可以传入初始数据
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    const value = event.detail.value;

    this.setData({
      [`formData.${field}`]: value
    });
  },

  onSliderChange(event) {
    this.setData({
      'formData.credit': event.detail.value
    });
  },

  async submitForm(event) {
    const formData = this.data.formData;

    // 表单验证
    if (!formData.title.trim()) {
      wx.showToast({
        title: '请输入菜品名称',
        icon: 'error'
      });
      return;
    }

    if (!formData.category.trim()) {
      wx.showToast({
        title: '请输入分类名称',
        icon: 'error'
      });
      return;
    }

    if (!formData.desc.trim()) {
      wx.showToast({
        title: '请输入菜品描述',
        icon: 'error'
      });
      return;
    }

    // 获取当前用户的openid
    wx.cloud.callFunction({ name: 'getOpenId' }).then(async (res) => {
      const openid = res.result;

      // 添加到数据库
      wx.cloud.callFunction({
        name: 'addMenu',
        data: {
          list: 'MenuList',
          title: formData.title,
          category: formData.category,
          desc: formData.desc,
          credit: parseInt(formData.credit),
          _openid: openid,
          date: new Date().toISOString().split('T')[0],
          available: true,  // 初始为可用状态
          ordered: false,   // 初始未被点
          accepted: false,  // 初始未被接单
          star: false       // 初始未星标
        }
      }).then(() => {
        wx.showToast({
          title: '菜品添加成功',
          icon: 'success'
        });

        // 返回上级页面
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      }).catch((error) => {
        console.error('添加菜品失败:', error);
        wx.showToast({
          title: '添加菜品失败',
          icon: 'error'
        });
      });
    }).catch((error) => {
      console.error('获取openid失败:', error);
      wx.showToast({
        title: '获取用户信息失败',
        icon: 'error'
      });
    });
  }
})