// 云函数：通用菜单字段更新
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const { _id, list = 'MenuList', updates = {} } = event;
  if (!_id) return { success: false, error: 'missing _id' };

  // 只允许更新白名单字段（防止越权）
  const allowed = ['title', 'category', 'credit', 'desc'];
  const safeUpdates = {};
  for (const k of allowed) {
    if (updates[k] !== undefined) safeUpdates[k] = updates[k];
  }
  if (Object.keys(safeUpdates).length === 0) {
    return { success: false, error: 'no updatable field' };
  }

  try {
    const db = cloud.database();
    const res = await db.collection(list).doc(_id).update({ data: safeUpdates });
    return { success: true, updated: res.stats.updated };
  } catch (err) {
    console.error('updateMenu', err);
    return { success: false, error: err.message };
  }
};
