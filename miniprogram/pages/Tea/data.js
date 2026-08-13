// pages/Tea/data.js
// 奶茶相关静态数据（品牌/产品由用户在"设置 → 维护奶茶品牌"管理）
module.exports = {
  // 评分档位
  RATINGS: [
    { key: 'good', label: '好喝', emoji: '👍', color: '#07C160' },
    { key: 'normal', label: '一般', emoji: '😐', color: '#8E8E93' },
    { key: 'bad', label: '避雷', emoji: '👎', color: '#FA5151' },
  ],

  // 8 色预设
  BRAND_COLORS: [
    { name: '蓝', value: '#2196F3' },
    { name: '红', value: '#E74C3C' },
    { name: '橙', value: '#F39C12' },
    { name: '绿', value: '#27AE60' },
    { name: '青', value: '#16A085' },
    { name: '紫', value: '#8E44AD' },
    { name: '粉', value: '#E91E63' },
    { name: '棕', value: '#795548' },
  ],
};