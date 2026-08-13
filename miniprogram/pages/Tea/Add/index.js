// pages/Tea/Add/index.js - 奶茶记录：新增 / 编辑
// 品牌：从 BrandList 动态加载（仅启用）
// 产品：自由填写（不再用 picker）
const app = getApp();
const TeaData = require('../data.js');

function pad(n) { return String(n).padStart(2, '0'); }
function fmtDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

Page({
  data: {
    isEdit: false,
    recordId: '',

    // 表单
    date: '',
    brandId: '',
    brandName: '',
    brandIndex: 0,
    brandNames: [],   // 用于 picker 显示
    brandColors: {},  // 品牌名 → 颜色
    product: '',      // 自由填写
    rating: 'good',
    note: '',

    // 评分展示
    ratings: TeaData.RATINGS,
  },

  onLoad(options) {
    const today = fmtDate(new Date());
    this.setData({
      date: today,
      rating: 'good',
      note: '',
    });

    // 先加载品牌列表
    this.loadBrands().then(() => {
      if (options.id) {
        this.setData({ isEdit: true, recordId: options.id });
        this.loadRecord(options.id);
        wx.setNavigationBarTitle({ title: '编辑奶茶' });
      }
    });
  },

  async loadBrands() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'tea',
        data: { action: 'listEnabledBrands' }
      });
      const brands = (res && res.result && res.result.data) || [];
      const brandNames = brands.map(b => b.name);
      const brandColors = {};
      brands.forEach(b => { brandColors[b.name] = b.color || '#8E8E93'; });
      this.setData({
        brandNames,
        brandColors,
        brandName: brandNames[0] || '',
        brandIndex: 0,
      });
    } catch (err) {
      console.error(err);
      wx.showToast({ title: '品牌加载失败', icon: 'none' });
    }
  },

  async loadRecord(id) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'tea',
        data: { action: 'list' }
      });
      const list = (res && res.result && res.result.data) || [];
      const target = list.find(r => r._id === id);
      if (!target) {
        wx.showToast({ title: '记录不存在', icon: 'error' });
        return;
      }
      // 找到对应品牌 index（可能已停用，仍允许编辑保留历史）
      const idx = this.data.brandNames.indexOf(target.brand);
      this.setData({
        date: target.date || this.data.date,
        brandName: target.brand || this.data.brandName,
        brandIndex: idx >= 0 ? idx : 0,
        product: target.product || '',
        rating: target.rating || 'good',
        note: target.note || '',
      });
    } catch (err) {
      console.error(err);
      wx.showToast({ title: '加载失败', icon: 'error' });
    }
  },

  onDateChange(e) {
    this.setData({ date: e.detail.value });
  },

  onBrandChange(e) {
    const idx = Number(e.detail.value) || 0;
    this.setData({
      brandIndex: idx,
      brandName: this.data.brandNames[idx],
    });
  },

  onProductInput(e) {
    this.setData({ product: e.detail.value });
  },

  onRatingTap(e) {
    const r = e.currentTarget.dataset.r;
    this.setData({ rating: r });
  },

  onNoteInput(e) {
    this.setData({ note: e.detail.value });
  },

  async onSave() {
    const { isEdit, recordId, date, brandName, product, rating, note } = this.data;
    if (!date || !brandName) {
      wx.showToast({ title: '请选择日期和品牌', icon: 'none' });
      return;
    }
    if (!product || !product.trim()) {
      wx.showToast({ title: '请填写具体奶茶', icon: 'none' });
      return;
    }
    wx.showLoading({ title: isEdit ? '保存中…' : '记录中…', mask: true });
    try {
      if (isEdit) {
        await wx.cloud.callFunction({
          name: 'tea',
          data: {
            action: 'update',
            _id: recordId,
            date, brand: brandName, product: product.trim(), rating,
            note: (note || '').trim(),
          }
        });
      } else {
        await wx.cloud.callFunction({
          name: 'tea',
          data: {
            action: 'add',
            date, brand: brandName, product: product.trim(), rating,
            note: (note || '').trim(),
          }
        });
      }
      wx.hideLoading();
      wx.showToast({ title: isEdit ? '已保存' : '已记录 🧋', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 600);
    } catch (err) {
      wx.hideLoading();
      console.error(err);
      wx.showToast({ title: isEdit ? '保存失败' : '记录失败', icon: 'error' });
    }
  },

  // 删除（仅编辑模式）
  onDelete() {
    if (!this.data.isEdit || !this.data.recordId) return;
    wx.showModal({
      title: '删除记录',
      content: `确认删除这条奶茶记录？`,
      confirmColor: '#FA5151',
      confirmText: '删除',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中…', mask: true });
        try {
          await wx.cloud.callFunction({
            name: 'tea',
            data: { action: 'delete', _id: this.data.recordId }
          });
          wx.hideLoading();
          wx.showToast({ title: '已删除', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 500);
        } catch (err) {
          wx.hideLoading();
          console.error(err);
          wx.showToast({ title: '删除失败', icon: 'error' });
        }
      }
    });
  },

  onCancel() {
    wx.navigateBack();
  },
});