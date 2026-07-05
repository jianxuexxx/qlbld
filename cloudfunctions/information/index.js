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

const OPENID_A = 'oKXTkxUJqooRziKJ142WuTQhqPZw';
const OPENID_B = 'oKXTkxeh5kNqUA2TAPh8hKxw48-4';   // 部署前改成实际 openid

// 你自己的模板 ID（保持与前端一致）
const TEMPLATE_ID = 'fipB8zzrCo5upD3L7jvYB1wEeTQ3ohXaMCJyQcjYQS8';

// 消息类型 → 模板字段映射（项目进展提醒模板）
// thing2=项目名称, thing4=项目进展, date5=开始时间, thing7=备注, thing8=项目执行人
// 模板字段个数务必与你申请模板一致，否则 send 会报 40037
const ACTION_MAP = {
  // ===== 任务 =====
  mission_new: {
    label: '新任务',
    build: ({ me, name, extra1 }) => ({
      thing2: { value: truncate(name || '任务', 20) },
      thing4: { value: truncate('📋 已发布，待对方完成', 20) },
      date5:  { value: formatDate(new Date()) },
      thing7: { value: truncate(extra1 || '请尽快处理', 20) },
      thing8: { value: truncate(me || '我', 20) }
    })
  },
  mission_done: {
    label: '任务完成',
    build: ({ me, name, extra1 }) => ({
      thing2: { value: truncate(name || '任务', 20) },
      thing4: { value: truncate('✅ 已被对方完成', 20) },
      date5:  { value: formatDate(new Date()) },
      thing7: { value: truncate(extra1 || '积分已发放', 20) },
      thing8: { value: truncate(me || '对方', 20) }
    })
  },
  mission_accepted: {
    label: '订单确认',
    build: ({ me, name, extra1 }) => ({
      thing2: { value: truncate(name || '菜品', 20) },
      thing4: { value: truncate('🛒 已下单，请及时处理', 20) },
      date5:  { value: formatDate(new Date()) },
      thing7: { value: truncate(extra1 || '请尽快制作', 20) },
      thing8: { value: truncate(me || '对方', 20) }
    })
  },
  mission_finished: {
    label: '订单完成',
    build: ({ me, name, extra1 }) => ({
      thing2: { value: truncate(name || '菜品', 20) },
      thing4: { value: truncate('🎉 已完成', 20) },
      date5:  { value: formatDate(new Date()) },
      thing7: { value: truncate(extra1 || '订单已完成，积分已发放', 20) },
      thing8: { value: truncate(me || '我', 20) }
    })
  },

  // ===== 商品（暂未触发，商城已改设置页） =====
  item_added: {
    label: '商品上架',
    build: ({ me, name, extra1 }) => ({
      thing2: { value: truncate(name || '商品', 20) },
      thing4: { value: truncate('🛍️ 刚上架', 20) },
      date5:  { value: formatDate(new Date()) },
      thing7: { value: truncate(extra1 || '快来看看吧', 20) },
      thing8: { value: truncate(me || '我', 20) }
    })
  },
  item_bought: {
    label: '商品购买',
    build: ({ me, name, extra1 }) => ({
      thing2: { value: truncate(name || '商品', 20) },
      thing4: { value: truncate('💖 已购买', 20) },
      date5:  { value: formatDate(new Date()) },
      thing7: { value: truncate(extra1 || '心爱商品已送达仓库', 20) },
      thing8: { value: truncate(me || '我', 20) }
    })
  },

  // ===== 自定义（兜底） =====
  custom: {
    label: '自定义',
    build: ({ me, name, extra1 }) => ({
      thing2: { value: truncate(name || me || '提醒', 20) },
      thing4: { value: truncate(extra1 || '你有一条新提醒', 20) },
      date5:  { value: formatDate(new Date()) },
      thing7: { value: truncate(me || '系统', 20) },
      thing8: { value: truncate(me || '系统', 20) }
    })
  }
};

// 日期格式化为 YYYY-MM-DD HH:mm
function formatDate(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function truncate(s, n) {
  s = String(s == null ? '' : s);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

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
