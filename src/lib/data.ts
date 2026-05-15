import type { Trace } from '@/types'

export const MOCK_TRACES: Trace[] = [
  {
    id: 'trc_btc_120k_may26',
    asset: 'BTC',
    market: 'Will BTC reach $120,000 before June 30, 2026?',
    edge: 'Market is underpricing post-halving supply contraction against accelerating ETF inflow velocity',
    conviction: 'high',
    status: 'in_position',
    thesis: 'Bitcoin is in the second half of a post-halving supply shock cycle. ETF inflows have re-accelerated following the April macro dislocation, while miner sell pressure has structurally declined. The $120k target reflects mean reversion to the expected post-halving price trajectory, not speculative excess.',
    conclusion: 'The market is pricing this at ~58% YES, but the structural setup implies ~72-75% probability. This is a mispriced tail. Enter YES.',
    edgeNarrative: 'The divergence between on-chain accumulation signals and market-implied probability is the widest it has been since October 2024. ETF net inflows crossed $1.1B/week for the third consecutive week — a pattern that has preceded significant upside moves in each prior instance. The market appears anchored to $108k resistance without pricing the liquidation cascade above it.',
    reasoningSteps: [
      {
        step: 1,
        role: 'researcher',
        content: 'ETF net inflows: $1.1B/week for 3 consecutive weeks. Historical pattern analysis shows 3-consecutive-week inflow streaks have preceded +15-30% moves in 4/5 prior instances. CME open interest at 6-month high. Miner revenue from fees now exceeds block subsidy — reduced sell pressure incentive.',
        timestamp: '2026-05-15T02:14:33Z'
      },
      {
        step: 2,
        role: 'researcher',
        content: 'Macro context: DXY trending down (-2.1% over 30d). Real yields declining. Risk-on environment confirmed by SPX at ATH. BTC correlation to risk assets has decoupled over the past 14 days — moving independently, which historically signals institutional accumulation phase.',
        timestamp: '2026-05-15T02:15:01Z'
      },
      {
        step: 3,
        role: 'risk_manager',
        content: 'Key resistance at $108,400 — three rejections in the past 8 days. Liquidation cluster of ~$2.1B estimated above $112k on major perp exchanges. If $108,400 breaks with volume, the liquidation cascade could mechanically drive to $115-118k. Primary risk: macro reversal event (Fed surprise, geopolitical shock) before June 30.',
        timestamp: '2026-05-15T02:15:44Z'
      },
      {
        step: 4,
        role: 'portfolio_manager',
        content: 'Market-implied probability: 58%. Model probability: 73%. Edge: +15pp. Kelly fraction at this edge and assuming 2:1 payout structure suggests 14% position sizing. Entering YES. Stop logic: if BTC closes below $102,000 on daily, re-evaluate thesis.',
        timestamp: '2026-05-15T02:16:10Z'
      }
    ],
    evidence: [
      { label: 'ETF inflow streak', source: 'Bloomberg/HODL15Capital', detail: '$1.1B/week × 3 consecutive weeks — matches pre-rally pattern from Oct 2024', weight: 'supporting' },
      { label: 'CME open interest', source: 'CME Group', detail: '6-month high, suggesting institutional positioning increase', weight: 'supporting' },
      { label: 'DXY declining', source: 'TradingView', detail: '-2.1% over 30 days — historically correlated with BTC upside', weight: 'supporting' },
      { label: '$108k resistance', source: 'On-chain / order book analysis', detail: 'Three rejections in 8 days — structural resistance not yet broken', weight: 'contradicting' },
      { label: 'Miner sell pressure', source: 'Glassnode', detail: 'Fee revenue exceeding subsidy — reduced incentive to sell block rewards', weight: 'supporting' },
    ],
    risks: [
      'Federal Reserve surprise hawkish pivot before June 30 would reprice risk assets broadly',
      'Spot ETF redemption event — any 3-day net outflow streak would invalidate momentum thesis',
      'Geopolitical shock (escalation in existing conflicts) driving flight to cash',
      '$108k resistance holding — if BTC fails to break within 10 days, momentum thesis weakens significantly',
    ],
    catalysts: [
      'Liquidation cascade above $112k — mechanical price driver to $118k+ range',
      'CPI print below 2.8% on June 11 — would accelerate DXY decline',
      'New sovereign wealth fund BTC allocation announcement',
      'Options expiry on May 30 — $115k max pain level creates dealer hedging tailwind',
    ],
    positionIntent: 'Long YES at current market price (~58 cents). Target exit at 80 cents or upon thesis invalidation. Expected hold period: 18-35 days.',
    invalidationCriteria: [
      'BTC closes below $102,000 on daily timeframe',
      'ETF net outflows for 3 consecutive trading days',
      'CME open interest drops more than 25% from current level',
      'Fed emergency rate hike or hawkish surprise before June 15',
    ],
    statusTimeline: [
      { status: 'watching', timestamp: '2026-05-14T18:00:00Z', note: 'Market identified. Awaiting ETF inflow confirmation for third consecutive week.' },
      { status: 'in_position', timestamp: '2026-05-15T02:16:10Z', note: 'Third consecutive inflow week confirmed. Edge assessed at +15pp. Position entered.' },
    ],
    arcPublishStatus: 'published',
    traceHash: '0x9f2c4a1b7e3d8f6c2a5b9e1d4f7c3a8b2e6d9f1c4a7b3e8d2f5c9a1b6e4d7f3',
    arcTxHash: '0x05d5f9367adb5a7950327d1bb6e9ed8b6c15f0f66babee7f91faca50e3e25639',
    publishedAt: '2026-05-15T02:16:45Z',
    updatedAt: '2026-05-15T02:16:45Z',
    createdAt: '2026-05-14T18:00:00Z',
  },
  {
    id: 'trc_fed_jul26',
    asset: 'MACRO',
    market: 'Will the Fed cut rates at the July 2026 FOMC meeting?',
    edge: 'Sentiment lagging behind the liquidity shift — market still pricing stagflation risk that jobs data has already disproven',
    conviction: 'medium',
    status: 'watching',
    thesis: 'The June CPI and NFP data releases are the swing factors. If CPI prints below 2.9% and NFP stays above 150k, the Fed has a clean path to cut in July. Current market pricing (~41% YES) reflects April\'s stagflation scare, which is stale information.',
    conclusion: 'Lean YES but wait for June 11 CPI print before entering. If CPI < 2.9%, upgrade to high conviction and enter. Currently watching.',
    edgeNarrative: 'The bond market is pricing a July cut at 41% but Fed funds futures have been consistently leading the Polymarket probability by 3-4 weeks. Fed funds futures currently imply ~58% probability of a July cut. This gap is the edge — prediction market participants are anchored to the April narrative.',
    reasoningSteps: [
      {
        step: 1,
        role: 'researcher',
        content: 'Fed funds futures: ~58% implied probability of July cut. Polymarket: 41%. Historical gap analysis shows Polymarket tends to converge to futures pricing with a 3-4 week lag. PCE at 2.6% (last print). Core services inflation decelerating for 2nd consecutive month.',
        timestamp: '2026-05-15T01:00:00Z'
      },
      {
        step: 2,
        role: 'risk_manager',
        content: 'Key risk: June 11 CPI. If CPI prints above 3.1%, Fed narrative shifts hawkish and YES probability collapses to 20-25%. Holding off on position entry until after CPI print is the risk-adjusted approach. Do not pay for uncertainty when the resolving data point is 27 days away.',
        timestamp: '2026-05-15T01:04:22Z'
      },
      {
        step: 3,
        role: 'portfolio_manager',
        content: 'Watching. Will re-evaluate on June 11 after CPI release. If edge confirms, target entry at ~38-42 cents YES. Conviction will upgrade to HIGH if CPI < 2.8%.',
        timestamp: '2026-05-15T01:05:10Z'
      }
    ],
    evidence: [
      { label: 'Fed funds futures', source: 'CME FedWatch', detail: '58% implied probability of July cut — 17pp above Polymarket', weight: 'supporting' },
      { label: 'PCE inflation', source: 'BEA', detail: '2.6% last print — within Fed comfort zone', weight: 'supporting' },
      { label: 'April NFP', source: 'BLS', detail: '177k — above 150k threshold, labor market holding', weight: 'supporting' },
      { label: 'June CPI (pending)', source: 'BLS — June 11', detail: 'Unknown — single biggest risk to this thesis', weight: 'neutral' },
    ],
    risks: [
      'June CPI print above 3.1% would eliminate rate cut probability entirely',
      'Fed official hawkish communication before July FOMC',
      'Oil price spike above $90/bbl reigniting inflation expectations',
    ],
    catalysts: [
      'CPI < 2.8% on June 11 — would mechanically drive YES to 65-70%',
      'Fed Chair dovish testimony to Congress (scheduled May 20)',
      'Another NFP print above 175k showing non-inflationary labor market',
    ],
    positionIntent: 'Watching. Entry trigger: CPI < 2.9% on June 11. Target entry: 38-42 cents YES. Exit target: 72 cents.',
    invalidationCriteria: [
      'CPI prints above 3.1%',
      'Any Fed official explicitly rules out July cut',
      'NFP below 100k suggesting economic deterioration (stagflation scenario)',
    ],
    statusTimeline: [
      { status: 'watching', timestamp: '2026-05-15T01:05:10Z', note: 'Edge identified. Waiting for June 11 CPI before entering position.' },
    ],
    arcPublishStatus: 'published',
    traceHash: '0x3a8b2e6d9f1c4a7b3e8d2f5c9a1b6e4d7f3c2a5b9e1d4f7c3a8b2e6d9f1c4a',
    arcTxHash: '0x4ea28196042a0a5595fde216421fd61806472304da7e3041b6439fb3eb2d338c',
    publishedAt: '2026-05-15T01:06:00Z',
    updatedAt: '2026-05-15T01:06:00Z',
    createdAt: '2026-05-15T01:00:00Z',
  },
  {
    id: 'trc_eth_btc_ratio',
    asset: 'ETH',
    market: 'Will ETH/BTC ratio exceed 0.060 before August 1, 2026?',
    edge: 'ETH underperformance is structural post-Merge — Dencun upgrade benefits are already priced, and L2 fee compression has reduced ETH burn rate materially',
    conviction: 'low',
    status: 'exited',
    thesis: 'The ETH/BTC ratio recovering to 0.060 requires ETH to outperform BTC by ~25% from current levels. The structural headwinds from L2 cannibalisation of base layer fees have not been adequately priced into this market.',
    conclusion: 'Lean NO. The YES narrative requires a catalyst not yet visible. Low conviction — small position, or pass.',
    edgeNarrative: 'L2 transaction volumes have grown 340% YoY while base layer fee revenue has declined 18%. The ETH burn mechanism — the core deflationary argument — is materially weakened. The market is pricing ETH/BTC recovery based on the 2021 cycle playbook, which assumed base layer fee capture that no longer exists at the same magnitude.',
    reasoningSteps: [
      {
        step: 1,
        role: 'researcher',
        content: 'ETH/BTC current: 0.0482. Needs to reach 0.0600 for YES — a 24.5% outperformance of ETH vs BTC in 77 days. L2 fee revenue cannibalisation: base layer fees down 18% YoY despite overall ecosystem growth. ETH issuance: net inflationary for 4 consecutive months due to reduced burn.',
        timestamp: '2026-05-14T20:00:00Z'
      },
      {
        step: 2,
        role: 'risk_manager',
        content: 'Bull case for YES: ETH ETF inflows accelerate, Pectra upgrade narrative drives sentiment, BTC dominance plateaus. These are possible but not high-probability in the 77-day window. Risk/reward favors NO at current YES pricing (29%).',
        timestamp: '2026-05-14T20:08:00Z'
      },
      {
        step: 3,
        role: 'portfolio_manager',
        content: 'Entered NO at 71 cents. Exited at 74 cents after 12 days — adequate return for conviction level. Position closed. Monitoring for re-entry if YES price spikes above 40 cents on narrative without fundamental catalyst.',
        timestamp: '2026-05-14T20:10:00Z'
      }
    ],
    evidence: [
      { label: 'ETH base layer fees', source: 'Ultrasound.money', detail: 'Down 18% YoY despite ecosystem growth — L2 cannibalisation confirmed', weight: 'contradicting' },
      { label: 'ETH net issuance', source: 'Ultrasound.money', detail: 'Net inflationary for 4 consecutive months — deflationary thesis weakened', weight: 'contradicting' },
      { label: 'L2 volume growth', source: 'L2Beat', detail: '+340% YoY — accelerating fee migration away from mainnet', weight: 'contradicting' },
      { label: 'ETH ETF inflows', source: 'Bloomberg', detail: 'Modest but positive — some institutional demand exists', weight: 'neutral' },
    ],
    risks: [
      'Unexpected ETH ETF inflow acceleration could drive ratio higher',
      'BTC-specific negative event (regulatory, technical) would inflate ETH/BTC artificially',
      'Pectra upgrade sentiment re-rating',
    ],
    catalysts: [],
    positionIntent: 'Position exited. Re-entry trigger: YES price spikes above 40 cents without fundamental catalyst.',
    invalidationCriteria: [
      'ETH base layer fee revenue reverses and grows >20% MoM for 2 consecutive months',
      'ETH ETF net inflows exceed BTC ETF inflows for first time',
    ],
    statusTimeline: [
      { status: 'watching', timestamp: '2026-05-02T14:00:00Z', note: 'Market identified. Structural bearish thesis forming.' },
      { status: 'in_position', timestamp: '2026-05-03T09:00:00Z', note: 'Entered NO at 71 cents. Small position given low conviction.' },
      { status: 'exited', timestamp: '2026-05-14T20:10:00Z', note: 'Exited NO at 74 cents. +4.2% return. Adequate for conviction level.' },
    ],
    arcPublishStatus: 'published',
    traceHash: '0x7b3e8d2f5c9a1b6e4d7f3c2a5b9e1d4f7c3a8b2e6d9f1c4a7b3e8d2f5c9a1b',
    arcTxHash: '0xd9cf20a64751113866486aaa809ee29df928c7d53bfd255083a040991c0d6f24',
    publishedAt: '2026-05-03T09:01:00Z',
    updatedAt: '2026-05-14T20:10:00Z',
    createdAt: '2026-05-02T14:00:00Z',
  },
]

export function getTrace(id: string): Trace | undefined {
  return MOCK_TRACES.find(t => t.id === id)
}
