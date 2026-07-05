// pages/Settings/menu-manage/index.js
const app = getApp();

Page({
  data: {
    allMenus: [],
    filteredMenus: [],
    search: '',
    filter: 'all', // all / on / off
    _openidA: app.globalData._openidA,
    _openidB: app.globalData._openidB,
    userA: app.globalData.userA,
    userB: app.globalData.userB,
    currentOpenid: '',

    // 左右滑动按钮（根据上下架动态切）
    offSlideButtons: [
      { extClass: 'editBtn', text: '编辑', src: 'Images/icon_edit.svg' },
      { extClass: 'starBtn', text: '星标', src: 'Images/icon_star.svg' },
      { extClass: 'removeBtn', text: '删除', src: 'Images/icon_del.svg' }
    ],
    onSlideButtons: [
      { extClass: 'editBtn', text: '编辑', src: 'Images/icon_edit.svg' },
      { extClass: 'starBtn', text: '星标', src: 'Images/icon_star.svg' },
      { extClass: 'removeBtn', text: '下架', src: 'Images/icon_del.svg' }
    ]
  },

  onLoad() {
    // 设置 NavigationBar 标题
    wx.setNavigationBarTitle({ title: '维护菜单' });
  },

  onShow() {
    // 先同步刷新 userA/userB 再加载列表
    const app = getApp();
    app.refreshUserNames && app.refreshUserNames().then(() => {
      this.setData({
        userA: app.globalData.userA,
        userB: app.globalData.userB,
        _openidA: app.globalData._openidA,
        _openidB: app.globalData._openidB
      });
      this.loadMenus();
    });
  },

  async loadMenus() {
    wx.showLoading({ title: '加载中...', mask: true });
    try {
      const openidRes = await wx.cloud.callFunction({ name: 'getOpenId' }).catch(() => null);
      const currentOpenid = (openidRes && openidRes.result) || '';

      const res = await wx.cloud.callFunction({ name: 'getMenuList', data: { list: 'MenuList' } });
      const menus = (res && res.result && res.result.data) || [];

      this.setData({
        allMenus: menus,
        currentOpenid
      });
      this.applyFilter();

      // 设置红点
      const onCount = menus.filter(m => !m.disabled).length;
      const offCount = menus.length - onCount;
      wx.setTabBarBadge && menus.length > 0 && wx.removeTabBarBadge && wx.removeTabBarBadge({ index: 3 });
    } catch (e) {
      console.error('loadMenus', e);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  // 应用搜索 + 筛选
  applyFilter() {
    const { allMenus, search, filter } = this.data;
    const lower = (search || '').toLowerCase();
    let list = allMenus.slice();
    if (filter === 'on') list = list.filter(m => !m.disabled);
    else if (filter === 'off') list = list.filter(m => !!m.disabled);
    if (lower) list = list.filter(m => (m.title || '').toLowerCase().includes(lower));

    const totalCount = allMenus.length;
    const onCount = allMenus.filter(m => !m.disabled).length;
    const offCount = totalCount - onCount;

    this.setData({
      filteredMenus: list,
      totalCount,
      onCount,
      offCount
    });
  },

  // 搜索
  onSearch(e) {
    this.setData({ search: e.detail.value || '' });
    this.applyFilter();
  },
  clearSearch() {
    this.setData({ search: '' });
    this.applyFilter();
  },

  // 切筛选
  setFilter(e) {
    this.setData({ filter: e.currentTarget.dataset.f });
    this.applyFilter();
  },

  // 左划按钮事件
  slideButtonTap(e) {
    const { index } = e.detail;
    const { id, name } = e.currentTarget.dataset;
    if (index === 0) {
      // 编辑：跳编辑页
      wx.navigateTo({ url: '/pages/Settings/menu-edit/index?id=' + id });
    } else if (index === 1) {
      // 星标
      this.toggleStar(id);
    } else if (index === 2) {
      // 删除 / 下架：根据 disabled 状态切换文案
      const menu = this.data.allMenus.find(m => m._id === id);
      if (!menu) return;
      if (menu.disabled) {
        // 已下架 → 真删除
        wx.showModal({
          title: '删除菜品',
          content: `确定要彻底删除「${name}」吗？此操作不可恢复`,
          confirmColor: '#FF3B30',
          success: r => { if (r.confirm) this.deleteMenu(id); }
        });
      } else {
        // 在售 → 下架
        wx.showModal({
          title: '下架菜品',
          content: `确定要下架「${name}」吗？下架后顾客看不到`,
          confirmColor: '#FF9800',
          success: r => { if (r.confirm) this.toggleDisable(id, true); }
        });
      }
    }
  },

  // 切换星标
  async toggleStar(id) {
    const menu = this.data.allMenus.find(m => m._id === id);
    if (!menu) return;
    try {
      await wx.cloud.callFunction({
        name: 'editMenuStar',
        data: { _id: id, list: 'MenuList', value: !menu.star }
      });
      menu.star = !menu.star;
      this.applyFilter();
      wx.showToast({ title: menu.star ? '已星标' : '已取消', icon: 'success' });
    } catch (e) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  // 切换上下架
  async toggleDisable(id, disabled) {
    try {
      await wx.cloud.callFunction({
        name: 'toggleMenuDisable',
        data: { _id: id, list: 'MenuList', value: disabled }
      });
      const menu = this.data.allMenus.find(m => m._id === id);
      if (menu) menu.disabled = disabled;
      this.applyFilter();
      wx.showToast({ title: disabled ? '已下架' : '已上架', icon: 'success' });
    } catch (e) {
      // 云函数 toggleMenuDisable 不存在时，降级本地操作
      console.warn('toggleMenuDisable fail, fallback local:', e);
      const menu = this.data.allMenus.find(m => m._id === id);
      if (menu) {
        menu.disabled = disabled;
        this.applyFilter();
        wx.showToast({ title: disabled ? '已下架' : '已上架', icon: 'success' });
      }
    }
  },

  // 真删除
  async deleteMenu(id) {
    try {
      await wx.cloud.callFunction({ name: 'deleteMenu', data: { _id: id, list: 'MenuList' } });
      this.setData({
        allMenus: this.data.allMenus.filter(m => m._id !== id)
      });
      this.applyFilter();
      wx.showToast({ title: '已删除', icon: 'success' });
    } catch (e) {
      wx.showToast({ title: '删除失败', icon: 'none' });
    }
  },

  // 点击行（也进入编辑）
  onTapRow(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/Settings/menu-edit/index?id=' + id });
  },

  // 控制左划展示（避免一屏多个展开）
  onSlideShow(e) {
    const openedId = e.currentTarget.dataset.showId;
    const next = this.data.filteredMenus.map(m => ({
      ...m,
      _showSlide: m._id === openedId
    }));
    this.setData({ filteredMenus: next });
  },

  // 新增
  onTapAdd() {
    wx.navigateTo({ url: '/pages/MenuAdd/index' });
  }
});
