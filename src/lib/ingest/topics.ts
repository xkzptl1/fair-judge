export type DiscoveryMode = 'domestic' | 'global' | 'mixed';

export interface TopicConfig {
  title: string;           // Japanese (displayed in UI)
  summary: string;         // Japanese
  category: string;
  mainIssues: string[];    // Japanese bullet points
  keywordsJa: string[];    // Japanese RSS search terms (hl=ja&gl=JP)
  keywordsEn: string[];    // English RSS search terms (hl=en&gl=US)
  keywordsKokkai?: string[]; // Tier 2: 国会会議録API search terms
  discoveryMode: DiscoveryMode;
  overseasRatio: number;
}

export const INGEST_TOPICS: TopicConfig[] = [
  // ── Domestic-first topics ────────────────────────────────────
  {
    title: 'AI規制の国際的動向',
    summary: '生成AIの急速な普及を受け、各国が独自の規制枠組みを整備しつつある。規制の範囲・強度・国際協調をめぐる議論が各方面で続いている。',
    category: 'AI・テック',
    mainIssues: ['規制の範囲と強度', '技術革新との両立', '国際的な足並みの乱れ'],
    keywordsJa: ['AI 規制 日本', '生成AI 規制'],
    keywordsEn: ['AI regulation Japan', 'generative AI policy'],
    keywordsKokkai: ['AI規制', '生成AI'],
    discoveryMode: 'mixed',
    overseasRatio: 0.6,
  },
  {
    title: '日米貿易摩擦と関税交渉',
    summary: '米国が発動した追加関税措置をめぐり、日米間の通商交渉が続いている。自動車・農産物など幅広い分野での影響が注目されている。',
    category: '経済',
    mainIssues: ['関税の対象品目と水準', '自動車・農産物への影響', '日本の交渉戦略'],
    keywordsJa: ['日米 関税', '米国 関税 日本'],
    keywordsEn: ['US Japan tariff', 'Japan trade deal'],
    keywordsKokkai: ['日米貿易', '関税'],
    discoveryMode: 'mixed',
    overseasRatio: 0.55,
  },
  {
    title: '物価上昇と家計への影響',
    summary: '食料品・光熱費を中心とした物価上昇が続き、家計の実質購買力への影響が広がっている。賃金上昇との格差も焦点となっている。',
    category: '経済',
    mainIssues: ['食料品・エネルギー価格の高止まり', '賃金上昇との格差', '政府の支援策の効果'],
    keywordsJa: ['物価上昇 家計', '食料品 値上がり'],
    keywordsEn: [],
    keywordsKokkai: ['物価上昇', '食料品価格'],
    discoveryMode: 'domestic',
    overseasRatio: 0.15,
  },
  {
    title: '半導体・経済安全保障',
    summary: '半導体をめぐる国際的な覇権争いが激化するなか、日本の経済安保政策と産業育成の在り方が問われている。',
    category: 'AI・テック',
    mainIssues: ['国内半導体産業の育成', '輸出規制の影響', '同盟国との協調体制'],
    keywordsJa: ['半導体 日本 経済安保', '半導体 補助金 日本'],
    keywordsEn: ['Japan semiconductor', 'chip export control Japan'],
    discoveryMode: 'mixed',
    overseasRatio: 0.5,
  },
  {
    title: '能登復興と長期支援',
    summary: '能登半島地震からの復興が続くなか、長期的な支援体制や過疎地の再建計画をめぐる議論が続いている。',
    category: '社会',
    mainIssues: ['復興の進捗と残された課題', '移住・定住支援策', '防災インフラの整備'],
    keywordsJa: ['能登 復興', '能登半島 復興 支援'],
    keywordsEn: [],
    discoveryMode: 'domestic',
    overseasRatio: 0.05,
  },

  // ── Domestic political topics ────────────────────────────────
  {
    title: '防衛費増額と安全保障政策',
    summary: '日本政府はGDP比2%への防衛費増額を掲げ、安全保障政策の転換が進んでいる。反撃能力（敵基地攻撃能力）の整備や日米同盟の深化をめぐり、憲法の平和主義との整合性を含む議論が続いている。',
    category: '安全保障',
    mainIssues: ['防衛費の財源（増税・国債）', '反撃能力と専守防衛の関係', '日米同盟のあり方'],
    keywordsJa: ['防衛費 増額 日本', '安全保障 反撃能力'],
    keywordsEn: ['Japan defense budget', 'Japan military policy'],
    keywordsKokkai: ['防衛費', '反撃能力', '安全保障'],
    discoveryMode: 'mixed',
    overseasRatio: 0.35,
  },
  {
    title: '少子化対策と子育て支援',
    summary: '出生率の低下が続くなか、「こども家庭庁」が主導する少子化対策の効果と財源をめぐる議論が国会・メディアで続いている。保育の質・量の確保や男性育休の普及も焦点となっている。',
    category: '社会',
    mainIssues: ['財源の確保と社会保険料への転嫁', '保育所の量と質の両立', '男性育休の取得促進'],
    keywordsJa: ['少子化対策 こども家庭庁', '子育て支援 政策'],
    keywordsEn: ['Japan birth rate policy', 'Japan childcare support'],
    keywordsKokkai: ['少子化', 'こども家庭庁', '子育て支援'],
    discoveryMode: 'domestic',
    overseasRatio: 0.1,
  },
  {
    title: '政治資金改革と政治とカネ',
    summary: '政治資金パーティー収入の不記載問題を契機に、政治資金規正法の改正や政党助成制度の見直しをめぐる議論が続いている。透明性確保と政治倫理の再構築が問われている。',
    category: '政治',
    mainIssues: ['政治資金の透明化', 'パーティー収入の規制強化', '政治倫理審査会の実効性'],
    keywordsJa: ['政治資金 改革 国会', '政治とカネ'],
    keywordsEn: ['Japan political funds reform'],
    keywordsKokkai: ['政治資金', '政治資金規正法'],
    discoveryMode: 'domestic',
    overseasRatio: 0.05,
  },

  // ── Global topics (underreported in Japanese media) ──────────
  {
    title: 'キューバのエネルギー危機',
    summary: 'キューバでは燃料不足と電力インフラの崩壊により、1日10時間以上に及ぶ大規模停電が続いている。経済封鎖と政策の失敗が重なり、市民生活は深刻な打撃を受けているが、日本語メディアでの報道は極めて限られている。',
    category: '国際',
    mainIssues: ['燃料不足と長時間停電', '経済崩壊と市民生活への影響', '国際社会の対応', '政府の説明責任'],
    keywordsJa: ['キューバ 停電', 'キューバ エネルギー危機'],
    keywordsEn: ['Cuba blackout energy', 'Cuba electricity crisis', 'Cuba power outage'],
    discoveryMode: 'global',
    overseasRatio: 0.93,
  },
  {
    title: 'スーダン内戦と人道危機',
    summary: '2023年4月に勃発したスーダン内戦は、世界最大規模の人道危機へと拡大した。数百万人が避難を強いられ、飢餓が広がっているにもかかわらず、日本語圏での報道量は国際的な深刻さに見合っていない。',
    category: '国際',
    mainIssues: ['武力衝突と民間人の被害', '大規模な難民・国内避難', '食料危機と飢餓の拡大', '停戦交渉と国際社会の介入'],
    keywordsJa: ['スーダン 内戦', 'スーダン 危機'],
    keywordsEn: ['Sudan conflict', 'Sudan crisis'],
    discoveryMode: 'mixed',
    overseasRatio: 0.95,
  },
];
