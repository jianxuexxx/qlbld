// pages/Settings/brand-manage/index.js - 奶茶品牌管理（列表）
const app = getApp();

Page({
  data: {
    brands: [],          // 全部品牌（含停用）
    enabledCount: 0,
    disabledCount: 0,
  },

  onShow() {
    this.loadBrands();
  },

  async loadBrands() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'tea',
        data: { action: 'listBrands' }
      });
      const brands = (res && res.result && res.result.data) || [];
      const sorted = brands.slice().sort((a, b) => {
        if (!!a.enabled !== !!b.enabled) return a.enabled ? -1 : 1;
        return 0;
      });
      this.setData({
        brands: sorted,
        enabledCount: brands.filter(b => b.enabled !== false).length,
        disabledCount: brands.filter(b => b.enabled === false).length,
      });
    } catch (err) {
      console.error(err);
      wx.showToast({ title: '加载失败', icon: 'error' });
    }
  },

  onAdd() {
    wx.navigateTo({ url: '../brand-edit/index' });
  },

  // 点击品牌卡片 → 进入编辑页
  onEdit(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '../brand-edit/index?id=' + id });
  },
});