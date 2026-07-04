// 云函数：切换菜单上下架状态（disabled 字段）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const { _id, list = 'MenuList', value } = event;
  if (!_id) return { success: false, error: 'missing _id' };

  try {
    const db = cloud.database();
    const _ = db.command;
    const res = await db.collection(list).doc(_id).update({
      data: { disabled: !!value }
    });
    return { success: true, updated: res.stats.updated };
  } catch (err) {
    console.error('toggleMenuDisable', err);
    return { success: false, error: err.message };
  }
};
