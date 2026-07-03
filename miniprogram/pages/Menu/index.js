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

    // === 滚动定位 ===
    scrollIntoViewCategoryId: '',  // 左侧分类栏定位目标
    scrollIntoViewMenuId: '',      // 右侧菜品栏定位目标

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

    // 先加载分类（保证 filterMenus 不会因 categories 为空而报错）
    await this.loadCategories();
    // 再加载菜单
    await this.loadMenus();
    this.getScreenSize();
  },

  // 获取屏幕尺寸
  async getScreenSize() {
    wx.getSystemInfo({
      success: (res) => {
        this.setData({
          screenWidth: res.windowWidth,
          screenHeight: res.windowHeight
        })
      }
    })
  },

  // 加载分类数据
  async loadCategories() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getCategoryList', data: { list: 'CategoryList' } });
      const defaultCategories = (res && res.result && res.result.data) || [];
      // 为每个分类附加 count 字段（菜品数）
      const allMenus = this.data.allMenus || [];
      const enriched = defaultCategories.map(c => {
        if (c._id === 'all') {
          return { ...c, count: allMenus.length };
        }
        const count = allMenus.filter(m => m.category === c.name).length;
        return { ...c, count };
      });
      this.setData({ categories: enriched });
    } catch (err) {
      console.error('加载分类失败', err);
      this.setData({ categories: [] });
    }
  },

  // 加载菜单数据
  async loadMenus() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getMenuList', data: { list: 'MenuList' } });
      const menuData = (res && res.result && res.result.data) || [];
      this.setData({ allMenus: menuData });
      this.filterMenus();
      // 重新计算分类计数
      if (this.data.categories.length > 0) {
        const enriched = this.data.categories.map(c => {
          if (c._id === 'all') {
            return { ...c, count: menuData.length };
          }
          const count = menuData.filter(m => m.category === c.name).length;
          return { ...c, count };
        });
        this.setData({ categories: enriched });
      }
    } catch (err) {
      console.error('加载菜单失败', err);
      this.setData({ allMenus: [], currentCategoryMenus: [] });
    }
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

  // 设置搜索（保留左侧激活分类，搜索时仅在原分类下过滤 + 右侧定位）
  onSearch(event) {
    const value = event.detail.value || '';
    this.setData({ search: value });
    this.filterMenus();

    // 关键：搜索无结果时，scrollIntoViewMenuId 保持稳定（不要在搜索无结果时清空/重置，
    // 避免与 scroll-view 内部高度剧变冲突导致视觉抖动）
    if (value && this.data.allMenus.length > 0 && this.data.categories.length > 0) {
      // 在当前分类下查找第一个命中项
      const lower = value.toLowerCase();
      const firstMatch = (this.data.currentCategoryMenus || []).find(m =>
        (m.title || '').toLowerCase().includes(lower)
      );

      if (firstMatch) {
        // 当前分类有命中，定位到第一道匹配菜
        this.setData({ scrollIntoViewMenuId: '' });
        wx.nextTick(() => {
          this.setData({
            scrollIntoViewMenuId: 'menu-item-' + firstMatch._id
          });
        });
      }
      // 无命中时不动 scrollIntoViewMenuId，避免视觉错乱
    }
  },

  // 清空搜索框
  clearSearch() {
    this.setData({ search: '' });
    this.filterMenus();
    // 重置右侧滚动条到顶部（清空再设置，确保 scroll-with-animation=false 下也能定位）
    this.setData({ scrollIntoViewMenuId: '' });
    wx.nextTick(() => {
      this.setData({ scrollIntoViewMenuId: 'menu-section-title' });
    });
  },

  // 切换分类（保留搜索词，跨分类查找）
  switchCategory(event) {
    const index = event.currentTarget.dataset.index;
    const category = this.data.categories[index];

    // 第一步：先切换激活态（不触发滚动）
    this.setData({
      currentCategoryIndex: index,
      currentCategoryName: category.name
    });
    this.filterMenus();

    // 第二步：等激活态稳定后再设置滚动定位
    wx.nextTick(() => {
      this.setData({
        scrollIntoViewCategoryId: 'category-item-' + index
      });
      // 如果有搜索词，尝试在当前分类下定位到第一个命中项
      if (this.data.search) {
        const lower = this.data.search.toLowerCase();
        const firstMatch = (this.data.currentCategoryMenus || []).find(m =>
          (m.title || '').toLowerCase().includes(lower)
        );
        if (firstMatch) {
          this.setData({ scrollIntoViewMenuId: '' });
          wx.nextTick(() => {
            this.setData({ scrollIntoViewMenuId: 'menu-item-' + firstMatch._id });
          });
        }
        // 无命中时不重置 scrollIntoViewMenuId
      } else {
        // 无搜索词时重置到顶部
        this.setData({ scrollIntoViewMenuId: '' });
        wx.nextTick(() => {
          this.setData({ scrollIntoViewMenuId: 'menu-section-title' });
        });
      }
    });
  },

  // 根据分类和搜索条件过滤菜单
  filterMenus() {
    const { categories, currentCategoryIndex, allMenus, search, cart } = this.data;

    // 防御：分类或菜单未加载时直接清空
    if (!categories || categories.length === 0) {
      this.setData({ currentCategoryMenus: [] });
      return;
    }
    if (!allMenus || allMenus.length === 0) {
      this.setData({ currentCategoryMenus: [] });
      return;
    }

    const currentCategory = categories[currentCategoryIndex] || categories[0];

    let menuList;
    if (currentCategory && currentCategory._id === 'all') {
      menuList = allMenus.slice();
    } else {
      menuList = allMenus.filter(item => item.category === (currentCategory ? currentCategory.name : ''));
    }

    if (search) {
      const lower = search.toLowerCase();
      menuList = menuList.filter(item => (item.title || '').toLowerCase().includes(lower));
    }

    // 给每个菜品附加 _inCart 标志位
    menuList = menuList.map(item => ({
      ...item,
      _inCart: !!cart[item._id]
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

  clearCart() {
    wx.showModal({
      title: '清空购物车',
      content: '确定要清空已选的菜品吗？',
      confirmColor: '#FF99AA',
      success: (res) => {
        if (res.confirm) {
          this.setData({ cart: {}, cartList: [], cartCount: 0, cartTotalCredit: 0 });
          this.refreshCart();
        }
      }
    });
  },

  // 长按菜品卡片：弹出编辑/删除菜单
  onCardLongPress(event) {
    const menuIndex = event.currentTarget.dataset.index;
    const menu = this.data.currentCategoryMenus[menuIndex];
    if (!menu) return;

    // 仅创建者可编辑/删除
    if (menu._openid !== this.data.currentOpenid) {
      wx.showToast({ title: '只能编辑自己的菜品', icon: 'none' });
      return;
    }

    wx.showActionSheet({
      itemList: [menu.star ? '取消星标' : '设为星标', '删除菜品'],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.cloud.callFunction({
            name: 'editMenuStar',
            data: { _id: menu._id, list: 'MenuList', value: !menu.star }
          });
          menu.star = !menu.star;
          this.setData({ currentCategoryMenus: this.data.currentCategoryMenus });
        } else if (res.tapIndex === 1) {
          wx.showModal({
            title: '删除菜品',
            content: `确定要删除「${menu.title}」吗？`,
            confirmColor: '#FF3B30',
            success: (r) => {
              if (r.confirm) {
                wx.cloud.callFunction({
                  name: 'deleteMenu',
                  data: { _id: menu._id, list: 'MenuList' }
                });
                const updatedMenus = this.data.allMenus.filter(item => item._id !== menu._id);
                // 如果删除的菜在购物车里也一起移除
                if (this.data.cart[menu._id]) {
                  const cart = { ...this.data.cart };
                  delete cart[menu._id];
                  this.setData({ cart, allMenus: updatedMenus });
                  this.refreshCart();
                } else {
                  this.setData({ allMenus: updatedMenus });
                  this.filterMenus();
                }
              }
            }
          });
        }
      }
    });
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