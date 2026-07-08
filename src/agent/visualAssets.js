const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { createQualityProfile } = require('../quality');
const { createVisualAssetPlan, createVisualAssetManifest } = require('../visuals/visualAssetPlan');

const IMAGE_CATALOG = [
  {
    domain: 'fitness',
    title: 'Fitness membership experience',
    eyebrow: 'Fitness visuals',
    keywords: ['gym', 'fitness', 'workout', 'training', 'trainer', 'yoga', 'pilates', 'membership', '健身', '健身房', '训练', '瑜伽', '普拉提', '会员'],
    images: [
      ['https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1400&q=80', 'Athletes training with free weights in a modern gym', 'Strength zone for committed members'],
      ['https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=900&q=80', 'Coach guiding a focused fitness class', 'Guided classes that keep members accountable'],
      ['https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=900&q=80', 'Personal trainer supporting a gym workout', 'Personal coaching for measurable progress'],
      ['https://images.unsplash.com/photo-1540497077202-7c8a3999166f?auto=format&fit=crop&w=900&q=80', 'Bright gym floor with cardio and strength equipment', 'Premium equipment ready for every routine']
    ]
  },
  {
    domain: 'coffee',
    title: 'Coffee brand story',
    eyebrow: 'Coffee visuals',
    keywords: ['coffee', 'cafe', 'espresso', 'subscription', 'beans', 'roast', '咖啡', '拿铁', '订阅', '烘焙', '咖啡豆', '咖啡馆'],
    images: [
      ['https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1400&q=80', 'Barista pouring latte art in a warm coffee shop', 'Freshly crafted coffee for daily rituals'],
      ['https://images.unsplash.com/photo-1442512595331-e89e73853f31?auto=format&fit=crop&w=900&q=80', 'Roasted coffee beans in a specialty cafe', 'Small-batch beans selected for flavor'],
      ['https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=900&q=80', 'Cup of coffee served on a cafe table', 'Cafe moments delivered with care'],
      ['https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=900&q=80', 'Coffee brewing setup on a counter', 'Brew gear for repeatable quality']
    ]
  },
  {
    domain: 'saas',
    title: 'SaaS dashboard workflow',
    eyebrow: 'Product visuals',
    keywords: ['saas', 'dashboard', 'analytics', 'software', 'crm', 'platform', '数据', '仪表盘', '看板', '软件', '平台', '分析', '后台'],
    images: [
      ['https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1400&q=80', 'Analytics dashboard displayed on a laptop screen', 'Decision-ready dashboards for every team'],
      ['https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=900&q=80', 'Business charts and reports on a laptop', 'Real-time reporting across core metrics'],
      ['https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&w=900&q=80', 'Product team collaborating around software work', 'Collaborative workflows from idea to launch'],
      ['https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80', 'Laptop showing a modern application interface', 'Cloud tools that stay simple to use']
    ]
  },
  {
    domain: 'kitchen-equipment',
    title: 'Premium kitchen equipment retail',
    eyebrow: 'Kitchen equipment visuals',
    keywords: ['kitchen', 'cookware', 'appliance', 'oven', 'range', 'cooktop', 'culinary', 'chef equipment', 'premium kitchen', 'luxury kitchen', '厨房', '厨房设备', '厨具', '厨电', '厨房电器', '烤箱', '灶台', '炉具', '高端厨房', '料理设备'],
    images: [
      ['https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=1400&q=80', 'Premium kitchen workspace with cookware and preparation tools', 'Showroom-grade equipment for serious home cooks'],
      ['https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=900&q=80', 'Modern kitchen surface with cooking equipment ready for service', 'Precision tools that make daily cooking feel professional'],
      ['https://images.unsplash.com/photo-1556909212-d5b604d0c90d?auto=format&fit=crop&w=900&q=80', 'High-end kitchen appliance detail in a refined interior', 'Appliance details presented with premium confidence'],
      ['https://images.unsplash.com/photo-1600585152220-90363fe7e115?auto=format&fit=crop&w=900&q=80', 'Luxury residential kitchen with integrated cabinetry and appliances', 'Complete kitchen systems for considered upgrades'],
      ['https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=900&q=80', 'Chef-ready kitchen scene with practical cooking tools', 'Purchase guidance, installation, and after-sales support']
    ]
  },
  {
    domain: 'outdoor-gear',
    title: 'Outdoor travel gear retail',
    eyebrow: 'Outdoor gear visuals',
    keywords: ['outdoor', 'travel gear', 'camping', 'hiking', 'trekking', 'overlanding', 'gear', 'equipment', 'backpack', 'tent', 'trail', 'adventure', '户外', '旅行用品', '露营', '徒步', '登山', '户外装备', '背包', '帐篷', '装备'],
    images: [
      ['https://images.unsplash.com/photo-1501555088652-021faa106b9b?auto=format&fit=crop&w=1400&q=80', 'Hiker carrying a loaded pack on a mountain trail', 'Trail-tested packs and layers for real routes'],
      ['https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=900&q=80', 'Tent pitched under forest light at a campsite', 'Shelter systems for camp-ready nights'],
      ['https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=900&q=80', 'Snowy mountain ridge above an alpine valley', 'Weather-ready equipment for exposed terrain'],
      ['https://images.unsplash.com/photo-1454496522488-7a8e488e8606?auto=format&fit=crop&w=900&q=80', 'Mountain route with rugged outdoor conditions', 'Route-tested bundles for serious travel']
    ]
  },
  {
    domain: 'ecommerce',
    title: 'Commerce product showcase',
    eyebrow: 'Store visuals',
    keywords: ['ecommerce', 'commerce', 'shop', 'store', 'product', 'retail', 'catalog', '电商', '商城', '购物', '商品', '产品', '零售'],
    images: [
      ['https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1400&q=80', 'Stylish retail store with curated product displays', 'Curated products ready to browse'],
      ['https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=900&q=80', 'Shopper browsing products in a bright store', 'A polished buying journey from browse to checkout'],
      ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80', 'Minimal product watch on a colorful surface', 'Product detail pages that feel premium'],
      ['https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=900&q=80', 'Customer completing an online purchase', 'Checkout flow designed for confidence']
    ]
  },
  {
    domain: 'restaurant',
    title: 'Restaurant dining experience',
    eyebrow: 'Food visuals',
    keywords: ['restaurant', 'food', 'dining', 'menu', 'chef', 'catering', '餐厅', '美食', '菜单', '厨师', '外卖', '料理'],
    images: [
      ['https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1400&q=80', 'Welcoming restaurant dining room prepared for guests', 'A memorable dining room for every reservation'],
      ['https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80', 'Colorful plated meal served on a table', 'Signature dishes presented with care'],
      ['https://images.unsplash.com/photo-1551218808-94e220e084d2?auto=format&fit=crop&w=900&q=80', 'Chef preparing food in a professional kitchen', 'Kitchen craft behind every plate'],
      ['https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=900&q=80', 'Elegant restaurant table with wine and dinner', 'Atmosphere built for celebrations']
    ]
  },
  {
    domain: 'pet',
    title: 'Pet care storefront',
    eyebrow: 'Pet visuals',
    keywords: ['pet', 'dog', 'cat', 'puppy', 'kitten', '宠物', '猫', '狗', '猫狗', '宠物用品', '犬', '喵'],
    images: [
      ['https://images.unsplash.com/photo-1450778869180-41d0601e046e?auto=format&fit=crop&w=1400&q=80', 'Happy dog and cat sitting together at home', 'Friendly products for pets and their people'],
      ['https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=900&q=80', 'Calm cat looking toward the camera', 'Comfort essentials for curious cats'],
      ['https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=900&q=80', 'Golden retriever enjoying time outdoors', 'Durable picks for active dogs'],
      ['https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=900&q=80', 'Two dogs walking together outside', 'Everyday care for happy companions']
    ]
  },
  {
    domain: 'real-estate',
    title: 'Real estate property journey',
    eyebrow: 'Property visuals',
    keywords: ['real estate', 'property', 'home', 'apartment', 'realtor', '房产', '房地产', '公寓', '买房', '租房', '楼盘'],
    images: [
      ['https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1400&q=80', 'Modern home exterior with welcoming entry', 'Featured properties with strong curb appeal'],
      ['https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80', 'Contemporary house at sunset', 'Homes matched to lifestyle and budget'],
      ['https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=900&q=80', 'Bright modern living room interior', 'Interior details that help buyers imagine home'],
      ['https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=900&q=80', 'Open plan kitchen and living space', 'Listings presented with premium context']
    ]
  },
  {
    domain: 'travel',
    title: 'Travel discovery',
    eyebrow: 'Travel visuals',
    keywords: ['travel', 'trip', 'hotel', 'tour', 'vacation', 'flight', '旅行', '旅游', '酒店', '度假', '行程', '机票'],
    images: [
      ['https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1400&q=80', 'Traveler overlooking a dramatic mountain landscape', 'Trips designed around unforgettable views'],
      ['https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=80', 'Tropical beach with turquoise water', 'Beach escapes with effortless planning'],
      ['https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=900&q=80', 'Traveler planning a route with a map', 'Itineraries that make every day clear'],
      ['https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=900&q=80', 'Scenic road through forest and mountains', 'Flexible journeys for explorers']
    ]
  },
  {
    domain: 'education',
    title: 'Learning platform story',
    eyebrow: 'Education visuals',
    keywords: ['education', 'school', 'course', 'learning', 'student', 'class', '教育', '课程', '学习', '学校', '学生', '培训'],
    images: [
      ['https://images.unsplash.com/photo-1523580846011-d3a5bc25702b?auto=format&fit=crop&w=1400&q=80', 'Students walking together on a campus', 'Learning paths that help students progress'],
      ['https://images.unsplash.com/photo-1513258496099-48168024aec0?auto=format&fit=crop&w=900&q=80', 'Student studying with books and a laptop', 'Focused study experiences for modern learners'],
      ['https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=900&q=80', 'Teacher leading students in a classroom', 'Expert guidance from lesson to outcome'],
      ['https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=900&q=80', 'Books and learning materials on library shelves', 'Resources organized for discovery']
    ]
  },
  {
    domain: 'healthcare',
    title: 'Healthcare service trust',
    eyebrow: 'Healthcare visuals',
    keywords: ['healthcare', 'health', 'clinic', 'doctor', 'medical', 'wellness', '医疗', '健康', '诊所', '医生', '医院', '康复'],
    images: [
      ['https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&w=1400&q=80', 'Medical team discussing patient care in a clinic', 'Trusted care delivered by coordinated teams'],
      ['https://images.unsplash.com/photo-1550831107-1553da8c8464?auto=format&fit=crop&w=900&q=80', 'Doctor consulting with a patient', 'Clear consultations for confident decisions'],
      ['https://images.unsplash.com/photo-1532938911079-1b06ac7ceec7?auto=format&fit=crop&w=900&q=80', 'Healthcare professional holding a stethoscope', 'Clinical expertise with a human touch'],
      ['https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=900&q=80', 'Modern medical technology in a care setting', 'Digital tools that support better outcomes']
    ]
  },
  {
    domain: 'fashion-beauty',
    title: 'Fashion and beauty editorial',
    eyebrow: 'Style visuals',
    keywords: ['fashion', 'beauty', 'style', 'cosmetic', 'makeup', 'skincare', '时尚', '美妆', '美容', '护肤', '化妆', '服装'],
    images: [
      ['https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1400&q=80', 'Fashion shopper carrying bags on a city street', 'Style collections with editorial polish'],
      ['https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=900&q=80', 'Beauty products arranged for a skincare routine', 'Beauty rituals presented with clarity'],
      ['https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=80', 'Model wearing a contemporary fashion look', 'Looks that turn browsing into inspiration'],
      ['https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=900&q=80', 'Makeup brushes and cosmetics on a vanity', 'Premium details for product storytelling']
    ]
  },
  {
    domain: 'music-guitar',
    title: 'Music and guitar showcase',
    eyebrow: 'Music visuals',
    keywords: ['music', 'guitar', 'band', 'lesson', 'audio', 'instrument', '音乐', '吉他', '乐队', '乐器', '课程', '音频'],
    images: [
      ['https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=1400&q=80', 'Acoustic guitar on a stage ready for performance', 'Guitar experiences tuned for players'],
      ['https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=900&q=80', 'Musician performing live with guitar', 'Live sound and lessons with energy'],
      ['https://images.unsplash.com/photo-1525201548942-d8732f6617a0?auto=format&fit=crop&w=900&q=80', 'Electric guitar and amplifier in a studio', 'Gear-focused content for serious musicians'],
      ['https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=900&q=80', 'Music production setup in a recording studio', 'Practice, record, and publish with confidence']
    ]
  }
];

