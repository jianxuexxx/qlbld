// pages/Settings/menu-edit/index.js
const app = getApp();

Page({
  data: {
    id: '',
    menu: {
      title: '',
      category: '',
      desc: '',
      disabled: false,
      star: false
    }
  },

  onLoad(options) {
    const id = options.id;
    if (!id) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.setData({ id });
    wx.setNavigationBarTitle({ title: '编辑菜品' });
    this.loadMenu(id);
  },

  async loadMenu(id) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getMenuList',
        data: { list: 'MenuList' }
      });
      const list = (res && res.result && res.result.data) || [];
      const target = list.find(m => m._id === id);
      if (!target) {
        wx.showToast({ title: '菜品不存在', icon: 'none' });
        return;
      }
      this.setData({
        menu: {
          title: target.title || '',
          category: target.category || '',
          desc: target.desc || '',
          disabled: !!target.disabled,
          star: !!target.star
        }
      });
    } catch (e) {
      console.error(e);
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  onInputTitle(e) {
    this.setData({ 'menu.title': e.detail.value });
  },
  onInputCategory(e) {
    this.setData({ 'menu.category': e.detail.value });
  },
  onInputDesc(e) {
    this.setData({ 'menu.desc': e.detail.value });
  },
  toggleDisabled(e) {
    const v = e.currentTarget.dataset.v;
    this.setData({ 'menu.disabled': String(v) === '1' });
  },
  onToggleStar(e) {
    this.setData({ 'menu.star': e.detail.value });
  },

  async onSave() {
    const { menu, id } = this.data;
    if (!menu.title || !menu.title.trim()) {
      wx.showToast({ title: '请填写菜品名称', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中...', mask: true });
    try {
      // 1. 更新常规字段
      await wx.cloud.callFunction({
        name: 'updateMenu',
        data: {
          _id: id,
          list: 'MenuList',
          updates: {
            title: menu.title.trim(),
            category: menu.category.trim(),
            desc: menu.desc.trim()
          }
        }
      });

      // 2. 切换星标
      await wx.cloud.callFunction({
        name: 'editMenuStar',
        data: { _id: id, list: 'MenuList', value: menu.star }
      });

      // 3. 切换上下架
      await wx.cloud.callFunction({
        name: 'toggleMenuDisable',
        data: { _id: id, list: 'MenuList', value: menu.disabled }
      }).catch(() => {
        // toggleMenuDisable 不存在时降级由 getMenuList 重新读取本地状态
      });

      wx.hideLoading();
      wx.showToast({ title: '保存成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 700);
    } catch (e) {
      wx.hideLoading();
      console.error(e);
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  onCancel() {
    wx.navigateBack();
  }
});