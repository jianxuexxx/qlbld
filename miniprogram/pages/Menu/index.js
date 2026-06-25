Page({
  data: {
    screenWidth: 1000,
    screenHeight: 1000,
    scrollHeight: 0,

    search: "",

    allMenus: [],
    categories: [],
    currentCategoryIndex: 0,
    currentCategoryName: '全部',
    currentCategoryMenus: [],

    _openidA: getApp().globalData._openidA,
    _openidB: getApp().globalData._openidB,

    slideButtons: [
      { extClass: 'orderBtn', text: '点菜', src: "Images/icon_order.svg" },
      { extClass: 'starBtn', text: '星标', src: "Images/icon_star.svg" },
      { extClass: 'removeBtn', text: '删除', src: 'Images/icon_del.svg' }
    ],
  },

  // 页面加载时运行
  async onShow() {
    await this.loadCategories();
    await this.loadMenus();
    this.filterMenus();
    this.getScreenSize();
  },

  // 获取屏幕尺寸
  async getScreenSize() {
    wx.getSystemInfo({
      success: (res) => {
        this.setData({
          screenWidth: res.windowWidth,
          screenHeight: res.windowHeight,
          scrollHeight: res.windowHeight - 300 // 减去头部和其他元素的高度
        })
      }
    })
  },

  // 加载分类数据
  async loadCategories() {
    const defaultCategories = await wx.cloud.callFunction({ name: 'getCategoryList', data: { list: 'CategoryList' } }).then(data => {
      return data.result.data;
    });
    // 如果有云函数获取分类，可以替换此处
    this.setData({
      categories: defaultCategories
    });
  },

  // 加载菜单数据
  async loadMenus() {
    await wx.cloud.callFunction({ name: 'getMenuList', data: { list: 'MenuList' } }).then(data => {
      this.setData({ allMenus: data.result.data });
      this.filterMenus();
    })
  },

  // 转到菜单详情
  async toDetailPage(event) {
    const menuIndex = event.currentTarget.dataset.index;
    const menu = this.data.currentCategoryMenus[menuIndex];
    wx.navigateTo({ url: '../MenuDetail/index?id=' + menu._id });
  },

  // 转到添加菜单
  async toAddPage() {
    wx.navigateTo({ url: '../MenuAdd/index' });
  },

  // 设置搜索
  onSearch(event) {
    this.setData({
      search: event.detail.value
    });

    this.filterMenus();
  },

  // 切换分类
  switchCategory(event) {
    const index = event.currentTarget.dataset.index;
    const category = this.data.categories[index];

    this.setData({
      currentCategoryIndex: index,
      currentCategoryName: category.name
    });

    this.filterMenus();
  },

  // 根据分类和搜索条件过滤菜单
  filterMenus() {
    let menuList = [];
    const currentCategory = this.data.categories[this.data.currentCategoryIndex];

    // 根据当前选中的分类筛选
    if (currentCategory._id === 'all') {
      menuList = this.data.allMenus;
    } else {
      menuList = this.data.allMenus.filter(item => item.category === currentCategory.name);
    }

    // 应用搜索条件
    if (this.data.search !== "") {
      menuList = menuList.filter(item => item.title.toLowerCase().includes(this.data.search.toLowerCase()));
    }

    this.setData({
      currentCategoryMenus: menuList
    });
  },

  // 响应左划按钮事件
  async slideButtonTap(event) {
    const { index } = event.detail;
    const menuIndex = event.currentTarget.dataset.index;
    const menu = this.data.currentCategoryMenus[menuIndex];

    await wx.cloud.callFunction({ name: 'getOpenId' }).then(async openid => {
      // 处理点菜点击事件
      if (index === 0) {
        this.orderMenu(menu);
      }
      // 检查是否是菜单创建者操作
      else if (menu._openid === openid.result) {
        // 处理星标按钮点击事件
        if (index === 1) {
          wx.cloud.callFunction({
            name: 'editMenuStar',
            data: { _id: menu._id, list: 'MenuList', value: !menu.star }
          });
          // 更新本地数据
          menu.star = !menu.star;
        }

        // 处理删除按钮点击事件
        else if (index === 2) {
          wx.cloud.callFunction({
            name: 'deleteMenu',
            data: { _id: menu._id, list: 'MenuList' }
          });

          // 更新本地数据
          const updatedMenus = this.data.allMenus.filter(item => item._id !== menu._id);
          this.setData({
            allMenus: updatedMenus
          });

          // 如果删除完所有事项，刷新数据，让页面显示无事项图片
          if (updatedMenus.length === 0) {
            this.setData({
              allMenus: [],
              currentCategoryMenus: []
            });
          } else {
            this.filterMenus(); // 重新过滤当前分类的菜单
          }
        }

        // 触发显示更新
        this.setData({
          allMenus: this.data.allMenus,
          currentCategoryMenus: this.data.currentCategoryMenus
        });
      }
      // 如果编辑的不是自己的菜单，显示提醒
      else {
        wx.showToast({
          title: '只能编辑自己的菜单',
          icon: 'error',
          duration: 2000
        });
      }
    });
  },

  // 点菜操作
  async orderMenu(menu) {
    await wx.cloud.callFunction({ name: 'getOpenId' }).then(async openid => {
      // 检查是否是菜单创建者点自己的菜
      if (menu._openid === openid.result) {
        wx.showToast({
          title: '不能点自己的菜',
          icon: 'error',
          duration: 2000
        });
      }
      // 检查是否已经被点过
      else if (menu.ordered) {
        wx.showToast({
          title: '此菜已被点',
          icon: 'error',
          duration: 2000
        });
      }
      // 执行点菜操作
      else {
        wx.cloud.callFunction({
          name: 'editMenuOrdered',
          data: { _id: menu._id, value: true, list: 'MenuList' }
        });

        // 显示提示
        wx.showToast({
          title: '点菜成功',
          icon: 'success',
          duration: 2000
        });

        // 更新本地数据
        menu.ordered = true;
        this.setData({
          allMenus: this.data.allMenus
        });
        this.filterMenus(); // 重新过滤显示
      }
    });
  },
})