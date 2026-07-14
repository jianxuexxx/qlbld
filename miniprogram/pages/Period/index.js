/* 经期记录页 */
const app = getApp();

// ===== 日期工具函数 =====
function fmtDate(d) {
  if (!d) return '';
  const dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDate(s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function diffDays(a, b) {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return 0;
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

// 友好日期：今天 / 昨天 / N 天前 / 完整日期
function friendlyDate(dateStr, todayStr) {
  if (!dateStr) return '';
  if (dateStr === todayStr) return '今天';
  const d = diffDays(dateStr, todayStr);
  if (d === 1) return '昨天';
  if (d === 2) return '前天';
  if (d > 2 && d < 7) return `${d} 天前`;
  if (d >= 7 && d < 30) return `${Math.floor(d / 7)} 周前`;
  if (d >= 30 && d < 365) return `${Math.floor(d / 30)} 个月前`;
  if (d < 0) {
    if (d === -1) return '明天';
    if (d === -2) return '后天';
    if (d > -7) return `${-d} 天后`;
    if (d > -30) return `${Math.floor(-d / 7)} 周后`;
    return `${Math.floor(-d / 30)} 个月后`;
  }
  return dateStr;
}

const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];
function getWeekdayCN(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return '';
  return `周${WEEK_CN[d.getDay()]}`;
}

// 把扁平记录按 date 升序聚合为段
function buildSegments(records) {
  if (!records || !records.length) return [];
  const sorted = records.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const segments = [];
  let cur = null;
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    if (!r.date) continue;
    if (!cur) {
      cur = { startDate: r.date, endDate: r.date, dates: [r.date], hasEnd: r.type === 'end' };
    } else {
      const gap = diffDays(cur.endDate, r.date);
      if (gap === 1) {
        cur.endDate = r.date;
        cur.dates.push(r.date);
        if (r.type === 'end') cur.hasEnd = true;
      } else if (gap === 0) {
        if (r.type === 'end') cur.hasEnd = true;
      } else {
        segments.push(cur);
        cur = { startDate: r.date, endDate: r.date, dates: [r.date], hasEnd: r.type === 'end' };
      }
    }
  }
  if (cur) segments.push(cur);
  return segments.slice().reverse();
}

Page({
  data: {
    // 当前展示的月份
    calendarYear: 0,
    calendarMonth: 0,         // 1-12
    calendarDays: [],         // 该月日历格子
    weekLabels: ['日', '一', '二', '三', '四', '五', '六'],
    // 月份选择器可选范围
    yearRange: [],
    yearIndex: 0,             // 当前年份在 yearRange 中的索引
    monthRange: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    // 选中日期
    selectedDate: '',
    selectedDateInfo: {
      hasRecord: false,
      isPeriod: false,
      isEnd: false,
      recordId: null,
      segmentStart: '',
      segmentDay: 0,
    },
    todayStr: '',
    // 本次开始 / 上次结束
    summary: {
      hasData: false,
      currentStart: '',
      currentStartFriendly: '',
      currentStartWeekCN: '',
      lastEnd: '',
      lastEndFriendly: '',
      lastEndWeekCN: '',
    },
  },

  async onShow() {
    const now = new Date();
    const todayStr = fmtDate(now);
    const yearRange = this.buildYearRange();
    const yearIndex = Math.max(0, yearRange.indexOf(now.getFullYear()));
    // 默认展示当前月
    this.setData({
      calendarYear: now.getFullYear(),
      calendarMonth: now.getMonth() + 1,
      selectedDate: todayStr,
      todayStr,
      yearRange,
      yearIndex,
    });
    this.loadPeriodRecords();
  },

  // 构建年份可选范围（当前年 -5 ~ +1）
  buildYearRange() {
    const cur = new Date().getFullYear();
    const arr = [];
    for (let y = cur - 5; y <= cur + 1; y++) arr.push(y);
    return arr;
  },

  async loadPeriodRecords() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getList',
        data: { list: app.globalData.collectionPeriodList }
      });
      const raw = (res && res.result && res.result.data) || [];
      this.setData({ allPeriodRecords: raw });
      this.recompute();
    } catch (e) {
      console.error('加载经期记录失败', e);
    }
  },

  // 重新计算所有派生数据
  recompute() {
    this.computeSummary();
    this.buildCalendar();
  },

  // 计算顶部核心信息
  computeSummary() {
    const records = this.data.allPeriodRecords || [];
    const todayStr = this.data.todayStr;
    if (!records.length) {
      this.setData({
        summary: {
          hasData: false,
          currentStart: '',
          currentStartFriendly: '',
          currentStartWeekCN: '',
          lastEnd: '',
          lastEndFriendly: '',
          lastEndWeekCN: '',
        }
      });
      return;
    }

    const segments = buildSegments(records);
    // 数据获取规则：
    // - 本次开始：当前正在进行的经期段（最近的一段且 hasEnd=false）
    //   若所有段都已结束，则取最新段的 startDate
    // - 上次结束：当前经期段的 endDate（仅当当前段已标记 end 时才显示）
    //   若当前段未标记 end，则显示空（"无"）
    //   若没有进行中段，则取最新段的 endDate（前提是它已结束）
    const ongoing = segments.find(s => !s.hasEnd);
    // 最新段（已结束或进行中）
    const latest = segments[0];

    let currentStart = '';
    let lastEnd = '';

    if (ongoing) {
      // 当前段存在（未结束）
      currentStart = ongoing.startDate;
      // 当前段未结束 → 上次结束为空
      lastEnd = '';
    } else {
      // 没有进行中段 → 最新段一定是已结束
      if (latest) {
        currentStart = latest.startDate;
        lastEnd = latest.hasEnd ? latest.endDate : '';
      }
    }

    const summary = {
      hasData: true,
      currentStart,
      currentStartFriendly: friendlyDate(currentStart, todayStr),
      currentStartWeekCN: getWeekdayCN(currentStart),
      lastEnd,
      lastEndFriendly: friendlyDate(lastEnd, todayStr),
      lastEndWeekCN: getWeekdayCN(lastEnd),
    };
    this.setData({ summary });
  },

  // 构建日历
  buildCalendar() {
    const { calendarYear, calendarMonth, allPeriodRecords, selectedDate, todayStr } = this.data;
    if (!calendarYear || !calendarMonth) return;

    const firstDay = new Date(calendarYear, calendarMonth - 1, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth, 0).getDate();
    const today = todayStr || fmtDate(new Date());

    // 构造经期标记集合
    const periodSet = new Set();
    const startSet = new Set();
    const endSet = new Set();
    (allPeriodRecords || []).forEach(r => {
      if (!r.date) return;
      if (r.type === 'period' || r.type === 'end') {
        periodSet.add(r.date);
        if (r.type === 'end') endSet.add(r.date);
      }
    });

    // 段起始日
    const segments = buildSegments(allPeriodRecords || []);
    segments.forEach(seg => {
      startSet.add(seg.startDate);
    });

    const days = [];
    for (let i = 0; i < startWeekday; i++) {
      days.push({ empty: true, date: '', day: '' });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calendarYear}-${String(calendarMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const inPeriodDay = periodSet.has(dateStr);
      const isPeriodStart = startSet.has(dateStr);
      const isPeriodEnd = endSet.has(dateStr);
      const isToday = dateStr === today;
      const selected = dateStr === selectedDate;
      const seg = segments.find(s => dateStr >= s.startDate && dateStr <= s.endDate);
      const segmentDay = seg ? diffDays(seg.startDate, dateStr) + 1 : 0;
      days.push({
        empty: false,
        date: dateStr,
        day: d,
        isToday,
        inPeriod: inPeriodDay,
        isPeriodStart,
        isPeriodEnd,
        selected,
        segmentDay,
      });
    }

    this.setData({ calendarDays: days });
    this.updateSelectedDateInfo();
  },

  // 更新选中日期的详情
  updateSelectedDateInfo() {
    const { selectedDate, allPeriodRecords, todayStr } = this.data;
    if (!selectedDate) {
      this.setData({
        selectedDateInfo: {
          hasRecord: false, isPeriod: false, isEnd: false, recordId: null,
          segmentStart: '', segmentDay: 0,
        }
      });
      return;
    }

    const todays = (allPeriodRecords || []).filter(r => r.date === selectedDate);
    const hasRecord = todays.length > 0;
    const isPeriod = todays.some(r => r.type === 'period' || r.type === 'end');
    const isEnd = todays.some(r => r.type === 'end');
    const recId = todays[0] ? todays[0]._id : null;

    const segments = buildSegments(allPeriodRecords || []);
    const seg = segments.find(s => selectedDate >= s.startDate && selectedDate <= s.endDate);
    const segmentStart = seg ? seg.startDate : '';
    const segmentDay = seg ? diffDays(seg.startDate, selectedDate) + 1 : 0;

    this.setData({
      selectedDateInfo: {
        hasRecord,
        isPeriod,
        isEnd,
        recordId: recId,
        segmentStart,
        segmentStartFriendly: friendlyDate(segmentStart, todayStr),
        segmentDay,
      },
      selectedDateFriendly: friendlyDate(selectedDate, todayStr),
      selectedDateWeekCN: getWeekdayCN(selectedDate),
    });
  },

  // ===== 年份/月份选择 =====
  // picker 回调 e.detail.value 是选中项在 range 里的索引
  onYearChange(e) {
    const idx = Number(e.detail.value);
    const year = this.data.yearRange[idx];
    if (!year) return;
    this.setData({ calendarYear: year, yearIndex: idx });
    this.buildCalendar();
  },
  onMonthChange(e) {
    const idx = Number(e.detail.value);
    const month = idx + 1; // 月份范围 1-12
    if (!month || month < 1 || month > 12) return;
    this.setData({ calendarMonth: month });
    this.buildCalendar();
  },

  // 上一月
  prevMonth() {
    let { calendarYear, calendarMonth, yearRange } = this.data;
    calendarMonth -= 1;
    if (calendarMonth < 1) { calendarMonth = 12; calendarYear -= 1; }
    const yearIndex = Math.max(0, yearRange.indexOf(calendarYear));
    this.setData({ calendarYear, calendarMonth, yearIndex });
    this.buildCalendar();
  },
  // 下一月
  nextMonth() {
    let { calendarYear, calendarMonth, yearRange } = this.data;
    calendarMonth += 1;
    if (calendarMonth > 12) { calendarMonth = 1; calendarYear += 1; }
    const yearIndex = Math.max(0, yearRange.indexOf(calendarYear));
    this.setData({ calendarYear, calendarMonth, yearIndex });
    this.buildCalendar();
  },

  // 点击日历某天
  onTapCalendarDay(e) {
    const date = e.currentTarget.dataset.date;
    if (!date) return;
    this.setData({ selectedDate: date });
    this.buildCalendar();
  },

  // 标记某一天为「经期中」
  async onMarkPeriod() {
    const { selectedDate } = this.data;
    if (!selectedDate) return;
    if (selectedDate > fmtDate(new Date())) {
      wx.showToast({ title: '不能标记未来日期', icon: 'none' });
      return;
    }
    const existing = (this.data.allPeriodRecords || []).find(r => r.date === selectedDate);
    if (existing) {
      wx.showToast({ title: '该日期已有记录', icon: 'none' });
      return;
    }
    try {
      wx.showLoading({ title: '保存中…', mask: true });
      await wx.cloud.callFunction({
        name: 'addPeriod',
        data: {
          list: app.globalData.collectionPeriodList,
          date: selectedDate,
          type: 'period',
        }
      });
      wx.hideLoading();
      wx.showToast({ title: '已记录 📌', icon: 'success' });
      this.loadPeriodRecords();
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '记录失败', icon: 'error' });
    }
  },

  // 标记某一天为「结束经期」
  async onMarkEnd() {
    const { selectedDate } = this.data;
    if (!selectedDate) return;
    if (selectedDate > fmtDate(new Date())) {
      wx.showToast({ title: '不能标记未来日期', icon: 'none' });
      return;
    }
    const recToday = (this.data.allPeriodRecords || []).find(r => r.date === selectedDate);
    const prev = new Date(selectedDate);
    prev.setDate(prev.getDate() - 1);
    const prevStr = fmtDate(prev);
    const recPrev = (this.data.allPeriodRecords || []).find(
      r => r.date === prevStr && (r.type === 'period' || r.type === 'end')
    );
    if (!recToday && !recPrev) {
      wx.showToast({ title: '请先标记当天或前一天为经期', icon: 'none' });
      return;
    }

    try {
      wx.showLoading({ title: '保存中…', mask: true });
      if (!recToday) {
        await wx.cloud.callFunction({
          name: 'addPeriod',
          data: { list: app.globalData.collectionPeriodList, date: selectedDate, type: 'period' }
        });
      }
      await wx.cloud.callFunction({
        name: 'addPeriod',
        data: { list: app.globalData.collectionPeriodList, date: selectedDate, type: 'end' }
      });
      wx.hideLoading();
      wx.showToast({ title: '已标记结束 🌙', icon: 'success' });
      this.loadPeriodRecords();
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '记录失败', icon: 'error' });
    }
  },

  // 取消当天标记
  async onCancelMark() {
    const { selectedDate } = this.data;
    if (!selectedDate) {
      wx.showToast({ title: '当天无记录', icon: 'none' });
      return;
    }
    const todays = (this.data.allPeriodRecords || []).filter(r => r.date === selectedDate);
    if (todays.length === 0) {
      wx.showToast({ title: '当天无记录', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '取消当天记录',
      content: '确认删除当天的经期记录吗？',
      confirmColor: '#FA5151',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          wx.showLoading({ title: '删除中…', mask: true });
          for (const r of todays) {
            await wx.cloud.callFunction({
              name: 'deletePeriod',
              data: { list: app.globalData.collectionPeriodList, _id: r._id }
            });
          }
          wx.hideLoading();
          wx.showToast({ title: '已删除', icon: 'success' });
          this.loadPeriodRecords();
        } catch (e) {
          wx.hideLoading();
          wx.showToast({ title: '删除失败', icon: 'error' });
        }
      }
    });
  },
});