/* 经期记录页 */
const app = getApp();

// ===== 日期工具函数 =====
// 把 Date 转 YYYY-MM-DD
function fmtDate(d) {
  if (!d) return '';
  const dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 把 YYYY-MM-DD 转 Date（00:00 本地）
function parseDate(s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

// 两个 YYYY-MM-DD 字符串相差的天数（b - a）
function diffDays(a, b) {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return 0;
  const ms = db.getTime() - da.getTime();
  return Math.round(ms / 86400000);
}

// 友好日期格式：今天 / 昨天 / 前天 / N 天前 / N 周前 / YYYY-MM-DD
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
    // 未来日期
    if (d === -1) return '明天';
    if (d === -2) return '后天';
    if (d > -7) return `${-d} 天后`;
    if (d > -30) return `${Math.floor(-d / 7)} 周后`;
    return `${Math.floor(-d / 30)} 个月后`;
  }
  return dateStr;
}

// 中文星期
const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];
function getWeekdayCN(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return '';
  return `周${WEEK_CN[d.getDay()]}`;
}

// MM-DD 简短格式（用于列表右侧）
function shortMD(dateStr) {
  if (!dateStr) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return dateStr;
  return `${m[2]}-${m[3]}`;
}

// ===== 经期数据模型 =====
// 数据库中每条记录（每天一条）：
//   { _openid, date: 'YYYY-MM-DD', type: 'period' | 'end', createdAt }
// 每次连续经期段的标识：type='period' 表示该日为经期中；type='end' 表示该日是结束日（也是经期最后一天）
// 多个连续的 type='period' 天聚合为一段，最后一段若有 type='end' 则表示已结束

// 把扁平记录按 date 升序聚合为段（segments）
// segments: [{ startDate, endDate, dates: [date1, date2, ...], isOngoing }]
function buildSegments(records) {
  if (!records || !records.length) return [];
  // 按 date 升序排序
  const sorted = records.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const segments = [];
  let cur = null;
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    if (!r.date) continue;
    if (!cur) {
      cur = { startDate: r.date, endDate: r.date, dates: [r.date], hasEnd: r.type === 'end' };
    } else {
      // 判断是否与 cur 连续（date 与 cur.endDate 相差 1 天）
      const gap = diffDays(cur.endDate, r.date);
      if (gap === 1) {
        // 连续：合并
        cur.endDate = r.date;
        cur.dates.push(r.date);
        if (r.type === 'end') cur.hasEnd = true;
      } else if (gap === 0) {
        // 同一天：取更"重"的状态
        if (r.type === 'end') cur.hasEnd = true;
      } else {
        // 不连续：push 当前段，开启新段
        segments.push(cur);
        cur = { startDate: r.date, endDate: r.date, dates: [r.date], hasEnd: r.type === 'end' };
      }
    }
  }
  if (cur) segments.push(cur);
  // 倒序：最新段在前
  return segments.slice().reverse();
}

// 计算段内已确认的天数 + 是否进行中
function segmentInfo(seg, todayStr) {
  // 段内 days = 日期集合长度
  const days = seg.dates.length;
  // 进行中：最后一天不是今天之前的日子 且 未标记 end
  const lastDay = seg.endDate;
  const isOngoing = !seg.hasEnd && lastDay >= todayStr;
  return { days, isOngoing };
}