const GENERIC_BUSINESS = {
  domain: 'generic-business',
  title: 'Business growth story',
  eyebrow: 'Business visuals',
  keywords: ['business', 'agency', 'startup', 'service', 'consulting', '公司', '企业', '服务', '创业', '咨询'],
  images: [
    ['https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1400&q=80', 'Modern business team collaborating in a bright office', 'Professional services with a clear story'],
    ['https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=900&q=80', 'Team reviewing a project together at a table', 'Teams aligned around measurable outcomes'],
    ['https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=900&q=80', 'Business meeting with laptops and planning notes', 'Strategy sessions that turn plans into action'],
    ['https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=900&q=80', 'Clean modern office lounge for client meetings', 'Client-ready presentation from the first screen']
  ]
};

function normalizePrompt(prompt) {
  return String(prompt || '').toLowerCase().replace(/[\s_-]+/g, ' ').trim();
}

function keywordScore(text, catalogEntry) {
  return catalogEntry.keywords.reduce((score, keyword) => {
    const needle = String(keyword).toLowerCase();
    return text.includes(needle) ? score + Math.max(1, needle.length) : score;
  }, 0);
}

function selectImageSet(prompt = '', options = {}) {
  const text = normalizePrompt(prompt);
  let best = GENERIC_BUSINESS;
  let bestScore = keywordScore(text, GENERIC_BUSINESS);
  for (const entry of IMAGE_CATALOG) {
    const score = keywordScore(text, entry);
    if (score > bestScore) {
      best = entry;
      bestScore = score;
    }
  }
  return buildImageSet(best, prompt, options);
}

