// 云函数：通用消息推送服务
// 项目为情侣双人，硬编码 A/B openid（仅两个用户角色）
//
// 调用方（前端）传入 action / me / name / page，落到这里生成对应的 thing 字段
// touser 自动按"操作者是 A → 推 B / 操作者是 B → 推 A"互换
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

  // ===== 商品（保留兼容，但商城已下架，不会真正调用） =====
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
    targetOpenid = ''
  } = event || {};

  const conf = ACTION_MAP[action] || ACTION_MAP.custom;
  const data = conf.build({ me, name, extra1 });

  const myOpenid = cloud.getWXContext().OPENID || '';
  // 优先使用 targetOpenid（前端显式指定）；否则按 A↔B 互换
  let touser = targetOpenid;
  if (!touser) {
    touser = (myOpenid === OPENID_A) ? OPENID_B
           : (myOpenid === OPENID_B) ? OPENID_A
           : OPENID_B;
  }

  // 跳过给自己推 / 跳过未填
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
      data,
      miniprogramState: 'developer',  // 开发期可在体验版/开发版收到提示
      page
    });
    console.log('[information] send ok:', res);
    return { success: true, errCode: res.errCode, errMsg: res.errMsg, touser };
  } catch (err) {
    console.error('[information] send fail:', err);
    return { success: false, error: err.message, errcode: err.errcode, touser };
  }
};
