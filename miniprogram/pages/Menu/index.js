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

    // === 右侧扁平连续渲染 ===
    displayedMenus: [],            // [{ categoryId, categoryName, categoryIndex, menus: [...] }, ...]
    totalMatchCount: 0,            // 搜索命中总条数
    menuScrollTop: 0,              // 用于回顶
    isUserScrolling: false,        // 防止主动设置 scrollIntoView 与 bindscroll 冲突
    scrollLockTimer: null,         // 解锁定时器

    // === 滚动定位 ===
    scrollIntoViewCategoryId: '',  // 左侧分类栏定位目标
    scrollIntoViewMenuId: '',      // 右侧菜品栏定位目标

    _openidA: getApp().globalData._openidA,
    _openidB: getApp().globalData._openidB,
    userA: getApp().globalData.userA,
    userB: getApp().globalData.userB,
    currentOpenid: '',

    // === 购物车（数量加减模式） ===
    cart: {},                    // { [menuId]: count } 数量
    cartList: [],                // 购物车菜品列表（含 _count 字段）
    cartCount: 0,                // 总数量（所有菜数量累加）
    cartExpanded: false,         // 购物车展开/收起

    slideButtons: [
      { extClass: 'orderBtn', text: '点菜', src: "Images/icon_order.svg" },
      { extClass: 'starBtn', text: '星标', src: "Images/icon_star.svg" },
      { extClass: 'removeBtn', text: '删除', src: 'Images/icon_del.svg' }
    ],
  },

  // 页面加载时运行
  onUnload() {
    if (this.data.scrollLockTimer) {
      clearTimeout(this.data.scrollLockTimer);
      this.setData({ scrollLockTimer: null });
    }
  },

  async onShow() {
    await wx.cloud.callFunction({ name: 'getOpenId' }).then(res => {
      this.setData({ currentOpenid: res.result });
    }).catch(() => {});

    // 先加载分类（保证 buildDisplayedMenus 不会因 categories 为空而报错）
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
      this.buildDisplayedMenus();
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

  // 设置搜索：保留左侧激活分类，全局搜索所有 section，定位到第一道匹配菜
  onSearch(event) {
    const value = event.detail.value || '';
    this.setData({ search: value });
    this.buildDisplayedMenus();

    if (value && this.data.allMenus.length > 0 && this.data.categories.length > 0) {
      const lower = value.toLowerCase();
      // 在全局命中（displayedMenus 是按分类过滤后的）
      const firstMatch = (this.data.displayedMenus || []).find(section =>
        (section.menus || []).length > 0
      );
      if (firstMatch && firstMatch.menus[0]) {
        const matchedMenu = firstMatch.menus[0];
        // 同时联动左侧激活态到该分类
        this.setData({
          currentCategoryIndex: firstMatch.categoryIndex,
          currentCategoryName: firstMatch.categoryName
        });
        this.lockAutoScroll();
        this.setData({ scrollIntoViewMenuId: '' });
        wx.nextTick(() => {
          this.setData({ scrollIntoViewMenuId: 'menu-item-' + matchedMenu._id });
        });
      }
      // 无命中：不动 scrollIntoViewMenuId
    } else {
      // 清空搜索：不重置 scrollIntoViewMenuId，避免与 bindscroll 冲突
    }
  },

  // 清空搜索框：滚动回顶部
  clearSearch() {
    this.setData({ search: '' });
    this.buildDisplayedMenus();
    // 用 scroll-top 重置（最稳妥）
    this.lockAutoScroll();
    this.setData({ menuScrollTop: 0, scrollIntoViewMenuId: '' });
  },

  // 切换分类（保留搜索词，跨分类查找）
  switchCategory(event) {
    const index = event.currentTarget.dataset.index;
    const category = this.data.categories[index];

    // 第一步：先切换激活态
    this.setData({
      currentCategoryIndex: index,
      currentCategoryName: category.name
    });
    this.buildDisplayedMenus();

    // 第二步：等 DOM 稳定后，再设置滚动定位
    wx.nextTick(() => {
      // 1) 左侧分类栏定位
      this.setData({ scrollIntoViewCategoryId: 'category-item-' + index });

      // 2) 右侧滚动到该分类 section；如有搜索词则定位到第一道匹配菜
      const targetSectionId = 'menu-section-' + (category._id || `idx-${index}`);
      if (this.data.search) {
        const lower = this.data.search.toLowerCase();
        const firstMatch = (this.data.currentCategoryMenus || []).find(m =>
          (m.title || '').toLowerCase().includes(lower)
        );
        if (firstMatch) {
          this.lockAutoScroll();
          this.setData({ scrollIntoViewMenuId: '' });
          wx.nextTick(() => {
            this.setData({ scrollIntoViewMenuId: 'menu-item-' + firstMatch._id });
          });
        } else {
          this.lockAutoScroll();
          this.setData({ scrollIntoViewMenuId: '' });
          wx.nextTick(() => {
            this.setData({ scrollIntoViewMenuId: targetSectionId });
          });
        }
      } else {
        // 无搜索词：定位到 section 标题
        this.lockAutoScroll();
        this.setData({ scrollIntoViewMenuId: '' });
        wx.nextTick(() => {
          this.setData({ scrollIntoViewMenuId: targetSectionId });
        });
      }
    });
  },

  // 防止主动 scrollIntoView 与 bindscroll 冲突：短时间内忽略 bindscroll 联动
  lockAutoScroll() {
    if (this.data.scrollLockTimer) clearTimeout(this.data.scrollLockTimer);
    this.data.isUserScrolling = false;
    this.setData({ isUserScrolling: false });
    const that = this;
    const timer = setTimeout(() => {
      // 500ms 后允许 bindscroll 再次联动
      that.setData({ isUserScrolling: true, scrollLockTimer: null });
    }, 500);
    that.data.scrollLockTimer = timer;
  },

  // 监听右侧滚动：自动联动左侧分类激活态
  onMenuScroll(event) {
    const { scrollTop } = event.detail;
    // 取 scrollTop 对应的 section：根据每个 section 顶部的位置判断
    // 简化实现：使用 querySelector 找到最接近 scrollTop 上方的一个 section
    const query = wx.createSelectorQuery().in(this);
    query.selectAll('.menu-section').fields({
      rect: true, id: true, dataset: true
    }).exec((res) => {
      if (!res || !res[0] || res[0].length === 0) return;
      const sections = res[0];
      let activeIdx = -1;
      // 找到最后一个 top <= scrollTop + 100 的 section（100 为偏移容差）
      for (let i = 0; i < sections.length; i++) {
        const rect = sections[i];
        if (!rect) continue;
        const top = rect.top; // 相对 scroll-view 内容顶部的偏移
        if (top <= scrollTop + 100) {
          activeIdx = sections[i].dataset.categoryIndex;
        } else {
          break;
        }
      }
      if (activeIdx === -1) return;

      const { currentCategoryIndex, scrollIntoViewCategoryId } = this.data;
      if (activeIdx !== currentCategoryIndex) {
        // 联动左侧：更新激活态 + 滚动左侧分类栏
        this.setData({
          currentCategoryIndex: activeIdx,
          currentCategoryName: this.data.categories[activeIdx] ? this.data.categories[activeIdx].name : '全部',
          scrollIntoViewCategoryId: 'category-item-' + activeIdx
        });
      }
    });
  },

  // 按分类顺序生成扁平显示数据（保留 search 过滤）
  buildDisplayedMenus() {
    const { categories, allMenus, search } = this.data;

    if (!categories || categories.length === 0 || !allMenus || allMenus.length === 0) {
      this.setData({
        displayedMenus: [],
        currentCategoryMenus: [],
        totalMatchCount: 0
      });
      return;
    }

    const lower = (search || '').toLowerCase();

    // 按 categories 顺序构造 section
    const sections = categories
      .map((cat, idx) => {
        const isAll = cat._id === 'all';
        let menus = isAll
          ? allMenus.slice()
          : allMenus.filter(m => m.category === cat.name);

        if (lower) {
          menus = menus.filter(m => (m.title || '').toLowerCase().includes(lower));
        }

        return {
          categoryId: cat._id || `idx-${idx}`,
          categoryName: cat.name,
          categoryIndex: idx,
          menus
        };
      })
      // 去掉没有任何菜（且搜索命中也不空）的分类，避免空标题
      .filter(section => section.menus.length > 0);

    const totalMatchCount = sections.reduce((sum, s) => sum + s.menus.length, 0);

    // 兼容旧字段：取当前激活分类的菜单作为 currentCategoryMenus
    const activeIdx = Math.min(this.data.currentCategoryIndex || 0, sections.length - 1);
    const currentSection = sections[activeIdx] || sections[0];
    const currentCategoryMenus = currentSection ? currentSection.menus : [];

    this.setData({
      displayedMenus: sections,
      totalMatchCount,
      currentCategoryMenus,
      currentCategoryName: currentSection ? currentSection.categoryName : '全部'
    });
  },

  // 兼容旧调用（保留接口，内部直接调新方法）
  filterMenus() {
    this.buildDisplayedMenus();
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

  // === 购物车操作（数量加减） ===

  // +号：增加数量
  incCart(event) {
    const menuId = event.currentTarget.dataset.id;
    const menu = this.data.allMenus.find(m => m._id === menuId);
    if (!menu) return;

    const cart = { ...this.data.cart };
    const newCount = (cart[menuId] || 0) + 1;
    cart[menuId] = newCount;

    this.setData({ cart });
    this.refreshCart();
    wx.vibrateShort && wx.vibrateShort({ type: 'light' });
  },

  // -号：减少数量（减到 0 自动从购物车移除）
  decCart(event) {
    const menuId = event.currentTarget.dataset.id;
    const menu = this.data.allMenus.find(m => m._id === menuId);
    if (!menu) return;

    const cart = { ...this.data.cart };
    const newCount = (cart[menuId] || 0) - 1;
    if (newCount <= 0) {
      delete cart[menuId];
    } else {
      cart[menuId] = newCount;
    }

    this.setData({ cart });
    this.refreshCart();
    wx.vibrateShort && wx.vibrateShort({ type: 'light' });
  },

  // 兼容旧调用：长按菜品→设为星标逻辑里若使用
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
      confirmColor: '#2196F3',
      success: (res) => {
        if (res.confirm) {
          this.setData({ cart: {}, cartList: [], cartCount: 0 });
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
    const { cart, allMenus } = this.data;
    // 计算 cartList：每个有数量的菜品展开为 { ...menu, _count }
    const cartList = Object.keys(cart)
      .map(menuId => {
        const menu = allMenus.find(m => m._id === menuId);
        if (!menu) return null;
        return { ...menu, _count: cart[menuId] };
      })
      .filter(Boolean);
    // 总数量（累加 count）
    const cartCount = cartList.reduce((sum, m) => sum + (m._count || 0), 0);
    this.setData({ cartList, cartCount });
    this.buildDisplayedMenus(); // 重建 displayedMenus
  },

  // 确认下单
  async submitOrder() {
    if (this.data.cartCount === 0) {
      wx.showToast({ title: '购物车空空如也', icon: 'none' });
      return;
    }

    // 展开为独立的 dish 记录：每道菜按 count 重复展开
    const dishes = [];
    const userByOpenid = {
      [this.data._openidA]: this.data.userA,
      [this.data._openidB]: this.data.userB
    };
    const cookerNames = [];
    this.data.cartList.forEach(m => {
      const count = m._count || 1;
      for (let i = 0; i < count; i++) {
        dishes.push({
          menuId: m._id,
          title: m.title,
          category: m.category || '',
          desc: m.desc || '',
          _openid: m._openid
        });
      }
      const name = userByOpenid[m._openid];
      if (name && cookerNames.indexOf(name) === -1) {
        cookerNames.push(name);
      }
    });

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
          dishes,
          cookerNames,
          ordererName
        }
      });

      const orderId = orderRes.result && orderRes.result._id;

      // 2. 清空购物车 + 收起面板
      this.setData({
        cart: {},
        cartList: [],
        cartCount: 0,
        cartExpanded: false
      });

      wx.hideLoading();
      wx.showToast({ title: '下单成功', icon: 'success', duration: 1500 });

      await this.loadMenus();

      if (orderId) {
        // ===== 推送给厨师（每个 openid 推一次）=====
        const app = getApp();
        const me = await app.fetchMyName();
        const uniqueCookerOpenids = [...new Set(dishes.map(d => d._openid).filter(Boolean))];
        uniqueCookerOpenids.forEach(openid => {
          app.sendNotification({
            action: 'mission_accepted',
            me,
            name: title,
            page: 'pages/MissionDetail/index?id=' + orderId,
            targetOpenid: openid
          }).catch(() => {});
        });

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