function resolveQualityProfile(prompt, options = {}) {
  const supplied = options.qualityProfile || (options.designProfile && options.designProfile.qualityProfile);
  if (supplied && supplied.id) return supplied;
  const qualityProfileId = options.qualityProfileId || (options.designProfile && options.designProfile.qualityProfileId);
  return createQualityProfile({ prompt, oracleBrief: options.oracleBrief, qualityProfileId });
}

function uniqueStrings(items, limit) {
  const out = [];
  for (const item of items || []) {
    const value = String(item || '').trim();
    if (value && !out.some((existing) => existing.toLowerCase() === value.toLowerCase())) out.push(value);
    if (limit && out.length >= limit) break;
  }
  return out;
}

function promptTerms(prompt) {
  const text = normalizePrompt(prompt);
  const terms = [];
  const candidates = [
    ['coffee', /coffee|espresso|cafe|beans|roast|subscription|咖啡|拿铁|订阅/],
    ['subscription', /subscription|subscribe|plan|会员|订阅/],
    ['premium', /premium|boutique|高端|精品|craft/],
    ['lifestyle', /lifestyle|ritual|daily|生活方式/],
    ['dashboard', /dashboard|analytics|metric|仪表盘|分析/],
    ['workflow', /workflow|automation|pipeline|工作流|自动化/],
    ['product UI', /saas|software|platform|crm|api|软件|平台/],
    ['local service', /local|booking|appointment|附近|本地|预约/],
    ['fitness', /gym|fitness|trainer|健身|私教/],
    ['retail catalog', /retail|shop|store|catalog|ecommerce|商店|电商|购物/],
    ['portfolio', /portfolio|agency|studio|case study|作品集|案例/]
  ];
  for (const [label, re] of candidates) if (re.test(text)) terms.push(label);
  return terms;
}

