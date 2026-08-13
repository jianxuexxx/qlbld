// pages/Tea/data.js
// 内置奶茶品牌 + 旗下产品库
module.exports = {
  // 评分档位
  RATINGS: [
    { key: 'good', label: '好喝', emoji: '👍', color: '#07C160' },
    { key: 'normal', label: '一般', emoji: '😐', color: '#8E8E93' },
    { key: 'bad', label: '避雷', emoji: '👎', color: '#FA5151' },
  ],

  // 品牌库（每个品牌配一个色系用作图表显示）
  BRANDS: [
    {
      name: '喜茶',
      color: '#E74C3C',
      products: [
        '多肉葡萄', '芝芝莓莓', '芋泥波波', '杨枝甘露',
        '芝士桃桃', '多肉青提', '满杯橙子', '烤黑糖波波',
      ],
    },
    {
      name: '奈雪的茶',
      color: '#F39C12',
      products: [
        '霸气芝士葡萄', '霸气玉油柑', '芋泥宝藏奶茶',
        '霸气杨枝甘露', '多肉葡萄', '芝士金栗',
      ],
    },
    {
      name: '蜜雪冰城',
      color: '#27AE60',
      products: [
        '冰鲜柠檬水', '棒打鲜橙', '满杯百香果',
        '珍珠奶茶', '摇摇奶昔', '草莓摇摇奶昔', '摩天脆脆',
      ],
    },
    {
      name: 'CoCo都可',
      color: '#E67E22',
      products: [
        '奶茶三兄弟', '百香果双响炮', '珍珠鲜奶',
        '鲜芋青稞奶茶', '莓莓果茶', '柠檬养乐多',
      ],
    },
    {
      name: '一点点',
      color: '#16A085',
      products: [
        '波霸奶茶', '乌龙奶茶', '四季春玛奇朵',
        '冰淇淋红茶', '阿萨姆红茶', '养乐多绿',
      ],
    },
    {
      name: '古茗',
      color: '#2980B9',
      products: [
        '古茗轻乳茶', '杨枝甘露', '满杯红柚',
        '超A芝士葡萄', '桂花龙眼', '柠檬油柑',
      ],
    },
    {
      name: '茶百道',
      color: '#8E44AD',
      products: [
        '超级水果茶', '招牌芋圆奶茶', '杨枝甘露',
        '豆乳玉麒麟', '草莓啵啵', '乌漆嘛黑',
      ],
    },
    {
      name: '霸王茶姬',
      color: '#D35400',
      products: [
        '伯牙绝弦', '花田乌龙', '桂馥兰香',
        '青青糯山', '茉莉雪芽', '陈念栀子',
      ],
    },
  ],

  // 根据品牌名查找品牌
  findBrand(name) {
    return this.BRANDS.find(b => b.name === name) || null;
  },

  // 根据品牌名返回颜色，找不到用默认灰
  colorOf(brandName) {
    const b = this.findBrand(brandName);
    return b ? b.color : '#8E8E93';
  },
};