Page({
  data: {
    // 扁平记录（按 date 倒序）
    periodRecords: [],
    // 段（按 startDate 倒序），每段有 days/isOngoing
    periodSegments: [],
    periodSummary: {
      hasData: false,
      inPeriod: false,
      currentStart: '',
      currentEnd: '',
      currentDuration: 0,
      predictedEnd: '',
      predictedDuration: 0,
      nextPredictedStart: '',
      daysUntilNext: null,
      totalCycles: 0,
      avgCycle: null,
      avgDuration: null,
      lastCycle: null,
      lastDuration: null,
      shortestCycle: null,
    },
    weekLabels: ['日', '一', '二', '三', '四', '五', '六'],
    calendarYear: 0,
    calendarMonth: 0,
    calendarDays: [],
    selectedDate: '',
    selectedDateInfo: {
      isPeriod: false,        // 是否被标记为经期中
      isEnd: false,           // 是否被标记为结束
      hasRecord: false,       // 当天是否有记录
      recordId: null,         // 当天记录的 _id（如有）
      segmentStart: '',       // 所在段的开始日
      segmentDay: 0,          // 在该段中是第几天（1-based）
    },
    todayStr: '',             // 用于渲染的今日字符串
  },

  async onShow() {
    const now = new Date();
    const todayStr = fmtDate(now);
    this.setData({
      calendarYear: now.getFullYear(),
      calendarMonth: now.getMonth() + 1,
      selectedDate: todayStr,
      todayStr,
      selectedDateFriendly: friendlyDate(todayStr, todayStr),
      selectedDateWeekCN: getWeekdayCN(todayStr),
    });
    this.loadPeriodRecords();
  },

  // 加载经期记录
  async loadPeriodRecords() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getList',
        data: { list: app.globalData.collectionPeriodList }
      });
      const raw = (res && res.result && res.result.data) || [];
      // 按 date 倒序展示（用于历史记录列表）
      const records = raw.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      this.setData({ periodRecords: records });
      this.computePeriodSummary();
      this.buildCalendar();
    } catch (e) {
      console.error('加载经期记录失败', e);
    }
  },

  // 计算 summary + segments
  computePeriodSummary() {
    const records = this.data.periodRecords || [];
    if (!records.length) {
      this.setData({
        periodSegments: [],
        periodSummary: {
          hasData: false,
          inPeriod: false,
          currentStart: '',
          currentEnd: '',
          currentDuration: 0,
          predictedEnd: '',
          predictedDuration: 0,
          nextPredictedStart: '',
          daysUntilNext: null,
          totalCycles: 0,
          avgCycle: null,
          avgDuration: null,
          lastCycle: null,
          lastDuration: null,
          shortestCycle: null,
        }
      });
      return;
    }

    // 构造成段（按 date 升序后再聚合）
    const segments = buildSegments(records);

    // 计算段与段之间的周期（天）
    const segAsc = segments.slice().reverse(); // 升序
    const cycles = [];
    for (let i = 1; i < segAsc.length; i++) {
      const d = diffDays(segAsc[i - 1].startDate, segAsc[i].startDate);
      if (d > 0 && d < 365) cycles.push(d);
    }

    // 已结束段的经期天数
    const durations = segments
      .filter(s => s.hasEnd)
      .map(s => s.dates.length);

    // 平均值
    const avg = (arr) => arr.length ? Math.round(arr.reduce((s, n) => s + n, 0) / arr.length * 10) / 10 : null;
    const avgCycle = avg(cycles);
    const avgDuration = avg(durations);

    const lastCycle = cycles.length ? cycles[cycles.length - 1] : null;
    const lastDuration = durations.length ? durations[durations.length - 1] : null;
    const shortestCycle = cycles.length ? Math.min(...cycles) : null;

    // 当前经期段（最新且进行中）
    const todayStr = this.data.todayStr || fmtDate(new Date());
    const ongoing = segments.find(s => !s.hasEnd && s.endDate >= todayStr);

    // 预测基准
    const recentCycles = cycles.slice(-3);
    const baseCycle = avg(recentCycles) || avgCycle || 28;
    const baseDuration = lastDuration || avgDuration || 5;

    let inPeriod = false;
    let currentStart = '';
    let currentEnd = '';
    let currentDuration = 0;
    let predictedEnd = '';
    let predictedDuration = 0;
    let nextPredictedStart = '';
    let daysUntilNext = null;

    if (ongoing) {
      inPeriod = true;
      currentStart = ongoing.startDate;
      currentEnd = ongoing.endDate;
      currentDuration = ongoing.dates.length;
      predictedDuration = Math.max(baseDuration, currentDuration);
      // 预计结束日
      const dt = parseDate(currentStart);
      if (dt) {
        dt.setDate(dt.getDate() + predictedDuration - 1);
        predictedEnd = fmtDate(dt);
      }
      // 下次预计开始：当前预计结束 + 周期
      const refDt = parseDate(predictedEnd);
      if (refDt) {
        refDt.setDate(refDt.getDate() + Math.round(baseCycle));
        nextPredictedStart = fmtDate(refDt);
        daysUntilNext = diffDays(todayStr, nextPredictedStart);
      }
    } else {
      // 当前不在经期
      inPeriod = false;
      const latest = segAsc[segAsc.length - 1];
      currentStart = latest ? latest.startDate : '';
      currentEnd = latest ? (latest.hasEnd ? latest.endDate : '') : '';
      currentDuration = latest ? latest.dates.length : 0;
      // 下次预计开始：最近段结束 + 周期
      const refDate = (latest && latest.hasEnd) ? latest.endDate : (latest ? latest.startDate : '');
      const refDt = parseDate(refDate);
      if (refDt) {
        refDt.setDate(refDt.getDate() + Math.round(baseCycle));
        nextPredictedStart = fmtDate(refDt);
        daysUntilNext = diffDays(todayStr, nextPredictedStart);
      }
      predictedDuration = Math.round(baseDuration);
      predictedEnd = '';
    }

    const summary = {
      hasData: true,
      inPeriod,
      currentStart,
      currentEnd,
      currentDuration,
      predictedEnd,
      predictedDuration,
      nextPredictedStart,
      daysUntilNext,
      totalCycles: segments.length,
      avgCycle,
      avgDuration,
      lastCycle,
      lastDuration,
      shortestCycle,
    };

    // 给每段附加展示字段
    const decoratedSegments = segments.map((seg, idx) => {
      const info = segmentInfo(seg, todayStr);
      const startFriendly = friendlyDate(seg.startDate, todayStr);
      const endFriendly = friendlyDate(seg.endDate, todayStr);
      // cycleFromPrev: 与前一段起点的间隔
      let cycleFromPrev = null;
      if (idx < segments.length - 1) {
        const prevSeg = segments[idx + 1]; // 倒序：当前在前，前段在后
        const d = diffDays(prevSeg.startDate, seg.startDate);
        if (d > 0 && d < 365) cycleFromPrev = d;
      }
      return {
        ...seg,
        days: info.days,
        isOngoing: info.isOngoing,
        startFriendly,
        endFriendly,
        startWeekCN: getWeekdayCN(seg.startDate),
        endWeekCN: getWeekdayCN(seg.endDate),
        startShortMD: shortMD(seg.startDate),
        endShortMD: shortMD(seg.endDate),
        cycleFromPrev,
        // 状态文案
        statusLabel: info.isOngoing
          ? (seg.dates.length === 1 ? '经期第 1 天' : `经期第 ${info.days} 天`)
          : (seg.hasEnd ? '已结束' : '进行中'),
      };
    });

    this.setData({
      periodSegments: decoratedSegments,
      periodSummary: this.attachFriendly(summary, todayStr),
    });
  },

  // 给 summary 附加友好日期显示
  attachFriendly(summary, todayStr) {
    if (!summary) return summary;
    return {
      ...summary,
      currentStartFriendly: friendlyDate(summary.currentStart, todayStr),
      currentStartWeekCN: getWeekdayCN(summary.currentStart),
      currentEndFriendly: friendlyDate(summary.currentEnd, todayStr),
      currentEndWeekCN: getWeekdayCN(summary.currentEnd),
      predictedEndFriendly: friendlyDate(summary.predictedEnd, todayStr),
      predictedEndWeekCN: getWeekdayCN(summary.predictedEnd),
      nextPredictedStartFriendly: friendlyDate(summary.nextPredictedStart, todayStr),
      nextPredictedStartWeekCN: getWeekdayCN(summary.nextPredictedStart),
    };
  },

  // 构建日历
  buildCalendar() {
    const { calendarYear, calendarMonth, periodRecords, periodSummary, selectedDate, todayStr } = this.data;
    if (!calendarYear || !calendarMonth) return;

    const firstDay = new Date(calendarYear, calendarMonth - 1, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth, 0).getDate();
    const today = todayStr || fmtDate(new Date());

    // 构造经期区间集合 + 起始/结束日集合
    // 同时构造 date -> recordId 的映射
    const periodSet = new Set();        // 所有被标记为经期的日期
    const startSet = new Set();         // 段起始日
    const endSet = new Set();           // 段结束日（含 type='end' 的）
    const recordByDate = {};            // date -> { recordId, type }
    (periodRecords || []).forEach(r => {
      if (!r.date) return;
      if (r.type === 'period') {
        periodSet.add(r.date);
      } else if (r.type === 'end') {
        periodSet.add(r.date);
        endSet.add(r.date);
      }
      recordByDate[r.date] = r;
    });

    // 段起始日：从 segments 计算
    const segments = buildSegments(periodRecords || []);
    segments.forEach(seg => {
      startSet.add(seg.startDate);
    });

    // 预测区间
    const predictedSet = new Set();
    if (periodSummary && periodSummary.nextPredictedStart) {
      const ns = parseDate(periodSummary.nextPredictedStart);
      if (ns) {
        const dur = Math.max(1, Math.round(periodSummary.predictedDuration || 5));
        for (let i = 0; i < dur; i++) {
          const d = new Date(ns);
          d.setDate(d.getDate() + i);
          const s = fmtDate(d);
          if (!periodSet.has(s)) predictedSet.add(s);
        }
      }
    }

    const days = [];
    for (let i = 0; i < startWeekday; i++) {
      days.push({ empty: true, date: '', day: '' });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calendarYear}-${String(calendarMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const inPeriod = periodSet.has(dateStr);
      const isPredicted = predictedSet.has(dateStr);
      const isPeriodStart = startSet.has(dateStr);
      const isPeriodEnd = endSet.has(dateStr);
      const isToday = dateStr === today;
      const selected = dateStr === selectedDate;
      days.push({
        empty: false,
        date: dateStr,
        day: d,
        isToday,
        inPeriod,
        isPeriodStart,
        isPeriodEnd,
        isPredicted,
        selected,
      });
    }

    this.setData({ calendarDays: days });
    this.updateSelectedDateInfo();
  },

  // 更新选中日期的详情
  updateSelectedDateInfo() {
    const { selectedDate, periodRecords, todayStr } = this.data;
    if (!selectedDate) {
      this.setData({
        selectedDateInfo: {
          isPeriod: false,
          isEnd: false,
          hasRecord: false,
          recordId: null,
          segmentStart: '',
          segmentDay: 0,
        }
      });
      return;
    }

    // 当天是否有记录
    const rec = (periodRecords || []).find(r => r.date === selectedDate);
    const hasRecord = !!rec;
    const isPeriod = rec && (rec.type === 'period' || rec.type === 'end');
    const isEnd = rec && rec.type === 'end';

    // 查找所在段（包含此日的经期段）
    const segments = buildSegments(periodRecords || []);
    const seg = segments.find(s => selectedDate >= s.startDate && selectedDate <= s.endDate);
    let segmentStart = '';
    let segmentDay = 0;
    if (seg) {
      segmentStart = seg.startDate;
      segmentDay = diffDays(seg.startDate, selectedDate) + 1;
    }

    this.setData({
      selectedDateInfo: {
        isPeriod: !!isPeriod,
        isEnd: !!isEnd,
        hasRecord,
        recordId: rec ? rec._id : null,
        segmentStart,
        segmentStartFriendly: friendlyDate(segmentStart, todayStr),
        segmentDay,
      },
      selectedDateFriendly: friendlyDate(selectedDate, todayStr),
      selectedDateWeekCN: getWeekdayCN(selectedDate),
    });
  },

  // 上一月
  prevMonth() {
    let { calendarYear, calendarMonth } = this.data;
    calendarMonth -= 1;
    if (calendarMonth < 1) { calendarMonth = 12; calendarYear -= 1; }
    this.setData({ calendarYear, calendarMonth });
    this.buildCalendar();
  },
  // 下一月
  nextMonth() {
    let { calendarYear, calendarMonth } = this.data;
    calendarMonth += 1;
    if (calendarMonth > 12) { calendarMonth = 1; calendarYear += 1; }
    this.setData({ calendarYear, calendarMonth });
    this.buildCalendar();
  },

  // 点击日历某天
  onTapCalendarDay(e) {
    const date = e.currentTarget.dataset.date;
    if (!date) return;
    this.setData({ selectedDate: date });
    this.buildCalendar();
  },

  // 标记某一天为「经期中」（可任意一天调）
  async onMarkPeriod() {
    const { selectedDate } = this.data;
    if (!selectedDate) return;
    if (selectedDate > fmtDate(new Date())) {
      wx.showToast({ title: '不能标记未来日期', icon: 'none' });
      return;
    }
    // 若该日已有 end 类型记录，则不允许再标记 period
    const existing = (this.data.periodRecords || []).find(r => r.date === selectedDate);
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
    // 该日必须属于某段经期中（即有 period 类型的记录，或前一日是 period）
    const recToday = (this.data.periodRecords || []).find(r => r.date === selectedDate);
    const recPrev = (this.data.periodRecords || []).find(r => {
      const prev = new Date(selectedDate);
      prev.setDate(prev.getDate() - 1);
      return r.date === fmtDate(prev) && (r.type === 'period' || r.type === 'end');
    });
    if (!recToday && !recPrev) {
      wx.showToast({ title: '请先标记当天或前一天为经期', icon: 'none' });
      return;
    }

    try {
      wx.showLoading({ title: '保存中…', mask: true });
      // 如果当天没有 period 记录，先补一条
      if (!recToday) {
        await wx.cloud.callFunction({
          name: 'addPeriod',
          data: {
            list: app.globalData.collectionPeriodList,
            date: selectedDate,
            type: 'period',
          }
        });
      }
      // 再写一条 end 记录（同日可同时存在）
      await wx.cloud.callFunction({
        name: 'addPeriod',
        data: {
          list: app.globalData.collectionPeriodList,
          date: selectedDate,
          type: 'end',
        }
      });
      wx.hideLoading();
      wx.showToast({ title: '已标记结束 🌙', icon: 'success' });
      this.loadPeriodRecords();
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '记录失败', icon: 'error' });
    }
  },

  // 取消当天标记（删除当天所有记录）
  async onCancelMark() {
    const { selectedDateInfo, selectedDate } = this.data;
    if (!selectedDate) {
      wx.showToast({ title: '当天无记录', icon: 'none' });
      return;
    }
    // 删除当天所有类型的记录（period + end 都要清掉）
    const todays = (this.data.periodRecords || []).filter(r => r.date === selectedDate);
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

  // 删除整段（删除该段所有 day 记录）
  async onDeleteSegment(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    this.confirmDeletePeriod(id);
  },

  confirmDeletePeriod(id) {
    wx.showModal({
      title: '删除记录',
      content: '确认删除这条经期记录吗？此操作不可恢复。',
      confirmColor: '#FA5151',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          wx.showLoading({ title: '删除中…', mask: true });
          await wx.cloud.callFunction({
            name: 'deletePeriod',
            data: { list: app.globalData.collectionPeriodList, _id: id }
          });
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