function buildSubjectHints(prompt, entry, profile) {
  return uniqueStrings([
    ...promptTerms(prompt),
    entry.domain,
    ...(entry.keywords || []).slice(0, 4),
    ...((profile && profile.visualSemantics) || []).slice(0, 4),
    ...((profile && profile.siteTypeHints) || []).slice(0, 3)
  ], 12);
}

function buildSceneHints(prompt, entry, profile) {
  const profileScenes = (profile && profile.pageStructure) || [];
  return uniqueStrings([
    'hero image must depict the actual business subject',
    'supporting cards should reuse the same domain story',
    entry.title,
    ...profileScenes.slice(0, 4),
    ...(entry.images || []).slice(0, 3).map((img) => img[2])
  ], 10);
}

function buildVisualRequirements(entry, profile, subjects, scenes) {
  const semantics = uniqueStrings([...(profile.visualSemantics || []), ...(entry.keywords || []).slice(0, 8), ...subjects], 18);
  const avoid = uniqueStrings([
    ...(profile.antiPatterns || []),
    'generic gradients as the main visual story',
    'unrelated stock photos',
    'random abstract images',
    profile.id === 'b2b-saas' ? 'consumer lifestyle-only imagery' : '',
    profile.id !== 'b2b-saas' ? 'unrelated SaaS dashboards' : ''
  ], 12);
  return {
    summary: 'Use profile-aware, prompt-relevant visuals for ' + profile.label + ': ' + semantics.slice(0, 6).join(', ') + '. Avoid: ' + avoid.slice(0, 4).join(', ') + '.',
    semantics,
    subjects,
    scenes,
    avoid
  };
}

