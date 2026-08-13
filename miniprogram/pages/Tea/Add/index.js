// pages/Tea/Add/index.js - 奶茶记录：新增 / 编辑
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
    brandIndex: 0,
    brandName: '',
    brandNames: [],
    productIndex: 0,
    productName: '',
    products: [],
    rating: 'good',
    note: '',

    // 展示用
    ratings: TeaData.RATINGS,
    brandColors: {},
  },

  onLoad(options) {
    const today = fmtDate(new Date());

    // 构造品牌名数组 + 颜色映射
    const brandNames = TeaData.BRANDS.map(b => b.name);
    const brandColors = {};
    TeaData.BRANDS.forEach(b => { brandColors[b.name] = b.color; });

    if (options.id) {
      // 编辑模式：进入后加载原记录
      this.setData({
        isEdit: true,
        recordId: options.id,
        date: today,
        brandNames,
        brandColors,
        products: TeaData.BRANDS[0].products,
      });
      this.loadRecord(options.id);
    } else {
      this.setData({
        isEdit: false,
        date: today,
        brandIndex: 0,
        brandName: TeaData.BRANDS[0].name,
        brandNames,
        brandColors,
        products: TeaData.BRANDS[0].products,
        productIndex: 0,
        productName: TeaData.BRANDS[0].products[0],
        rating: 'good',
        note: '',
      });
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
      const brandIdx = TeaData.BRANDS.findIndex(b => b.name === target.brand);
      const bIdx = brandIdx >= 0 ? brandIdx : 0;
      const brand = TeaData.BRANDS[bIdx];
      const productIdx = brand.products.indexOf(target.product);
      this.setData({
        date: target.date || this.data.date,
        brandIndex: bIdx,
        brandName: brand.name,
        products: brand.products,
        productIndex: productIdx >= 0 ? productIdx : 0,
        productName: brand.products[productIdx >= 0 ? productIdx : 0],
        rating: target.rating || 'good',
        note: target.note || '',
      });
      wx.setNavigationBarTitle({ title: '编辑奶茶' });
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
    const brand = TeaData.BRANDS[idx];
    this.setData({
      brandIndex: idx,
      brandName: brand.name,
      products: brand.products,
      productIndex: 0,
      productName: brand.products[0],
    });
  },

  onProductChange(e) {
    const idx = Number(e.detail.value) || 0;
    this.setData({
      productIndex: idx,
      productName: this.data.products[idx],
    });
  },

  onRatingTap(e) {
    const r = e.currentTarget.dataset.r;
    this.setData({ rating: r });
  },

  onNoteInput(e) {
    this.setData({ note: e.detail.value });
  },

  async onSave() {
    const { isEdit, recordId, date, brandName, productName, rating, note } = this.data;
    if (!date || !brandName || !productName) {
      wx.showToast({ title: '请完整填写', icon: 'none' });
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
            date, brand: brandName, product: productName, rating,
            note: (note || '').trim(),
          }
        });
      } else {
        await wx.cloud.callFunction({
          name: 'tea',
          data: {
            action: 'add',
            date, brand: brandName, product: productName, rating,
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

  onCancel() {
    wx.navigateBack();
  },
});