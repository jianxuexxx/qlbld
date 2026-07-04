// 云函数：获取用户列表（仅暴露必要字段）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const { list = 'UserList' } = event;
  try {
    const db = cloud.database();
    const _ = db.command;
    const MAX_LIMIT = 100;
    const countRes = await db.collection(list).count();
    const total = countRes.total || 0;
    const batchTimes = Math.ceil(total / MAX_LIMIT);
    const tasks = [];
    for (let i = 0; i < batchTimes; i++) {
      tasks.push(
        db.collection(list).skip(i * MAX_LIMIT).limit(MAX_LIMIT).get()
      );
    }
    const results = await Promise.all(tasks);
    const data = (results || []).flatMap(r => r.data || []);
    // 只返回必要字段
    const safe = data.map(u => ({
      _id: u._id,
      _openid: u._openid,
      credit: u.credit || 0,
      name: u.name || u.username || ''
    }));
    return { success: true, data: safe };
  } catch (err) {
    console.error('getUserList', err);
    return { success: false, error: err.message, data: [] };
  }
};