function enrichImage(image, slotId, subjects, scenes) {
  return {
    ...image,
    slotId,
    alt: image.alt || image.caption || subjects.slice(0, 3).join(' '),
    subjectHints: subjects.slice(0, 8),
    sceneHints: scenes.slice(0, 6)
  };
}

function buildImageSet(entry, prompt = '', options = {}) {
  const profile = resolveQualityProfile(prompt, options);
  const subjects = buildSubjectHints(prompt, entry, profile);
  const scenes = buildSceneHints(prompt, entry, profile);
  const images = entry.images.map(([url, alt, caption], index) => enrichImage({ url, alt, caption }, index === 0 ? 'hero' : 'gallery-' + index, subjects, scenes));
  const visualRequirements = buildVisualRequirements(entry, profile, subjects, scenes);
  return {
    domain: entry.domain,
    title: entry.title,
    eyebrow: entry.eyebrow,
    qualityProfileId: profile.id,
    qualityProfileLabel: profile.label,
    profileVisualSemantics: uniqueStrings(profile.visualSemantics || [], 10),
    imageKeywords: uniqueStrings([...(entry.keywords || []), ...subjects], 18),
    subjectHints: subjects,
    sceneHints: scenes,
    avoidList: visualRequirements.avoid,
    visualRequirements,
    hero: images[0],
    gallery: images.slice(1)
  };
}

function createVisualAssets(prompt = '', options = {}) {
  const suppliedPlan = parseMaybeJson(options && options.visualAssetPlan);
  if (suppliedPlan && typeof suppliedPlan === 'object') {
    if (suppliedPlan.version === 'offbyone-visual-asset-manifest-v1') return suppliedPlan;
    return createVisualAssetManifest(suppliedPlan);
  }
  if (options && options.allowRemoteImages) return selectImageSet(prompt, options);
  const plan = createVisualAssetPlan({
    prompt,
    oracleBrief: options && options.oracleBrief,
    designProfile: options && options.designProfile
  });
  return createVisualAssetManifest(plan);
}

