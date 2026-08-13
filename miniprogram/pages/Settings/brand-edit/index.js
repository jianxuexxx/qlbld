// pages/Settings/brand-edit/index.js - 新增 / 编辑品牌（共用）
const app = getApp();
const TeaData = require('../../Tea/data.js');

Page({
  data: {
    isEdit: false,
    brandId: '',

    name: '',
    color: '#2196F3',       // 当前选中颜色
    isCustom: false,        // 是否自定义颜色
    customColor: '',        // 自定义颜色输入值
    enabled: true,

    colors: TeaData.BRAND_COLORS,
  },

  onLoad(options) {
    if (options.id) {
      wx.setNavigationBarTitle({ title: '编辑品牌' });
      this.setData({ isEdit: true, brandId: options.id });
      this.loadBrand(options.id);
    }
  },

  async loadBrand(id) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'tea',
        data: { action: 'listBrands' }
      });
      const brands = (res && res.result && res.result.data) || [];
      const target = brands.find(b => b._id === id);
      if (!target) {
        wx.showToast({ title: '品牌不存在', icon: 'error' });
        return;
      }
      const presetValues = TeaData.BRAND_COLORS.map(c => c.value.toUpperCase());
      const tColor = (target.color || '#2196F3').toUpperCase();
      const isCustom = !presetValues.includes(tColor);
      this.setData({
        name: target.name || '',
        color: target.color || '#2196F3',
        isCustom,
        customColor: isCustom ? target.color : '',
        enabled: target.enabled !== false,
      });
    } catch (err) {
      console.error(err);
      wx.showToast({ title: '加载失败', icon: 'error' });
    }
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value });
  },

  onColorSelect(e) {
    const c = e.currentTarget.dataset.color;
    this.setData({ color: c, isCustom: false });
  },

  // 自定义颜色输入（实时）
  onCustomColorInput(e) {
    const v = (e.detail.value || '').trim();
    this.setData({
      customColor: v,
      isCustom: v.length > 0,
      color: v || this.data.color,
    });
  },

  onToggleEnabled(e) {
    this.setData({ enabled: e.detail.value });
  },

  async onSave() {
    const { isEdit, brandId, name, color, enabled } = this.data;
    const trimmed = (name || '').trim();
    if (!trimmed) {
      wx.showToast({ title: '请输入品牌名', icon: 'none' });
      return;
    }
    // 颜色校验：必须是 hex 格式
    let finalColor = color;
    if (this.data.isCustom) {
      const hex = (this.data.customColor || '').trim();
      if (!/^#([0-9A-Fa-f]{6})$/.test(hex)) {
        wx.showToast({ title: '颜色格式错误，应为 #RRGGBB', icon: 'none' });
        return;
      }
      finalColor = hex;
    }

    wx.showLoading({ title: isEdit ? '保存中…' : '新增中…', mask: true });
    try {
      // 编辑时保留原 products 列表（这里不再编辑产品）
      if (isEdit) {
        await wx.cloud.callFunction({
          name: 'tea',
          data: {
            action: 'editBrand',
            _id: brandId,
            name: trimmed,
            color: finalColor,
            enabled,
          }
        });
      } else {
        await wx.cloud.callFunction({
          name: 'tea',
          data: {
            action: 'addBrand',
            name: trimmed,
            products: [],
            color: finalColor,
          }
        });
      }
      wx.hideLoading();
      wx.showToast({ title: isEdit ? '已保存' : '已新增', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 500);
    } catch (err) {
      wx.hideLoading();
      console.error(err);
      const msg = (err && err.errMsg) || (err && err.message) || '';
      const tip = msg.includes('已存在') ? '品牌名已存在' : (isEdit ? '保存失败' : '新增失败');
      wx.showToast({ title: tip, icon: 'error' });
    }
  },

  onCancel() {
    wx.navigateBack();
  },
});