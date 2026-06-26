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
    userA: getApp().globalData.userA,
    userB: getApp().globalData.userB,
    currentOpenid: '',

    // === 点菜多选模式状态 ===
    selectMode: false,
    selectedIds: {},          // { menuId: true }
    selectedCount: 0,
    totalCredit: 0,

    slideButtons: [
      { extClass: 'orderBtn', text: '点菜', src: "Images/icon_order.svg" },
      { extClass: 'starBtn', text: '星标', src: "Images/icon_star.svg" },
      { extClass: 'removeBtn', text: '删除', src: 'Images/icon_del.svg' }
    ],
  },

  // 页面加载时运行
  async onShow() {
    // 取一次当前 openid 缓存本地
    await wx.cloud.callFunction({ name: 'getOpenId' }).then(res => {
      this.setData({ currentOpenid: res.result });
    }).catch(() => {});

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
          scrollHeight: res.windowHeight - 300
        })
      }
    })
  },

  // 加载分类数据
  async loadCategories() {
    const defaultCategories = await wx.cloud.callFunction({ name: 'getCategoryList', data: { list: 'CategoryList' } }).then(data => {
      return data.result.data;
    });
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

  // 转到添加菜单（保留为弱化入口）
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

    if (currentCategory._id === 'all') {
      menuList = this.data.allMenus;
    } else {
      menuList = this.data.allMenus.filter(item => item.category === currentCategory.name);
    }

    if (this.data.search !== "") {
      menuList = menuList.filter(item => item.title.toLowerCase().includes(this.data.search.toLowerCase()));
    }

    // 给每个菜品附加 _selected 标志位，供模板渲染勾选样式
    menuList = menuList.map(item => ({
      ...item,
      _selected: !!this.data.selectedIds[item._id]
    }));

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
      // 左滑"点菜"按钮：进入多选模式
      if (index === 0) {
        this.enterSelectMode();
        return;
      }
      // 检查是否是菜单创建者操作
      else if (menu._openid === openid.result) {
        // 处理星标按钮点击事件
        if (index === 1) {
          wx.cloud.callFunction({
            name: 'editMenuStar',
            data: { _id: menu._id, list: 'MenuList', value: !menu.star }
          });
          menu.star = !menu.star;
        }

        // 处理删除按钮点击事件
        else if (index === 2) {
          wx.cloud.callFunction({
            name: 'deleteMenu',
            data: { _id: menu._id, list: 'MenuList' }
          });

          const updatedMenus = this.data.allMenus.filter(item => item._id !== menu._id);
          if (updatedMenus.length === 0) {
            this.setData({
              allMenus: [],
              currentCategoryMenus: []
            });
          } else {
            this.setData({ allMenus: updatedMenus });
            this.filterMenus();
          }
        }

        this.setData({
          allMenus: this.data.allMenus,
          currentCategoryMenus: this.data.currentCategoryMenus
        });
      }
      else {
        wx.showToast({
          title: '只能编辑自己的菜单',
          icon: 'error',
          duration: 2000
        });
      }
    });
  },

  // 旧版单菜点菜（已废弃，保留以兼容）
  async orderMenu(menu) {
    this.enterSelectMode();
  },

  // === 点菜多选模式 ===
  enterSelectMode() {
    this.setData({
      selectMode: true,
      selectedIds: {},
      selectedCount: 0,
      totalCredit: 0
    });
    this.filterMenus();
    wx.showToast({
      title: '请勾选要点的菜',
      icon: 'none',
      duration: 1500
    });
  },

  cancelSelect() {
    this.setData({
      selectMode: false,
      selectedIds: {},
      selectedCount: 0,
      totalCredit: 0
    });
    this.filterMenus();
  },

  // 多选模式下点击菜品行：切换选中状态
  onMenuItemTap(event) {
    if (!this.data.selectMode) {
      // 非多选模式：走详情页
      this.toDetailPage(event);
      return;
    }
    const menuIndex = event.currentTarget.dataset.index;
    const menu = this.data.currentCategoryMenus[menuIndex];
    if (!menu) return;

    const selectedIds = { ...this.data.selectedIds };
    if (selectedIds[menu._id]) {
      delete selectedIds[menu._id];
    } else {
      selectedIds[menu._id] = true;
    }

    let count = 0;
    let total = 0;
    this.data.allMenus.forEach(m => {
      if (selectedIds[m._id]) {
        count += 1;
        total += Number(m.credit) || 0;
      }
    });

    this.setData({
      selectedIds,
      selectedCount: count,
      totalCredit: total
    });
    this.filterMenus();
  },

  // 确认下单
  async submitOrder() {
    if (this.data.selectedCount === 0) {
      wx.showToast({ title: '请先勾选菜品', icon: 'none' });
      return;
    }

    // 收集所选菜品完整快照
    const selectedMenus = this.data.allMenus.filter(m => this.data.selectedIds[m._id]);
    const dishes = selectedMenus.map(m => ({
      menuId: m._id,
      title: m.title,
      category: m.category || '',
      desc: m.desc || '',
      credit: Number(m.credit) || 0,
      _openid: m._openid
    }));

    // 去重厨师姓名
    const cookerNames = [];
    const userByOpenid = {
      [this.data._openidA]: this.data.userA,
      [this.data._openidB]: this.data.userB
    };
    dishes.forEach(d => {
      const name = userByOpenid[d._openid];
      if (name && cookerNames.indexOf(name) === -1) {
        cookerNames.push(name);
      }
    });

    const totalCredit = dishes.reduce((sum, d) => sum + d.credit, 0);
    const now = new Date();
    const dateLabel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const title = `点菜单 - ${dateLabel}`;
    const ordererName = userByOpenid[this.data.currentOpenid] || '下单者';

    wx.showLoading({ title: '下单中...', mask: true });

    try {
      // 1. 在 MissionList 创建订单
      const orderRes = await wx.cloud.callFunction({
        name: 'placeOrder',
        data: {
          list: 'MissionList',
          title,
          desc: '',
          credit: totalCredit,
          dishes,
          cookerNames,
          ordererName
        }
      });

      const orderId = orderRes.result && orderRes.result._id;

      // 2. 计算每位厨师的积分奖励并批量发放
      const deltasMap = {};
      dishes.forEach(d => {
        if (!d._openid) return;
        deltasMap[d._openid] = (deltasMap[d._openid] || 0) + d.credit;
      });
      const deltas = Object.keys(deltasMap).map(openid => ({
        openid,
        delta: deltasMap[openid]
      }));

      if (deltas.length > 0) {
        await wx.cloud.callFunction({
          name: 'distributeCredit',
          data: { list: 'UserList', deltas }
        });
      }

      wx.hideLoading();
      wx.showToast({ title: '下单成功', icon: 'success', duration: 1500 });

      // 退出多选模式并刷新列表
      this.setData({
        selectMode: false,
        selectedIds: {},
        selectedCount: 0,
        totalCredit: 0
      });
      await this.loadMenus();

      // 跳转到订单详情
      if (orderId) {
        setTimeout(() => {
          wx.navigateTo({ url: '../MissionDetail/index?id=' + orderId });
        }, 800);
      }
    } catch (err) {
      wx.hideLoading();
      console.error('下单失败', err);
      wx.showToast({ title: '下单失败', icon: 'error' });
    }
  },
})