function requiresRasterVisualAssets(prompt = '', options = {}) {
  const profile = options && options.designProfile || {};
  const plan = parseMaybeJson(options && options.visualAssetPlan) || {};
  const text = normalizePrompt([
    prompt,
    profile.siteType,
    profile.qualityProfileId,
    profile.qualityProfile && profile.qualityProfile.id,
    plan.siteType,
    plan.subject,
    plan.domain,
    plan.visualStyle && plan.visualStyle.siteType,
    plan.visualStyle && plan.visualStyle.imageStrategy
  ].filter(Boolean).join(' '));
  if (!text) return false;
  if (/photo led|photo-led|raster led|raster-led|real raster|product photography|brand photography|照片|真实图片|商品图|场景图/.test(text)) return true;
  if (/(b2b saas|dashboard|analytics|workflow automation|crm|后台|仪表盘|看板|分析平台)/.test(text) && !/(shop|store|retail|catalog|product|commerce|brand|咖啡|餐厅|旅行|户外|商品|商城|零售)/.test(text)) return false;
  return /(ecommerce|commerce|shop|store|retail|catalog|product|brand site|premium consumer|venue|restaurant|cafe|coffee|travel|hotel|portfolio|gallery|fashion|beauty|real estate|outdoor|gear|equipment|camping|hiking|food|menu|官网|品牌|商店|商城|零售|商品|餐厅|咖啡|旅行|酒店|作品集|画廊|户外|装备|露营|徒步|美妆|服装|房产)/.test(text);
}

function shouldPrepareRasterVisualAssets(prompt = '', options = {}) {
  if (!requiresRasterVisualAssets(prompt, options)) return false;
  if (options && (options.enabled === false || options.rasterAssets === false)) return false;
  return Boolean(options && (options.enabled === true || options.rasterAssets === true));
}

function prepareRasterVisualAssets(root, prompt = '', options = {}) {
  const projectRoot = root ? path.resolve(root) : '';
  if (!projectRoot || !shouldPrepareRasterVisualAssets(prompt, options)) return null;
  const imageSet = selectImageSet(prompt, options);
  const sourceImages = [imageSet.hero, ...(Array.isArray(imageSet.gallery) ? imageSet.gallery : [])].filter(Boolean).slice(0, Math.max(1, Number(options.limit || 6)));
  if (!sourceImages.length) return null;

  const relDir = 'assets/offbyone-visuals';
  const publicDir = path.join(projectRoot, 'public', relDir);
  fs.mkdirSync(publicDir, { recursive: true });
  const downloader = typeof options.downloader === 'function' ? options.downloader : downloadRasterImage;
  const downloaded = [];
  const warnings = [];
  const force = options.force !== false;

  for (let index = 0; index < sourceImages.length; index += 1) {
    const source = sourceImages[index];
    const filename = index === 0 ? 'hero.jpg' : 'gallery-' + index + '.jpg';
    const absolutePath = path.join(publicDir, filename);
    const publicPath = '/' + relDir + '/' + filename;
    try {
      if (force || !hasUsableFile(absolutePath)) downloader(source.url, absolutePath, { timeoutMs: options.timeoutMs || 15000 });
      if (!hasUsableFile(absolutePath)) throw new Error('download produced an empty file');
      downloaded.push(createRasterManifestItem(source, index, publicPath, absolutePath, imageSet));
    } catch (err) {
      warnings.push((source.alt || source.url || 'image') + ': ' + (err && err.message ? err.message : String(err)));
      try { if (fs.existsSync(absolutePath) && !hasUsableFile(absolutePath)) fs.rmSync(absolutePath, { force: true }); } catch (_) {}
    }
  }

  if (!downloaded.length) return null;
  writeRasterSources(publicDir, downloaded, warnings, imageSet);
  const runtimeItems = downloaded.map(({ sourceUrl, ...item }) => item);
  const manifest = {
    version: 'offbyone-visual-asset-manifest-v1',
    sourcePlanVersion: 'offbyone-raster-asset-localizer-v1',
    mode: 'localized-raster',
    provider: 'curated-public-photo-catalog',
    network: 'build-time-only',
    domain: imageSet.domain,
    siteType: imageSet.qualityProfileId || imageSet.domain,
    subject: imageSet.title,
    title: imageSet.title,
    eyebrow: imageSet.eyebrow,
    qualityProfileId: imageSet.qualityProfileId,
    profileVisualSemantics: imageSet.profileVisualSemantics || [],
    imageKeywords: imageSet.imageKeywords || [],
    subjectHints: imageSet.subjectHints || [],
    sceneHints: imageSet.sceneHints || [],
    avoidList: imageSet.avoidList || [],
    visualRequirements: imageSet.visualRequirements || {},
    hero: runtimeItems[0] || null,
    gallery: runtimeItems.slice(1),
    slots: runtimeItems,
    assets: runtimeItems,
    warnings,
    constraints: [
      'Raster images are downloaded during OffByOne scaffold generation and served from the local public assets directory.',
      'Generated React code must reference src/lib/visualAssets.js helpers instead of external image URLs.',
      'If local raster preparation fails, the deterministic SVG manifest remains the fallback.'
    ]
  };
  if (options.logger && typeof options.logger.info === 'function') options.logger.info('Prepared local raster visual assets:', downloaded.length + ' image(s) in public/' + relDir);
  return manifest;
}

