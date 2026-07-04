// 云函数：通用消息推送服务
// 项目为情侣双人，硬编码 A/B openid（仅两个用户角色）
//
// 调用方（前端）传入 action / me / name / page，落到这里生成对应的 thing 字段
// touser 自动按"操作者是 A → 推 B / 操作者是 B → 推 A"互换
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const OPENID_A = 'oT6085LEVOtIsSV7zBCh8PLTS6mk';
const OPENID_B = '这里改成B的openid';   // 部署前改成实际 openid

// 你自己的模板 ID（保持与前端一致）
const TEMPLATE_ID = 'R5sHALA7TKs6jCyH_kwNr9l8vVfWKCU5cXQnFKWlwfA';

// 消息类型 → 模板字段映射（thing6 = 事项, thing9 = 提示语）
// 模板字段个数务必与你申请模板一致，否则 send 会报 40037
const ACTION_MAP = {
  // ===== 任务 =====
  mission_new: {
    label: '新任务',
    build: ({ me, name }) => ({
      thing6: { value: truncate(`📋 ${me} 发布：${name}`, 20) },
      thing9: { value: truncate('有新的任务等你去完成哦～', 20) }
    })
  },
  mission_done: {
    label: '任务完成',
    build: ({ me, name }) => ({
      thing6: { value: truncate(`✅ ${me} 完成：${name}`, 20) },
      thing9: { value: truncate('有任务被完成啦，记得查看', 20) }
    })
  },
  mission_accepted: {
    label: '订单确认',
    build: ({ me, name }) => ({
      thing6: { value: truncate(`🛒 ${me} 已点单：${name}`, 20) },
      thing9: { value: truncate('订单已建立，请及时处理', 20) }
    })
  },
  mission_finished: {
    label: '订单完成',
    build: ({ me, name }) => ({
      thing6: { value: truncate(`🎉 ${me} 已完成：${name}`, 20) },
      thing9: { value: truncate('订单已完成，积分已发放', 20) }
    })
  },

  // ===== 商品（保留兼容，但商城已下架，不会真正调用） =====
  item_added: {
    label: '商品上架',
    build: ({ me, name }) => ({
      thing6: { value: truncate(`🛍️ ${me} 上架：${name}`, 20) },
      thing9: { value: truncate('新商品已上架，快来购买吧', 20) }
    })
  },
  item_bought: {
    label: '商品购买',
    build: ({ me, name }) => ({
      thing6: { value: truncate(`💖 ${me} 购买：${name}`, 20) },
      thing9: { value: truncate('心爱商品已送达仓库', 20) }
    })
  },

  // ===== 自定义（兜底） =====
  custom: {
    label: '自定义',
    build: ({ me, name, extra1 }) => ({
      thing6: { value: truncate(name || me || '提醒', 20) },
      thing9: { value: truncate(extra1 || '你有一条新提醒', 20) }
    })
  }
};

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
