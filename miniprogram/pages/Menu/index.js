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

    // === 购物车 ===
    cart: {},                    // { [menuId]: menuObject }
    cartList: [],                // 购物车菜品列表（用于展开面板渲染）
    cartCount: 0,
    cartTotalCredit: 0,
    cartExpanded: false,         // 购物车展开/收起

    slideButtons: [
      { extClass: 'orderBtn', text: '点菜', src: "Images/icon_order.svg" },
      { extClass: 'starBtn', text: '星标', src: "Images/icon_star.svg" },
      { extClass: 'removeBtn', text: '删除', src: 'Images/icon_del.svg' }
    ],
  },

  // 页面加载时运行
  async onShow() {
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
    this.setData({ categories: defaultCategories });
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
    if (this.data.cartExpanded) return;
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
    this.setData({ search: event.detail.value });
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

    // 给每个菜品附加 _inCart 标志位
    menuList = menuList.map(item => ({
      ...item,
      _inCart: !!this.data.cart[item._id]
    }));

    this.setData({ currentCategoryMenus: menuList });
  },

  // 响应左划按钮事件
  async slideButtonTap(event) {
    const { index } = event.detail;
    const menuIndex = event.currentTarget.dataset.index;
    const menu = this.data.currentCategoryMenus[menuIndex];

    await wx.cloud.callFunction({ name: 'getOpenId' }).then(async openid => {
      // 旧的"点菜"左滑按钮：改为引导用户使用 ➕
      if (index === 0) {
        wx.showToast({ title: '请点击 ➕ 加入购物车', icon: 'none' });
        return;
      }
      // 星标 / 删除：仅菜品创建者可操作
      else if (menu._openid === openid.result) {
        if (index === 1) {
          wx.cloud.callFunction({
            name: 'editMenuStar',
            data: { _id: menu._id, list: 'MenuList', value: !menu.star }
          });
          menu.star = !menu.star;
        }
        else if (index === 2) {
          wx.cloud.callFunction({
            name: 'deleteMenu',
            data: { _id: menu._id, list: 'MenuList' }
          });

          const updatedMenus = this.data.allMenus.filter(item => item._id !== menu._id);
          if (updatedMenus.length === 0) {
            this.setData({ allMenus: [], currentCategoryMenus: [] });
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
        wx.showToast({ title: '只能编辑自己的菜单', icon: 'error' });
      }
    });
  },

  // === 购物车操作 ===
  addToCart(event) {
    const menuId = event.currentTarget.dataset.id;
    const menu = this.data.allMenus.find(m => m._id === menuId);
    if (!menu) return;

    const cart = { ...this.data.cart };
    if (cart[menuId]) {
      // 已加入：点击 ➕ 无效果（采用方案 A：不累加数量）
      wx.showToast({ title: '已在购物车中', icon: 'none' });
      return;
    }
    cart[menuId] = menu;

    this.setData({ cart });
    this.refreshCart();
    // 微反馈
    wx.vibrateShort && wx.vibrateShort({ type: 'light' });
  },

  removeFromCart(event) {
    const menuId = event.currentTarget.dataset.id;
    const cart = { ...this.data.cart };
    delete cart[menuId];
    this.setData({ cart });
    this.refreshCart();
  },

  toggleCart() {
    this.setData({ cartExpanded: !this.data.cartExpanded });
  },

  closeCart() {
    if (this.data.cartExpanded) {
      this.setData({ cartExpanded: false });
    }
  },

  refreshCart() {
    const cartList = Object.values(this.data.cart);
    const cartCount = cartList.length;
    const cartTotalCredit = cartList.reduce((sum, m) => sum + (Number(m.credit) || 0), 0);
    this.setData({ cartList, cartCount, cartTotalCredit });
    this.filterMenus(); // 刷新菜品 _inCart 标志
  },

  // 确认下单
  async submitOrder() {
    if (this.data.cartCount === 0) {
      wx.showToast({ title: '购物车空空如也', icon: 'none' });
      return;
    }

    const dishes = this.data.cartList.map(m => ({
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

      // 2. 按厨师分账
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

      // 3. 清空购物车 + 收起面板
      this.setData({
        cart: {},
        cartList: [],
        cartCount: 0,
        cartTotalCredit: 0,
        cartExpanded: false
      });

      wx.hideLoading();
      wx.showToast({ title: '下单成功', icon: 'success', duration: 1500 });

      await this.loadMenus();

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