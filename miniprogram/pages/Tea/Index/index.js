// pages/Tea/Index/index.js - 奶茶主页：列表 + 统计（在同一页）
const app = getApp();
const TeaData = require('../data.js');

function pad(n) { return String(n).padStart(2, '0'); }
function fmtDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function diffDays(aStr, bStr) {
  const a = new Date(aStr + 'T00:00:00');
  const b = new Date(bStr + 'T00:00:00');
  return Math.round((a - b) / 86400000);
}

Page({
  data: {
    // 主 Tab
    mainTab: 'list',             // 'list' | 'stats'

    // 列表数据
    allRecords: [],              // 全部（按 date 倒序）
    todayRecords: [],            // 今日
    todayStr: '',
    todayCount: 0,
    totalCount: 0,
    currentUser: '',

    // 评分展示
    ratingMap: {},
    brandColors: {},

    // 统计
    statsPeriod: 'month',
    statsPeriodLabel: '当月',
    statsChart: 'pie',
    statsChartLabel: '饼状图',
    statsTotalCount: 0,
    statsRanking: [],

    // 画布
    canvasId: 'teaChart',
    canvasW: 320,
    canvasH: 320,
  },

  onLoad() {
    const sys = wx.getSystemInfoSync();
    const w = sys.windowWidth;
    this.setData({
      canvasW: w - 64,
      canvasH: w - 64,
    });
  },

  onShow() {
    this.setData({
      ratingMap: TeaData.RATINGS.reduce((acc, r) => { acc[r.key] = r; return acc; }, {}),
      currentUser: app.globalData.userA || app.globalData.userB || '我',
    });
    const today = fmtDate(new Date());
    this.setData({ todayStr: today });
    this.loadBrandColors().then(() => this.loadRecords(today));
  },

  async loadBrandColors() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'tea',
        data: { action: 'listBrands' }
      });
      const brands = (res && res.result && res.result.data) || [];
      // 含 enabled=false 的历史品牌，用于历史记录正确显示颜色
      const colors = {};
      brands.forEach(b => { colors[b.name] = b.color || '#8E8E93'; });
      this.setData({ brandColors: colors });
    } catch (err) {
      console.error('loadBrandColors', err);
    }
  },

  async loadRecords(today) {
    try {
      const res = await wx.cloud.callFunction({ name: 'tea', data: { action: 'list' } });
      const records = (res && res.result && res.result.data) || [];

      // 全部：按 date 倒序 + createdAt 倒序
      const sorted = records.slice().sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });

      // 友好日期 + 评分 emoji
      const enriched = sorted.map(r => {
        const days = diffDays(r.date, today);
        let friendlyDate;
        if (days === 0) friendlyDate = '今天';
        else if (days === 1) friendlyDate = '昨天';
        else if (days > 1) friendlyDate = `${days} 天前`;
        else if (days === -1) friendlyDate = '明天';
        else friendlyDate = `${-days} 天后`;
        const rating = TeaData.RATINGS.find(x => x.key === r.rating) || TeaData.RATINGS[1];
        return { ...r, friendlyDate, ratingEmoji: rating.emoji };
      });

      // 今日：date == today
      const todayList = enriched.filter(r => r.date === today);

      this.setData({
        allRecords: enriched,
        todayRecords: todayList,
        todayCount: todayList.length,
        totalCount: records.length,
      });

      // 切到统计 Tab 时才重绘
      if (this.data.mainTab === 'stats') {
        this.refreshStats();
      }
    } catch (e) {
      console.error('loadRecords', e);
    }
  },

  // ===== 主 Tab 切换 =====
  switchMainTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ mainTab: tab });
    if (tab === 'stats') {
      this.refreshStats();
    }
  },

  // ===== 统计相关 =====
  refreshStats() {
    const records = this.data.allRecords;
    const filtered = this.filterByPeriod(records);
    const ranking = this.aggregateByBrand(filtered);
    this.setData({
      statsTotalCount: filtered.length,
      statsRanking: ranking,
    });
    // 等 DOM 更新后再画 canvas
    wx.nextTick(() => this.drawChart());
  },

  filterByPeriod(records) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    return records.filter(r => {
      if (!r.date) return false;
      const [y, m] = r.date.split('-').map(Number);
      if (this.data.statsPeriod === 'month') return y === year && (m - 1) === month;
      return y === year;
    });
  },

  aggregateByBrand(records) {
    const map = {};
    records.forEach(r => {
      if (!r.brand) return;
      map[r.brand] = (map[r.brand] || 0) + 1;
    });
    const list = Object.keys(map).map(k => ({
      key: k, label: k, color: this.data.brandColors[k] || '#8E8E93', count: map[k],
    }));
    const total = list.reduce((s, i) => s + i.count, 0) || 1;
    list.sort((a, b) => b.count - a.count);
    return list.map(i => ({ ...i, percent: Math.round((i.count / total) * 100) }));
  },

  onStatsPeriodTap(e) {
    const p = e.currentTarget.dataset.p;
    this.setData({
      statsPeriod: p,
      statsPeriodLabel: p === 'month' ? '当月' : '当年',
    });
    this.refreshStats();
  },

  onStatsChartTap(e) {
    const c = e.currentTarget.dataset.c;
    this.setData({
      statsChart: c,
      statsChartLabel: c === 'pie' ? '饼状图' : '柱状图',
    });
    this.drawChart();
  },

  // ===== 图表绘制 =====
  drawChart() {
    const { statsRanking, statsChart, canvasId, canvasW, canvasH, statsTotalCount } = this.data;
    if (statsTotalCount === 0 || statsRanking.length === 0) {
      const ctx = wx.createCanvasContext(canvasId, this);
      ctx.clearRect(0, 0, canvasW, canvasH);
      ctx.setFillStyle('#8E8E93');
      ctx.setFontSize(28);
      ctx.setTextAlign('center');
      ctx.fillText('暂无数据', canvasW / 2, canvasH / 2);
      ctx.draw();
      return;
    }
    if (statsChart === 'pie') {
      this.drawPie(statsRanking);
    } else {
      this.drawBar(statsRanking);
    }
  },

  drawPie(list) {
    const { canvasId, canvasW, canvasH } = this.data;
    const ctx = wx.createCanvasContext(canvasId, this);
    ctx.clearRect(0, 0, canvasW, canvasH);
    const cx = canvasW / 2;
    const cy = canvasH / 2;
    const r = Math.min(canvasW, canvasH) / 2 - 16;

    const total = list.reduce((s, i) => s + i.count, 0);
    let startAngle = -Math.PI / 2;
    const gap = 0.03;

    list.forEach(item => {
      const angle = (item.count / total) * Math.PI * 2;
      const endAngle = startAngle + angle - gap;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.closePath();
      ctx.setFillStyle(item.color);
      ctx.fill();
      startAngle += angle;
    });

    // 中空
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
    ctx.setFillStyle('#FFFFFF');
    ctx.fill();

    // 中心文字
    ctx.setFillStyle('#0D2A4D');
    ctx.setFontSize(40);
    ctx.setTextAlign('center');
    ctx.setTextBaseline('middle');
    ctx.fillText(String(total), cx, cy - 8);
    ctx.setFillStyle('#8E8E93');
    ctx.setFontSize(20);
    ctx.fillText('总杯数', cx, cy + 24);

    ctx.draw();
  },

  drawBar(list) {
    const { canvasId, canvasW, canvasH } = this.data;
    const ctx = wx.createCanvasContext(canvasId, this);
    ctx.clearRect(0, 0, canvasW, canvasH);

    const padL = 60;
    const padR = 24;
    const padT = 24;
    const padB = 24;
    const W = canvasW - padL - padR;
    const H = canvasH - padT - padB;

    const max = Math.max(...list.map(i => i.count)) || 1;
    const n = list.length;
    const rowH = Math.max(28, Math.min(48, H / n));
    const totalRowsH = rowH * n;
    const startY = padT + (H - totalRowsH) / 2;

    list.forEach((item, idx) => {
      const y = startY + idx * rowH;
      const barW = (item.count / max) * W;
      // 标签
      ctx.setFillStyle('#1F3A5F');
      ctx.setFontSize(20);
      ctx.setTextAlign('right');
      ctx.setTextBaseline('middle');
      const labelText = item.label.length > 6 ? item.label.slice(0, 6) + '..' : item.label;
      ctx.fillText(labelText, padL - 8, y + rowH / 2);
      // 柱条背景
      ctx.setFillStyle('#EEF3FA');
      ctx.fillRect(padL, y + 4, W, rowH - 8);
      // 柱条
      ctx.setFillStyle(item.color);
      ctx.fillRect(padL, y + 4, Math.max(2, barW), rowH - 8);
      // 数值
      ctx.setFillStyle('#0D2A4D');
      ctx.setFontSize(20);
      ctx.setTextAlign('left');
      ctx.fillText(`${item.count}杯 · ${item.percent}%`, padL + Math.max(2, barW) + 6, y + rowH / 2);
    });

    ctx.draw();
  },

  // ===== 添加 / 编辑 / 删除 =====
  onAdd() {
    wx.navigateTo({ url: '../Add/index' });
  },

  onTapItem(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '../Add/index?id=' + id });
  },

  // ===== 兼容：旧入口跳转（MainPage 仍可能调到 Stats） =====
  goStats() {
    this.setData({ mainTab: 'stats' });
  },
});