function createRasterManifestItem(source, index, publicPath, absolutePath, imageSet) {
  const slot = index === 0 ? 'hero-product-lifestyle' : 'gallery-' + index;
  return {
    id: 'raster-' + String(index + 1).padStart(2, '0'),
    slot,
    slotId: index === 0 ? 'hero' : 'gallery-' + index,
    usage: index === 0 ? 'above-the-fold photo-led brand/product image' : 'supporting product or scene image',
    placement: index === 0 ? 'Home hero or primary product section' : 'catalog, product cards, proof, support, or story sections',
    priority: index + 1,
    aspectRatio: index === 0 ? '16:9' : '4:3',
    status: 'ready',
    provider: 'curated-public-photo-catalog',
    sourceType: 'local-raster',
    url: publicPath,
    src: publicPath,
    alt: source.alt || source.caption || imageSet.title || 'Prompt relevant visual',
    caption: source.caption || source.alt || imageSet.title || '',
    sourceUrl: source.url,
    file: path.relative(path.dirname(path.dirname(absolutePath)), absolutePath).replace(/\\/g, '/'),
    fallback: {
      type: 'local-raster',
      label: source.caption || source.alt || 'Prompt relevant visual',
      alt: source.alt || source.caption || '',
      renderHint: 'Render this local raster image with object-fit: cover and meaningful alt text.',
      tokens: (source.subjectHints || imageSet.subjectHints || []).slice(0, 4)
    },
    subjectHints: source.subjectHints || imageSet.subjectHints || [],
    sceneHints: source.sceneHints || imageSet.sceneHints || []
  };
}

function hasUsableFile(file) {
  try {
    return fs.existsSync(file) && fs.statSync(file).size > 0;
  } catch (_) {
    return false;
  }
}

function downloadRasterImage(url, file, options = {}) {
  const timeoutSeconds = Math.max(3, Math.ceil(Number(options.timeoutMs || 15000) / 1000));
  execFileSync('curl', ['-fL', '--retry', '1', '--connect-timeout', '8', '--max-time', String(timeoutSeconds), String(url), '-o', file], { stdio: 'ignore' });
}

function writeRasterSources(publicDir, items, warnings, imageSet) {
  const lines = [
    '# OffByOne Local Raster Visual Assets',
    '',
    'Generated at scaffold time from the curated public photo catalog.',
    '',
    '- Domain: ' + imageSet.domain,
    '- Runtime path: `/assets/offbyone-visuals/`',
    '',
    '## Sources',
    ''
  ];
  for (const item of items) lines.push('- `' + path.basename(item.src) + '` - ' + item.alt + ' - ' + item.sourceUrl);
  if (warnings && warnings.length) {
    lines.push('', '## Warnings', '');
    for (const warning of warnings) lines.push('- ' + warning);
  }
  fs.writeFileSync(path.join(publicDir, 'SOURCES.md'), lines.join('\n') + '\n', 'utf8');
}

function parseMaybeJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); }
  catch (_) { return null; }
}

module.exports = {
  IMAGE_CATALOG,
  GENERIC_BUSINESS,
  selectImageSet,
  createVisualAssets,
  requiresRasterVisualAssets,
  shouldPrepareRasterVisualAssets,
  prepareRasterVisualAssets,
  downloadRasterImage,
  createVisualAssetPlan,
  createVisualAssetManifest
};
