// 云函数：通用消息推送服务
// 项目为情侣双人，硬编码 A/B openid（仅两个用户角色）
//
// 模板：活动开启通知（场景：新增任务）
// 字段：thing1(活动名称,20) / date6(开始日期,YYYY-MM-DD HH:MM:SS) /
//       thing12(活动详情,20) / thing22(备注,20)
//
// 调用方（前端）传入 action / me / name / extra1，落到这里生成对应的字段值
// touser 自动按 "操作者是 A → 推 B / 操作者是 B → 推 A" 互换
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const OPENID_A = 'oT6085LEVOtIsSV7zBCh8PLTS6mk';
const OPENID_B = 'oT6085Ga7IUxYt-mmP0IdFvaLT0I'; // B 的真实 openid

const TEMPLATE_ID = 'tkhfBTA9LoKMkBpq8nxv8bDh5_GSeVYOz157x_Zfsd8';

// 日期字段：date 类型必须 YYYY-MM-DD HH:MM:SS
function nowDateStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// 文本字段：thing 类型必须 ≤ 20 字符。emoji 算长度时微信服务端做拆分，建议用户文本 emoji 不超 3 个
function truncate(s, n = 20) {
  s = String(s == null ? '' : s);
  // 直接按字符数裁断；emoji 被 JS 当作 2 个 surrogate 半区，截断可能留半个 emoji，后面做兜底
  if (s.length > n) return s.slice(0, n - 1) + '…';
  return s;
}

// 安全裁断后兜底为合法 thing（去可能产生孤立 surrogate 的字符）
function safeThing(s, n = 20) {
  const t = truncate(s, n);
  // 去掉末尾半个 surrogate
  return t.replace(/[\uD800-\uDBFF]$/, '').replace(/[\uDC00-\uDFFF]$/, '');
}

// 每个动作预制 4 个字段文案
// thing1 活动名称：形如"📋薛师傅发布：洗碗"
// thing12 活动详情：简明动作描述
// thing22 备注：额外提示（如"等你去完成"）
const ACTION_MAP = {
  // ===== 任务 =====
  mission_new: {
    label: '新任务',
    build: ({ me, name }) => ({
      thing1: { value: safeThing(`${me || ''}发布：${name || ''}`, 20) },
      date6:  { value: nowDateStr() },
      thing12:{ value: safeThing('有新的任务', 20) },
      thing22:{ value: safeThing('点击查看', 20) }
    })
  },
  mission_done: {
    label: '任务完成',
    build: ({ me, name }) => ({
      thing1: { value: safeThing(`${me || ''}完成：${name || ''}`, 20) },
      date6:  { value: nowDateStr() },
      thing12:{ value: safeThing('任务已完成', 20) },
      thing22:{ value: safeThing('积分已发放', 20) }
    })
  },
  mission_accepted: {
    label: '订单确认',
    build: ({ me, name }) => ({
      thing1: { value: safeThing(`${me || ''}点单：${name || ''}`, 20) },
      date6:  { value: nowDateStr() },
      thing12:{ value: safeThing('订单已建立', 20) },
      thing22:{ value: safeThing('请及时处理', 20) }
    })
  },
  mission_finished: {
    label: '订单完成',
    build: ({ me, name }) => ({
      thing1: { value: safeThing(`${me || ''}已完成：${name || ''}`, 20) },
      date6:  { value: nowDateStr() },
      thing12:{ value: safeThing('订单已完成', 20) },
      thing22:{ value: safeThing('积分已发放', 20) }
    })
  },

  // ===== 商品（暂未触发，商城已改设置页） =====
  item_added: {
    label: '商品上架',
    build: ({ me, name }) => ({
      thing1: { value: safeThing(`${me || ''}上架：${name || ''}`, 20) },
      date6:  { value: nowDateStr() },
      thing12:{ value: safeThing('商品已上架', 20) },
      thing22:{ value: safeThing('点击去购买', 20) }
    })
  },
  item_bought: {
    label: '商品购买',
    build: ({ me, name }) => ({
      thing1: { value: safeThing(`${me || ''}已购：${name || ''}`, 20) },
      date6:  { value: nowDateStr() },
      thing12:{ value: safeThing('商品已入仓', 20) },
      thing22:{ value: safeThing('快去使用吧', 20) }
    })
  },

  // ===== 自定义（兜底） =====
  custom: {
    label: '自定义',
    build: ({ me, name, extra1 }) => ({
      thing1: { value: safeThing(name || me || '提醒', 20) },
      date6:  { value: nowDateStr() },
      thing12:{ value: safeThing(me || '事件', 20) },
      thing22:{ value: safeThing(extra1 || '你有一条新提醒', 20) }
    })
  }
};

exports.main = async (event, context) => {
  const {
    action = 'custom',
    me = '',
    name = '',
    extra1 = '',
    page = 'pages/MainPage/index',
    templateId = TEMPLATE_ID,
    targetOpenid = '',
    data = null // 支持前端直接透传自定义字段
  } = event || {};

  // 优先用前端直接传入的 data；否则按 action 生成模板
  const conf = ACTION_MAP[action] || ACTION_MAP.custom;
  const payload = (data && typeof data === 'object' && Object.keys(data).length > 0)
    ? data
    : conf.build({ me, name, extra1 });

  // 强制给 date6 字段兜底（万一前端 data 漏写）
  if (!payload.date6 || typeof payload.date6.value !== 'string') {
    payload.date6 = { value: nowDateStr() };
  }

  // touser：A↔B 互换 或 显式 targetOpenid
  const myOpenid = cloud.getWXContext().OPENID || '';
  let touser = targetOpenid;
  if (!touser) {
    touser = (myOpenid === OPENID_A) ? OPENID_B
           : (myOpenid === OPENID_B) ? OPENID_A
           : OPENID_B;
  }

  if (!touser) {
    return { success: false, skipped: true, reason: 'empty touser' };
  }
  if (touser === myOpenid) {
    return { success: false, skipped: true, reason: 'self' };
  }

  try {
    const res = await cloud.openapi.subscribeMessage.send({
      touser,
      templateId,
      data: payload,
      miniprogramState: 'developer',
      page
    });
    console.log('[information] send ok:', res);
    return { success: true, errCode: res.errCode, errMsg: res.errMsg, touser, payload };
  } catch (err) {
    console.error('[information] send fail:', err, 'payload=', payload);
    return {
      success: false,
      error: err.message,
      errcode: err.errcode,
      errCode: err.errCode,
      errMsg: err.errMsg,
      touser,
      payload
    };
  }
};
