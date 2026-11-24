import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { expandStressFixtures } from '../docs/stress-fixtures.mjs'
const source = fs.readFileSync(new URL('../desktop/plugin.js', import.meta.url), 'utf8')
const pure = source.slice(source.indexOf('const SAMPLE ='), source.indexOf('const pageStyle ='))
const context = vm.createContext({ TextEncoder, TextDecoder, atob, btoa })
vm.runInContext(pure.replaceAll('export ', '') + '\nglobalThis.helpers = { SAMPLE, calculate, parseCsv, erpMonth, label, stockPath, inventoryHistory, historyStats, urgencyTone, gradeVariant, tickLabel, niceStep, stockCell, sortRows, validCard, encodeCard, decodeCard, CARD_MAX_LINE, orderGuidance: typeof orderGuidance === "function" ? orderGuidance : undefined, orderBucket: typeof orderBucket === "function" ? orderBucket : undefined, normalizeOrderSettings: typeof normalizeOrderSettings === "function" ? normalizeOrderSettings : undefined, DEFAULT_ORDER_SETTINGS: typeof DEFAULT_ORDER_SETTINGS === "undefined" ? undefined : DEFAULT_ORDER_SETTINGS }', context)
const { SAMPLE, calculate, parseCsv, label, stockPath, inventoryHistory, historyStats, urgencyTone, gradeVariant, tickLabel } = context.helpers
const plain = value => JSON.parse(JSON.stringify(value))

// Inspect the real component props without requiring a desktop/React installation.
// Browser harness checks remain separate: these mocks do not prove pixel layout.
function renderComponent(name, props, states = {}, updates = []) {
  let hook = 0
  const element = (type, props, key) => ({ type, props, key })
  const ui = vm.createContext({
    TextEncoder,
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : ['2026-11-11T12:00:00'])) }
      static now() { return Date.parse('2026-11-11T12:00:00') }
    },
    Component: class {},
    jsx: element,
    jsxs: element,
    useRef: () => ({ current: null }),
    useState: initial => {
      const index = hook++
      const value = Object.hasOwn(states, index) ? states[index] : typeof initial === 'function' ? initial() : initial
      return [value, next => updates.push({index,value:next})]
    },
    useEffect: () => {},
    useMemo: callback => callback(),
    ...Object.fromEntries(['Button', 'Badge', 'StatusDot', 'EmptyState', 'SegmentedControl', 'Select', 'SelectTrigger', 'SelectValue', 'SelectContent', 'SelectItem'].map(key => [key, key])),
  })
  const components = source.slice(source.indexOf('const SAMPLE ='), source.indexOf('export default'))
  vm.runInContext(components.replaceAll('export ', '') + '\nglobalThis.components = { Page, Chart, DataTable, Horizon, Settings, RunwayTable, OrderSettingInput }', ui)
  return ui.components[name](props)
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return []
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  return [tree, ...nodes(tree.props?.children)]
}
const storage = { get: (_, fallback) => fallback }
const sampleResults = () => calculate(SAMPLE.items, SAMPLE.months, SAMPLE.as_of, 6)

// Native stress packet: pure fixture entry plus presentation-only containment.
const visualStress = expandStressFixtures(JSON.parse(fs.readFileSync(new URL('./fixtures/visual-stress.json', import.meta.url), 'utf8')))
// Round 3 regressions: preserve the 181 inherited assertions below.
test('R3 narrow Page padding leaves room for Month plus a complete stock column', () => {
  for (const width of [160,180,199,200,320,390,1440]) {
    const main = nodes(renderComponent('Page', {ctx:{storage}}, {0:width})).find(n=>n.type==='main')
    assert.equal(main.props.style.padding, width<200?'16px 4px':16)
    const horizontal = width<200?4:16
    const available = width-2*horizontal-2 // card borders; existing table padding bleed is retained
    if (width===160) assert.ok(available>=49.203125+96.734375, 'host attempt2 Month+Stock must fit beside each other')
  }
  const all = nodes(renderComponent('DataTable', {title:'Timeline',headings:['Month','Stock'],rows:[['Oct 2026','123,456,789 sheets (4x8 ft)']],wrapColumns:true}))
  const region = all.find(n=>n.props?.role==='region')
  assert.match(region.props.style.marginInline, /-1 \* var\(--runway-pad-x/)
  assert.match(region.props.style.maxWidth, /100% \+ 2 \* var\(--runway-pad-x/)
})
test('R3 English numeric timeline stays LTR with sticky Month in an RTL host', () => {
  for (const wrapColumns of [true,false]) {
    const all = nodes(renderComponent('DataTable', {title:'Timeline',headings:['Month','Stock'],rows:[['Oct 2026','1,000,000,000,000 m']],wrapColumns}))
    const region = all.find(n=>n.props?.role==='region')
    assert.equal(region.props.style.direction, wrapColumns?'ltr':undefined)
    if (wrapColumns) {
      assert.ok(all.some(n=>n.type==='th' && n.props.style.position==='sticky' && n.props.style.left===0))
      assert.ok(all.some(n=>n.props?.['aria-label']==='1,000,000,000,000 m'))
    }
  }
})
test('R3 developer toolbar reserves measured document space on resize and cleans up', () => {
  const entry = fs.readFileSync(new URL('../docs/harness-entry.js',import.meta.url),'utf8')
  const html = fs.readFileSync(new URL('../docs/harness.html',import.meta.url),'utf8')
  const start = entry.indexOf('function reserveToolbarSpace(')
  assert.ok(start>=0, 'toolbar reservation must run from the real harness')
  assert.match(entry, /useEffect\(\(\) => reserveToolbarSpace\(toolbar.current\), \[\]\)/)
  assert.match(entry, /h\('nav', \{ ref: toolbar/)
  const properties = new Map(); let resized, observed, disconnected=false, height=64
  const scope = vm.createContext({document:{documentElement:{style:{setProperty:(k,v)=>properties.set(k,v),removeProperty:k=>properties.delete(k)}}},ResizeObserver:class {
    constructor(callback) {resized=callback} observe(el) {observed=el} disconnect() {disconnected=true}
  }})
  vm.runInContext(entry.slice(start,entry.indexOf('function Harness(',start))+'\nglobalThis.reserve=reserveToolbarSpace',scope)
  const toolbar={getBoundingClientRect:()=>({height})},cleanup=scope.reserve(toolbar)
  assert.equal(observed,toolbar);assert.equal(properties.get('--stress-controls-height'),'64px')
  height=132;resized();assert.equal(properties.get('--stress-controls-height'),'132px')
  assert.match(html, /padding-bottom:\s*var\(--stress-controls-height/)
  assert.match(html, /scroll-padding-bottom:\s*calc\(var\(--stress-controls-height/)
  cleanup();assert.equal(disconnected,true);assert.equal(properties.has('--stress-controls-height'),false)
})
test('R3 name oracle preserves long-name pressure and independently verifies short J', () => {
  const capture = fs.readFileSync(new URL('../docs/capture-stress.cjs',import.meta.url),'utf8')
  assert.ok(capture.includes('function checkNameLayout('))
  const failures=[]
  const scope = vm.createContext({check:(condition,name)=>{if(!condition) failures.push(name)}})
  vm.runInContext(capture.slice(capture.indexOf('function checkNameLayout('),capture.indexOf('async function numericGeometry('))+'\nglobalThis.checkName=checkNameLayout',scope)
  scope.checkName({nameText:'J',nameGraphemes:1,nameFullyShown:true,name:{width:8},rect:{width:288}},'short-J')
  assert.deepEqual(failures,[])
  scope.checkName({nameText:'J',nameGraphemes:1,nameFullyShown:false,name:{width:8},rect:{width:288}},'clipped-J')
  assert.deepEqual(failures,['short product name fully shown'])
  const longName=visualStress.worst.items[0].name
  scope.checkName({nameText:longName,nameGraphemes:[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(longName)].length,nameFullyShown:true,name:{width:48},rect:{width:288}},'long-name')
  assert.deepEqual(failures,['short product name fully shown','name-starved-by-badge'])
})
test('compact stress templates preserve the exact preconversion expanded datasets', () => {
  const raw = fs.readFileSync(new URL('./fixtures/visual-stress.json', import.meta.url))
  assert.ok(raw.byteLength <= 30000)
  const templates = JSON.parse(raw), before = JSON.stringify(templates)
  const expanded = expandStressFixtures(templates)
  // Captured from the original full datasets before descriptor conversion.
  assert.equal(createHash('sha256').update(JSON.stringify(expanded)).digest('hex'), '6e7e4667cd2db48598e68e38289cc20beb0b7b5027be7ed23f34b608f058893d')
  assert.equal(expanded.thousand.items[0].sku, 'UL-FOAM-GRN-2026-XL-ANTISLIP-PREMIUM-0000')
  assert.equal(expanded.thousand.items[999].sku, 'UL-FOAM-GRN-2026-XL-ANTISLIP-PREMIUM-0999')
  assert.equal(JSON.stringify(templates), before, 'expansion does not mutate the descriptor')
  assert.notEqual(expanded.thousand.items[0].monthly_sales, expanded.thousand.items[999].monthly_sales)
})
test('stress geometry excludes SDK segmented controls on baseline and final product rows', async () => {
  const capture = fs.readFileSync(new URL('../docs/capture-stress.cjs', import.meta.url), 'utf8')
  const box = () => ({ x:0, y:0, width:180, height:40, right:180, bottom:40 })
  const row = label => ({ getAttribute:()=>label, getBoundingClientRect:box,
    querySelector:selector=>['strong','[data-status-label]'].includes(selector) ? {getBoundingClientRect:box} : null })
  const productRows = [row('Baseline product'), row('Final product')]
  // Both SDK segmented buttons have aria-pressed but neither product child.
  const segments = [row('By type'), row('All SKUs')].map(el=>({...el,querySelector:()=>null}))
  const selectors = []
  const document = { documentElement:{scrollWidth:320}, querySelectorAll:selector=>{
    selectors.push(selector)
    if (selector.includes('button[aria-pressed]')) return selector.includes(':has([data-status-label])') ? productRows : [...segments,...productRows]
    if (selector.startsWith('main p') || selector === '[data-bucket]' || selector === '[data-order-sku]') return []
    throw Error('Unexpected geometry selector: '+selector)
  } }
  const scope = vm.createContext({document,innerWidth:320})
  const selector = capture.match(/^const PRODUCT_ROWS = .*$/m)?.[0] || ''
  vm.runInContext(selector+'\n'+capture.slice(capture.indexOf('async function geometry('),capture.indexOf('async function numericGeometry('))+'\nglobalThis.runGeometry=geometry',scope)
  const result = await scope.runGeometry({evaluate:(callback,arg)=>callback(arg)})
  assert.deepEqual(plain(result.rows).map(row=>row.label), ['Baseline product','Final product'])
  assert.ok(selectors.some(selector=>selector.includes(':has([data-status-label])')))
  assert.ok(!selectors.some(selector=>selector.includes('data-runway-product')), '6dcda30 lacks the new product attribute')
})
test('visual stress fixtures cover every bucket and all 1000 urgent rows through real calculation', () => {
  const { worst, thousand, future } = visualStress
  const rows = calculate(worst.items, worst.months, worst.as_of, 6)
  const buckets = new Set(rows.map(item => context.helpers.orderBucket(item, '2026-11-11', context.helpers.DEFAULT_ORDER_SETTINGS, worst.as_of)))
  assert.deepEqual([...buckets].sort(), ['healthy','needs-data','no-sales','order','overstocked','running-low'].sort())
  assert.ok(rows.some(row => !row.held && inventoryHistory(row, worst.months).rows.some(month => month.raw_stock < 0)))
  assert.equal(thousand.items.length, 1000)
  assert.equal(new Set(thousand.items.map(item => item.sku)).size, 1000)
  const urgent = calculate(thousand.items, thousand.months, thousand.as_of, 6)
  assert.ok(urgent.every(row => context.helpers.orderBucket(row, '2026-11-11', context.helpers.DEFAULT_ORDER_SETTINGS, thousand.as_of) === 'order'))
  assert.ok(calculate(future.items, future.months, future.as_of, 12).every(row => !row.held))
  const noSales = rows.find(row => row.sku === 'NO-SALES-2026')
  assert.equal(context.helpers.orderGuidance(noSales, '2026-11-11', context.helpers.DEFAULT_ORDER_SETTINGS, worst.as_of).overstock_months, Infinity)
  const gap = rows.find(row => row.sku === 'GAP-RESTOCK-2026')
  assert.ok(context.helpers.orderGuidance(gap, '2026-11-11', context.helpers.DEFAULT_ORDER_SETTINGS, worst.as_of).delivery_date)
})
test('stress Page fixtures retain full names and never render raw nonfinite values', () => {
  for (const data of Object.values(visualStress).filter(data => data.items.length)) {
    const before = JSON.stringify(data)
    const all = nodes(renderComponent('Page', { ctx: { storage } }, { 1:'csv', 2:data }))
    const text = textValues(all).join('\n')
    assert.doesNotMatch(text, /\b(?:NaN|Infinity|undefined)\b|\[object Object\]/)
    assert.equal(JSON.stringify(data), before)
    const productRows = all.filter(n => n.props?.['data-runway-product'])
    assert.ok(productRows.length > 0 && productRows.length <= 50)
    for (const row of productRows) assert.ok(data.items.some(item => row.props['aria-label'].includes(item.sku) && row.props['aria-label'].includes(item.name)))
  }
})
test('stress selected and unselected product/filter focus retain a visible CSS fallback despite inline shadows', () => {
  const all = nodes(renderComponent('Page', { ctx: { storage } }))
  const css = all.filter(n => n.type === 'style').map(n => n.props.children).join('\n')
  assert.match(css, /\[data-runway-product\]:focus-visible/)
  assert.match(css, /\[data-bucket\]:focus-visible/)
  assert.match(css, /outline:\s*2px solid var\(--ui-blue\)/)
  assert.match(css, /outline-offset:\s*-4px/, 'focus stays inside the scrolling product list clipping boundary')
  const rows = all.filter(n => n.type === 'Button' && n.props['aria-pressed'] !== undefined)
  assert.ok(rows.some(n => n.props['aria-pressed']) && rows.some(n => !n.props['aria-pressed']))
  assert.ok(rows.every(n => n.props['data-runway-product'] === true))
})
test('stress badge keeps its line while long product names can occupy a full flex line', () => {
  const all = nodes(renderComponent('Page', { ctx: { storage } }))
  const row = all.find(n => n.type === 'Button' && n.props['aria-pressed'] !== undefined)
  const badge = nodes(row).find(n => n.props?.['data-status-label'])
  const heading = nodes(row).find(n => Array.isArray(n.props?.children) && n.props.children.includes(badge))
  assert.equal(heading.props.style.flexWrap, 'wrap')
  assert.equal(badge.props.style.whiteSpace, 'nowrap')
  const name = nodes(row).find(n => n.type === 'strong')
  assert.match(name.props.style.flex, /128px/)
})
test('stress settings labels and inputs can shrink below intrinsic identifier/input width', () => {
  const all = nodes(renderComponent('OrderSettingInput', {title:'Minimum order · '+visualStress.worst.items[1].sku,id:'stress',value:1e12,onChange:()=>true}))
  assert.equal(all.find(n => n.type === 'label').props.style.minWidth, 0)
  assert.equal(all.find(n => n.type === 'label').props.style.overflowWrap, 'anywhere')
  assert.equal(all.find(n => n.type === 'input').props.style.minWidth, 0)
})
test('stress page wraps unbounded categories, reasons and descriptive units without changing table policies', () => {
  const all = nodes(renderComponent('Page', { ctx: { storage } }))
  assert.equal(all.find(n => n.type === 'main').props.style.overflowWrap, 'anywhere')
  assert.equal(all.find(n => n.type === 'main').props.style.minWidth, 0)
})
test('stress long metric unit timeline retains exact access and individually unbroken numeric tokens', () => {
  const value = '1,000,000,000,000 squaremillimetresISO800002026certified'
  const all = nodes(renderComponent('DataTable', {title:'Stress timeline',headings:['Month','Stock'],rows:[['Oct 2026',value]],wrapColumns:true}))
  const cell = all.find(n => n.type === 'td')
  assert.equal(cell.props['aria-label'], value)
  assert.equal(cell.props.title, value)
  const tokens = nodes(cell).filter(n => n.props?.['data-numeric-token'])
  assert.ok(tokens.some(n => n.props.children === '1,000,000,000,000'))
  assert.ok(tokens.every(n => n.props.style.whiteSpace === 'nowrap'))
  assert.ok(nodes(cell).some(n => n.props?.['data-wrap-unit'] && n.props.style.overflowWrap === 'anywhere'))
})

const guidanceItem = overrides => ({ sku: 'TEST-1', name: 'Synthetic item', unit: 'm', as_of: '2026-10-31', on_hand: 45, stock: 45,
  monthly_demand: 30, monthly_sales: [30, 30, 30], supplier_days: 14, receipts: {}, held: false, ...overrides })
test('order guidance uses explicit today and delivery plus cover, rounds to whole units', () => {
  assert.equal(typeof context.helpers.orderGuidance, 'function', 'order math helper is present')
  const result = context.helpers.orderGuidance(guidanceItem({}), '2026-11-11', { ...context.helpers.DEFAULT_ORDER_SETTINGS })
  assert.equal(result.order_by, '2026-12-02')
  assert.equal(result.quantity, orderOracle('2026-10-31','2027-02-14',30,45))
  assert.equal(result.lead_days, 14)
  assert.equal(result.used_default_lead, false)
})
test('order guidance distinguishes default, unknown, and known zero delivery time', () => {
  const math = context.helpers.orderGuidance
  const defaults = context.helpers.DEFAULT_ORDER_SETTINGS
  const fallback = math(guidanceItem({ supplier_days: null }), '2026-11-11', defaults)
  assert.equal(fallback.lead_days, 14); assert.equal(fallback.used_default_lead, true)
  assert.equal(math(guidanceItem({ supplier_days: 0 }), '2026-11-11', defaults).used_default_lead, false)
  const unknown = math(guidanceItem({ supplier_days: null }), '2026-11-11', { ...defaults, default_delivery_days: null })
  assert.equal(unknown.status, 'needs-data')
})
test('order guidance reports past order dates as now and out of stock immediately', () => {
  const math = context.helpers.orderGuidance, defaults = context.helpers.DEFAULT_ORDER_SETTINGS
  const late = math(guidanceItem({ on_hand: 0, stock: 0 }), '2026-11-11', defaults)
  assert.equal(late.status, 'order'); assert.equal(late.order_by, 'now')
  assert.equal(late.out_of_stock, true); assert.ok(late.quantity > 0)
  const noOrder = math(guidanceItem({ on_hand: 1000, stock: 1000 }), '2026-11-11', defaults)
  assert.equal(noOrder.quantity, 60, 'quantity replenishes at the future order date')
  assert.ok(noOrder.order_by > '2026-11-11')
})
test('order-by dates convert today or earlier to now and retain future calendar dates', () => {
  const math = context.helpers.orderGuidance, defaults = context.helpers.DEFAULT_ORDER_SETTINGS
  assert.equal(math(guidanceItem({ on_hand: 14 }), '2026-11-11', defaults).order_by, 'now')
  assert.equal(math(guidanceItem({ on_hand: 1 }), '2026-11-11', defaults).order_by, 'now')
  assert.equal(math(guidanceItem({ on_hand: 45 }), '2026-11-11', defaults).order_by, '2026-12-02')
})
test('incoming confirmed before cover end reduces order quantity; supplier zero is known', () => {
  const math = context.helpers.orderGuidance, defaults = context.helpers.DEFAULT_ORDER_SETTINGS
  const incoming = math(guidanceItem({ receipts: { '2026-11': 100 } }), '2026-11-11', defaults)
  assert.equal(incoming.quantity, orderOracle('2026-10-31','2027-05-25',30,45,{'2026-11':100}))
  assert.equal(incoming.incoming, 100)
  assert.ok(incoming.runout_date > math(guidanceItem({}), '2026-11-11', defaults).runout_date,
    'a confirmed delivery at the start of its month delays the estimated run-out')
  const coveredOutOfStock = guidanceItem({ on_hand: 0, stock: 0, receipts: { '2026-12': 100 } })
  assert.equal(math(coveredOutOfStock, '2026-11-11', defaults).quantity, 0)
  assert.equal(context.helpers.orderBucket(coveredOutOfStock, '2026-11-11', defaults), 'order', 'out-of-stock priority survives zero purchasing quantity')
})
test('minimum and pack settings apply only to a positive net need, including fractions', () => {
  const math = context.helpers.orderGuidance, defaults = context.helpers.DEFAULT_ORDER_SETTINGS
  const settings = { ...defaults, product_overrides: { 'TEST-1': { minimum_order: 8, pack_size: 6 } } }
  assert.equal(math(guidanceItem({ on_hand: 100, stock: 100, monthly_demand: 0 }), '2026-11-11', settings).quantity, 0)
  assert.equal(math(guidanceItem({ on_hand: 20.5, stock: 20.5 }), '2026-11-11', settings).quantity, orderOracle('2026-10-31','2027-01-24',30,20.5,{},6,8))
  assert.equal(math(guidanceItem({ on_hand: 20.5, stock: 20.5, monthly_demand: 30.25 }), '2026-11-11', defaults).quantity, orderOracle('2026-10-31','2027-01-24',30.25,20.5))
})
test('no forecast, zero demand, huge supported quantities, and unsafe dates stay bounded', () => {
  const math = context.helpers.orderGuidance, defaults = context.helpers.DEFAULT_ORDER_SETTINGS
  assert.equal(math(guidanceItem({ held: true, reason: 'Insufficient history' }), '2026-11-11', defaults).status, 'needs-data')
  assert.equal(math(guidanceItem({ monthly_demand: 0, monthly_sales: [0, 0, 0], on_hand: 10 }), '2026-11-11', defaults).status, 'overstocked')
  const huge = math(guidanceItem({ on_hand: 0, stock: 0, monthly_demand: 1e10 }), '2026-11-11', defaults)
  assert.ok(Number.isFinite(huge.quantity) && huge.quantity > 0 && huge.quantity <= 1e12)
  assert.equal(math(guidanceItem({ on_hand: 0, stock: 0, monthly_demand: 30 }), '9999-12-31', defaults).status, 'needs-data')
})
test('settings recover from corrupt persistence and reset product overrides', () => {
  const normalize = context.helpers.normalizeOrderSettings
  assert.equal(typeof normalize, 'function')
  const value = normalize({ default_delivery_days: 'bad', months_of_cover: 80, urgent_days: -1,
    running_low_days: 30, overstock_months: Infinity, product_overrides: { 'TEST-1': { pack_size: -1 } } })
  assert.deepEqual(plain(value), plain(context.helpers.DEFAULT_ORDER_SETTINGS))
})
test('primary bucket is exactly one result and respects declared priority', () => {
  const bucket = context.helpers.orderBucket
  assert.equal(typeof bucket, 'function')
  const defaults = context.helpers.DEFAULT_ORDER_SETTINGS
  const cases = [
    [guidanceItem({ held: true, on_hand: 0, stock: 0 }), 'needs-data'],
    [guidanceItem({ on_hand: 0, stock: 0 }), 'order'],
    [guidanceItem({ on_hand: 40, stock: 40 }), 'running-low'],
    [guidanceItem({ on_hand: 1000, stock: 1000, monthly_demand: 30 }), 'overstocked'],
    [guidanceItem({ on_hand: 100, stock: 100, monthly_demand: 0, monthly_sales: [0, 0, 0] }), 'no-sales'],
    [guidanceItem({ on_hand: 100, stock: 100, monthly_demand: 30, monthly_sales: [0, 0, 0] }), 'no-sales'],
    [guidanceItem({ on_hand: 80, stock: 80, monthly_demand: 30 }), 'healthy'],
  ]
  for (const [item, expected] of cases) assert.equal(bucket(item, '2026-11-11', defaults), expected)
})
test('order quantity does not depend on selected display forecast horizon', () => {
  const item = guidanceItem({})
  const result = context.helpers.orderGuidance
  assert.equal(result(item, '2026-11-11', context.helpers.DEFAULT_ORDER_SETTINGS).quantity,
    result({ ...item, projection: [] }, '2026-11-11', context.helpers.DEFAULT_ORDER_SETTINGS).quantity)
})
test('order panel leads the product browser, rows expose SKU, filters count, and advanced starts collapsed', () => {
  const all = nodes(renderComponent('Page', { ctx: { storage } }))
  const orderPanel = all.find(n => String(n.props?.['aria-label'] || '').startsWith('Order now ('))
  const browser = all.find(n => n.props?.['aria-label'] === 'Inventory items, soonest run-out first')
  const grid = all.find(n => n.props?.style?.gridTemplateColumns)
  assert.ok(orderPanel && browser && all.indexOf(orderPanel) < all.indexOf(grid))
  const orderRows = nodes(orderPanel).filter(n => n.type === 'button' && n.props['data-order-sku'])
  assert.ok(orderRows.length > 0)
  assert.ok(orderRows.every(row => textValues(nodes(row)).some(value => value.includes(`SKU ${row.props['data-order-sku']}`))))
  const filters = all.find(n => n.props?.['aria-label'] === 'Product filters')
  assert.deepEqual(nodes(filters).filter(n => n.props?.['data-bucket']).map(n => n.props['data-bucket']),
    ['all', 'order', 'running-low', 'healthy', 'overstocked', 'no-sales', 'needs-data'])
  const advanced = all.find(n => n.props?.['data-advanced-settings'])
  assert.ok(advanced && advanced.props.open !== true)
  assert.doesNotMatch(textValues(nodes(orderPanel)).join(' '), /\b(?:MOQ|EOQ|EORQ)\b/)
  assert.deepEqual(nodes(advanced).filter(n => n.type?.name === 'OrderSettingInput').map(n => n.props.title), [
    'Lead time (days)', 'Order cover (months)', 'Overstock above (months of cover)',
    'Urgent if stock-out within (days)', 'Running low within (days)',
    'MOQ (minimum order quantity)', 'Order multiple / pack size',
  ])
  const fields = nodes(advanced).filter(n => n.type?.name === 'OrderSettingInput')
  assert.ok(fields.every(n => n.props.hint.includes('E.g.')))
  for (const id of ['product-minimum-order', 'product-pack-size']) {
    const hint = fields.find(n => n.props.id === id).props.hint
    assert.match(hint, /SKU /)
    assert.ok(hint.includes('UL-FOAM-GRN'))
  }
})

// Sole repair: independent snapshot/calendar and supported-number contracts.
const repairSettings = () => ({ ...context.helpers.DEFAULT_ORDER_SETTINGS })
const repairMath = (patch = {}, today = '2026-11-11', settings = repairSettings(), asOf = '2026-10-31') =>
  context.helpers.orderGuidance(guidanceItem(patch), today, settings, asOf)
test('repair snapshot anchor agrees with calculate and uses actual today only for urgency', () => {
  const item = guidanceItem({on_hand:30})
  const old = calculate([item], ['2026-08','2026-09','2026-10'], '2026-10-31', 1)[0]
  assert.equal(old.runout_day, '2026-11-30')
  assert.equal(repairMath({on_hand:30}).runout_date, old.runout_day)
  assert.equal(repairMath({on_hand:30}).order_by, old.order_by)
  for (const [today, expected] of [['2026-11-15','2026-11-16'],['2026-11-16','now'],['2026-11-17','now']])
    assert.equal(repairMath({on_hand:30},today).order_by,expected)
  assert.equal(repairMath({on_hand:30},'2026-10-31').runout_date, old.runout_day)
  assert.equal(repairMath({on_hand:30}).stock_date,'2026-10-31')
})
test('repair receipt in stale snapshot gap and horizon 1 versus 12 keep the same answer', () => {
  const item = guidanceItem({on_hand:30, receipts:{'2026-11':30}})
  const rows = [1,12].map(h => calculate([item],['2026-08','2026-09','2026-10'],'2026-10-31',h)[0])
  const guidance = rows.map(row => context.helpers.orderGuidance(row,'2026-12-01',repairSettings(),'2026-10-31'))
  assert.deepEqual(plain(guidance[0]),plain(guidance[1]))
  assert.equal(guidance[0].runout_date,rows[1].runout_day)
  assert.equal(guidance[0].runout_date,'2026-12-31')
  assert.equal(guidance[0].incoming,30)
  // Calendar policy: max(Dec 1, Dec 17) + 14 + 60 ends Mar 1; ceil(demand - 30 stock - 30 receipts) = 61.
  assert.equal(guidance[0].quantity,orderOracle('2026-10-31','2027-03-01',30,30,{'2026-11':30}))
  assert.equal(guidance[0].quantity,61)
  assert.equal(repairMath({on_hand:1.7}).quantity,orderOracle('2026-10-31','2027-01-24',30,1.7))
  assert.equal(repairMath({on_hand:1.7}).runout_date,'2026-11-01','forecast keeps established rounded-down stock')
})
test('repair zero-purchase incoming retains shortage status and exclusive bucket priority', () => {
  for (const on_hand of [0,5]) for (const receipt of [100,1000]) {
    const item=guidanceItem({on_hand,receipts:{'2026-12':receipt}})
    const guidance=repairMath(item)
    assert.equal(guidance.quantity,0)
    assert.equal(guidance.supply_gap,true)
    assert.equal(guidance.delivery_date,'2026-12-01')
    assert.equal(context.helpers.orderBucket(item,'2026-11-11',repairSettings(),'2026-10-31'),'order')
  }
  assert.equal(context.helpers.orderBucket(guidanceItem({on_hand:0,monthly_demand:0,monthly_sales:[0,0,0]}),'2026-11-11',repairSettings(),'2026-10-31'),'order')
  assert.equal(context.helpers.orderBucket(guidanceItem({on_hand:5,monthly_demand:0,monthly_sales:[0,0,0]}),'2026-11-11',repairSettings(),'2026-10-31'),'no-sales')
})
test('repair fractional cover and known fractional supplier days are valid', () => {
  const guidance=repairMath({on_hand:0,supplier_days:0.5},'2026-11-11',{...repairSettings(),months_of_cover:0.25})
  assert.equal(guidance.lead_days,1)
  assert.equal(guidance.used_default_lead,false)
  assert.equal(guidance.quantity,20,'11 elapsed days plus one lead day plus eight cover days')
})
test('repair decimal packs and minimums round precisely only for positive need', () => {
  const settings=(minimum_order,pack_size)=>({...repairSettings(),product_overrides:{'TEST-1':{minimum_order,pack_size}}})
  for (const [on_hand,minimum,pack,expected] of [[43,0,2.5,32.5],[74.71,0,0.1,0.3],[74.71,0.45,0.1,0.5],[74.8,0,0.1,0.2],[75,100.5,2.5,0],[0,1e12,2.5,1e12]]) {
    const result=repairMath({on_hand,monthly_demand:90,supplier_days:0},'2026-11-25',{...settings(minimum,pack),months_of_cover:0})
    assert.equal(result.quantity,expected)
    assert.ok(result.quantity===0 || result.quantity>=minimum)
  }
  const tiny=repairMath({},'2026-11-11',settings(0,1e-12))
  assert.equal(tiny.status,'needs-data')
  assert.match(tiny.reason,/Pack size.*0\.000001/)
})
test('repair calculated quantity exceeds per-cell cap within safe arithmetic bounds', () => {
  for (const [lead,cover,endpoint] of [[14,2,'2027-01-24'],[3650,36,'2039-10-24']]) {
    const result=repairMath({on_hand:0,monthly_demand:1e12,supplier_days:lead},'2026-11-11',{...repairSettings(),months_of_cover:cover})
    assert.equal(result.quantity,orderOracle('2026-10-31',endpoint,1e12,0))
    assert.equal(result.status,'order')
  }
  assert.equal(repairMath({monthly_demand:1e18}).status,'needs-data')
  assert.equal(repairMath({monthly_demand:Infinity}).status,'needs-data')
  assert.equal(repairMath({},'9999-12-31').status,'needs-data')
})
test('repair calendar parity includes receipt recovery and same-date boundaries', () => {
  for (const on_hand of [0,0.7,1.7,5,30,45,200,1e12]) for (const receipts of [{},{'2026-11':100},{'2026-12':100,'2027-02':30}]) {
    const item=guidanceItem({on_hand,receipts})
    for (const horizon of [1,12]) {
      const row=calculate([item],['2026-08','2026-09','2026-10'],'2026-10-31',horizon)[0]
      const guidance=context.helpers.orderGuidance(row,'2026-10-31',repairSettings(),'2026-10-31')
      if (row.runout_day) {
        assert.equal(guidance.runout_date,row.runout_day)
        assert.equal(guidance.order_by,row.order_by <= '2026-10-31' ? 'now' : row.order_by)
      }
    }
  }
  assert.equal(repairMath({on_hand:30,supplier_days:0.5}).order_by,'2026-11-29')
  assert.equal(repairMath({on_hand:30,supplier_days:0}).order_by,'2026-11-30')
})
test('repair decimal precision and invalid pack limits fail explicitly', () => {
  for (const pack_size of [0,-1,1e-12,0.0000009,1.0000000000001,Infinity,1e13]) {
    const result=repairMath({},'2026-11-11',{...repairSettings(),product_overrides:{'TEST-1':{pack_size}}})
    assert.equal(result.status,'needs-data')
    assert.match(result.reason,/Pack size must be from 0\.000001/)
  }
  assert.equal(repairMath({on_hand:74.999999,monthly_demand:90,supplier_days:0},'2026-11-25',{...repairSettings(),months_of_cover:0,product_overrides:{'TEST-1':{pack_size:0.000001}}}).quantity,0.000001)
  const unsafe=repairMath({on_hand:0,monthly_demand:1e12,supplier_days:3650},'2026-11-11',{
    ...repairSettings(),months_of_cover:36,product_overrides:{'TEST-1':{pack_size:0.000001}}})
  assert.equal(unsafe.status,'needs-data')
  assert.match(unsafe.reason,/safe decimal precision/)
})
test('repair order labels carry a year and use now without by now', () => {
  const all=nodes(renderComponent('Page',{ctx:{storage}}))
  const panel=all.find(n=>String(n.props?.['aria-label']||'').startsWith('Order now ('))
  const text=textValues(nodes(panel)).join(' ')
  assert.doesNotMatch(text,/by now/)
  assert.match(text,/\b2026\b/)
})

// A7 fixtures remain explicitly synthetic; only presentation language changes.
const clarityData = overrides => ({ as_of: '2026-10-31', months: ['2026-08', '2026-09', '2026-10'], items: [{
  sku: 'SYN-A7', name: 'Synthetic clarity fixture', unit: 'm', on_hand: 20, supplier_days: 1,
  monthly_sales: [10, 10, 10], receipts: {}, historical_receipts: { '2026-08': 0, '2026-09': 0, '2026-10': 0 }, ...overrides,
}] })
const clarityPage = (data, states = {}) => nodes(renderComponent('Page', { ctx: { storage } }, { 1: 'csv', 2: data, ...states }))
const selectedNodes = all => nodes(all.find(n => n.props?.['aria-label'] === 'Selected item forecast'))
// nodes() already visits child elements; collect only direct strings, including nested arrays.
const childStrings = child => typeof child === 'string' ? [child] : Array.isArray(child) ? child.flatMap(childStrings) : []
const textValues = all => all.flatMap(n => childStrings(n.props?.children))

for (const [name, stock, days] of [
  ['known lead', 20, 1], ['unknown product lead uses explicit default', 10, null],
  ['exact stock exceeds cover', 1000, 1],
]) test(`Order answer: ${name}`, () => {
  const all = selectedNodes(clarityPage(clarityData({ on_hand: stock, supplier_days: days })))
  assert.ok(all.some(n => n.type === 'h2' && n.props.children === 'Synthetic clarity fixture · SKU SYN-A7'))
  const answer = all.find(n => n.props?.role === 'status')
  assert.match(answer.props.children, /^(Order |Out of stock — Order |No order needed —)/)
  assert.ok(!/NaN|Infinity/.test(answer.props.children))
  assert.ok(all.indexOf(answer) < all.findIndex(n => n.type?.name === 'Chart'))
})

test('A7 on-order note uses only positive selected-horizon receipts and the selected unit', () => {
  const data = clarityData({ receipts: { '2026-10': 900, '2026-11': 2.5, '2026-12': 4, '2027-01': 0, '2027-05': 100 }, unit: 'm²' })
  data.items.push({ ...data.items[0], sku: 'OTHER', unit: 'kg', receipts: { '2026-11': 999 } })
  for (const [horizon, qty] of [[1, '2.5'], [6, '6.5'], [7, '106.5']]) {
    const all = clarityPage(data, { 3: horizon, 4: 'SYN-A7' })
    const selected = selectedNodes(all)
    assert.equal(textValues(selected).filter(t => t === `Includes ${qty} m² on order`).length, 1)
    assert.ok(!textValues(all).includes('Assumes nothing is on order.'))
  }
  data.items[0].receipts = { '2026-11': 0, '2027-05': 100 }
  const all = clarityPage(data, { 4: 'SYN-A7' })
  assert.equal(textValues(selectedNodes(all)).filter(t => t === 'Assumes nothing is on order.').length, 1)
  assert.ok(!textValues(all).some(t => t.startsWith('Includes ')))
})

test('A7 headline keeps exact sample numbers and explains short runway', () => {
  const all = nodes(renderComponent('Page', { ctx: { storage } }))
  assert.ok(textValues(all).includes('8,269 m left · sells about 14,153 m a month · less than a month left'))
  const longer = nodes(renderComponent('Page', { ctx: { storage } }, { 4: 'TRM-ALU-25' }))
  assert.ok(textValues(longer).includes('1,125 m left · sells about 153 m a month'))
})

for (const [stock, sales, short] of [[5, 10, true], [10, 10, false], [20, 10, false], [5, 0, false], [0, 0, true]]) {
  test(`A7 headline edge: stock ${stock}, sales ${sales}`, () => {
    const all = selectedNodes(clarityPage(clarityData({ on_hand: stock, monthly_sales: [sales, sales, sales] })))
    assert.ok(textValues(all).includes(`${stock} m left · sells about ${sales} m a month${short ? ' · less than a month left' : ''}`))
    assert.ok(!textValues(all).some(t => /NaN|Infinity/.test(t)))
  })
}

test('A7 chart uses human units, forecast demand legend and timeline explanation', () => {
  for (const [unit, axis] of [['m', 'Metres'], ['m²', 'Square metres'], ['kg', 'Kilograms'], ['units', 'Units'], ['ea', 'Units'], ['a very long custom unit', 'Units']]) {
    const data = clarityData({ unit })
    const item = calculate(data.items, data.months, data.as_of, 6)[0]
    const all = nodes(renderComponent('Chart', { item, months: data.months }))
    assert.ok(all.some(n => n.type === 'text' && n.props.children === axis))
    const caption = all.find(n => n.type === 'figcaption')
    const labels = nodes(caption).flatMap(n => Array.isArray(n.props?.children) ? n.props.children.filter(c => typeof c === 'string') : [])
    assert.deepEqual(labels, ['Past demand', 'Forecast demand', 'Deliveries', 'Stock on hand'])
    assert.ok(textValues(all).includes('Dots show stock at month end.'))
    assert.ok(textValues(all).includes('Left of Now: what happened. Right: forecast.'))
    assert.ok(!textValues(all).some(t => /Quantity|Starts at|Inventory points/.test(t)))
    assert.match(all.find(n => n.type === 'svg').props['aria-label'], /As of 31 Oct 2026/)
  }
})

test('A7 inventory dots are actual month ends, never fractional crossing or rounded-start points', () => {
  for (const missing of [false, true]) {
    const data = clarityData({ on_hand: 5.5, ...(missing ? { historical_receipts: undefined } : {}) })
    const item = calculate(data.items, data.months, data.as_of, 6)[0]
    const all = nodes(renderComponent('Chart', { item, months: data.months }, { 0: 358 }))
    const dots = all.filter(n => n.props?.['data-inventory-dot'])
    assert.equal(dots.length, (missing ? 0 : 3) + 6)
    assert.deepEqual(dots.map(n => n.props['data-month']), [...(missing ? [] : data.months), ...item.projection.map(r => r.month)])
    const points = all.find(n => n.type === 'polyline').props.points.split(' ').map(p => p.split(',').map(Number))
    for (const dot of dots) {
      assert.equal(dot.type, 'circle'); assert.ok(dot.props.r > 0 && dot.props.r <= 3)
      assert.ok(points.some(([x, y]) => x === dot.props.cx && y === dot.props.cy))
    }
    const runout = all.find(n => n.props?.['data-runout'])
    assert.ok(runout); assert.equal(runout.props.fill, 'var(--ui-red)')
    assert.ok(!dots.some(n => n.props.cx === runout.props.cx))
  }
})

test('A7 zero stock and zero demand say Out of stock without implying unmet demand', () => {
  const data = clarityData({ on_hand: 0, monthly_sales: [0, 0, 0], supplier_days: null })
  const selected = selectedNodes(clarityPage(data))
  const chart = selected.find(n => n.type?.name === 'Chart')
  const all = [...selected, ...nodes(renderComponent('Chart', chart.props))]
  assert.ok(textValues(all).includes('Out of stock'))
  assert.ok(!textValues(all).some(t => t === 'Short' || /unmet demand/i.test(t)))
  assert.ok(all.some(n => n.props?.['data-runout']))
  const table = selected.find(n => n.type?.name === 'DataTable' && n.props.title === 'Month by month: stock, sales, deliveries')
  assert.ok(table.props.rows.filter((_, i) => table.props.rowStates[i] !== 'now').every(r => r[3] === 'Out of stock · Reconstructed 0 m' || r[3] === 'Out of stock · 0 m'))
})

test('A7 sample delivery note explains confidence exactly once and stays sample-only', () => {
  const note = 'Sample delivery history is a made-up example.'
  const explanation = 'Forecast confidence checks past sales, not these made-up deliveries.'
  const sampleText = textValues(nodes(renderComponent('Page', { ctx: { storage } })))
  assert.deepEqual(sampleText.filter(t => t.includes(note) || t.includes(explanation)), [`${note} ${explanation}`])
  const csvText = textValues(clarityPage(clarityData({})))
  assert.deepEqual(csvText.filter(t => t.includes(note) || t.includes(explanation)), [])
})

test('A7 page labels and sidebar hierarchy are plain while controls retain semantics', () => {
  const all = nodes(renderComponent('Page', { ctx: { storage } }))
  const summaries = all.filter(n => n.type === 'summary').map(n => n.props.children)
  assert.ok(summaries.includes('Month by month: stock, sales, deliveries'))
  assert.ok(summaries.includes('How the forecast works'))
  assert.ok(summaries.includes('Past sales (12 months)'))
  assert.ok(summaries.includes('How good is this forecast? · Usable for planning'))
  assert.ok(all.some(n => n.type?.name === 'Horizon' && n.props.title === 'Look ahead'))
  assert.ok(all.some(n => n.type === 'SegmentedControl' && n.props.options.some(o => o.id === 'csv' && o.label === 'My file (CSV)')))
  assert.ok(textValues(all).includes('Sample delivery history is a made-up example. Forecast confidence checks past sales, not these made-up deliveries.'))
  assert.ok(!textValues(all).some(t => /synthetic/i.test(t)))
  const sidebar = all.find(n => n.props?.['aria-label'] === 'Inventory items, soonest run-out first')
  const children = sidebar.props.children
  assert.ok(children.some(n => n?.type === 'p' && String(n.props.children).includes('Colors identify')))
  const row = nodes(sidebar).find(n => n.type === 'Button')
  assert.equal(nodes(row).find(n => n.type === 'strong').props.children, 'Foam floor underlay, green')
  const sku = nodes(row).find(n => n.type === 'small')
  assert.equal(sku.props.children, 'UL-FOAM-GRN'); assert.equal(sku.props.style.color, 'var(--ui-text-secondary)')
  assert.match(row.props['aria-label'], /UL-FOAM-GRN.*Foam floor underlay/)
})

test('A7 held items have no invented action, receipt quantity, or headline', () => {
  const all = selectedNodes(clarityPage(clarityData({ hold_reason: 'Synthetic hold', receipts: { '2026-11': 100 } })))
  assert.ok(textValues(all).some(t => t.includes('Synthetic hold')))
  assert.ok(!textValues(all).some(t => /^Order (by|now:)|^Includes |sells about/.test(t)))
  assert.ok(!all.some(n => n.type?.name === 'Chart'))
})

test('stock line stops at the interpolated first-month zero crossing', () => {
  const item = sampleResults().find(row => row.stock === 8269)
  assert.equal(item.monthly_demand, 14153)
  const path = stockPath(item)
  assert.equal(path.points.length, 2)
  assert.ok(Math.abs(path.crossing.month - 0.584) < 0.001)
  assert.equal(path.crossing.month, 8269 / 14153)
  assert.equal(path.crossing.label, '2026-11')
  assert.equal(path.points.at(-1).stock, 0)
  assert.ok(path.points.every(point => point.stock >= 0))
  assert.equal(item.projection[0].stock, -5884, 'plot clipping never mutates the engine projection')
})
test('stock path handles later crossings, exact zero, empty stock and no crossing', () => {
  const item = { stock: 15, projection: [{ month: '2026-11', stock: 5 }, { month: '2026-12', stock: -5 }, { month: '2027-01', stock: 20 }] }
  assert.equal(stockPath(item).crossing.month, 1.5)
  assert.equal(stockPath(item).points.length, 3, 'a delivery after running out must not restart the line')
  assert.equal(stockPath({ stock: 10, projection: [{ month: '2026-11', stock: 0 }] }).crossing.month, 1)
  assert.equal(stockPath({ ...item, stock: 0 }).crossing.month, 0)
  assert.equal(stockPath({ stock: 20, projection: [{ month: '2026-11', stock: 10 }] }).crossing, null)
})
test('urgency maps one month to danger, up to three to warning, later or none to neutral', () => {
  const asOf = '2026-10-31'
  for (const month of ['2026-09', '2026-10', '2026-11']) assert.equal(urgencyTone(month, asOf), 'bad')
  for (const month of ['2026-12', '2027-01']) assert.equal(urgencyTone(month, asOf), 'warn')
  for (const month of ['2027-02', '2027-04', null]) assert.equal(urgencyTone(month, asOf), 'muted')
  assert.equal(urgencyTone('2027-01', '2026-12-31'), 'bad')
})
test('forecast grades use the actual SDK Badge variants', () => {
  assert.equal(gradeVariant('Usable for planning'), 'success')
  assert.equal(gradeVariant('Use with care'), 'warn')
  assert.equal(gradeVariant('Too far off to plan on'), 'destructive')
  assert.equal(gradeVariant('Not enough history to check'), 'muted')
})
test('zero recent actual sales has no reliability grade, distinct from short history', () => {
  const item = { ...plain(SAMPLE.items[0]), monthly_sales: [10, 10, 10, 10, 10, 10, 10, 10, 0, 0, 0, 0] }
  const [result] = calculate([item], SAMPLE.months, SAMPLE.as_of, 6)
  assert.equal(result.grade, 'No recent sales to check')
  assert.equal(result.error_percent, null)
  assert.equal(result.check.length, 4)
  assert.equal(gradeVariant(result.grade), 'muted')
  const [short] = calculate([{ ...item, monthly_sales: [0, 0, 0] }], SAMPLE.months.slice(-3), SAMPLE.as_of, 6)
  assert.equal(short.grade, 'Not enough history to check')
})
test('axis uses k only at 10000+, retaining a useful decimal', () => {
  assert.equal(tickLabel(0), '0')
  assert.equal(tickLabel(9999), '9,999')
  assert.equal(tickLabel(10000), '10k')
  assert.equal(tickLabel(13828.1), '13.8k')
})
test('past sales stats cover the whole history, newest-first display, ties, and safe zero-baseline trends', () => {
  const sample = historyStats(SAMPLE.months, SAMPLE.items[0].monthly_sales)
  assert.equal(sample.count, 12)
  assert.equal(sample.average, 4897.5)
  assert.deepEqual(plain(sample.best), { month: '2025-11', sold: 5689 })
  assert.deepEqual(plain(sample.slowest), { month: '2026-04', sold: 3962 })
  assert.deepEqual(plain(sample.trend), { direction: 'up', percent: 3.1002869340051786 })
  const short = historyStats(SAMPLE.months.slice(-3), [0, 0, 0])
  assert.equal(short.count, 3)
  assert.equal(short.trend, null)
  assert.equal(short.average, 0)
  const zeroBaseline = historyStats(SAMPLE.months.slice(-6), [0, 0, 0, 0, 2, 2])
  assert.deepEqual(plain(zeroBaseline.trend), { direction: 'up', percent: null })
  const tied = historyStats(SAMPLE.months.slice(-6), [0, 0, 0, 0, 0, 0])
  assert.equal(tied.best.month, '2026-10')
  assert.equal(tied.slowest.month, '2026-10')
  assert.deepEqual(plain(tied.trend), { direction: 'flat', percent: 0 })
  assert.deepEqual(plain(historyStats(SAMPLE.months.slice(-6), [0, 0, 0, 0, 0, 2]).trend),
    { direction: 'up', percent: null })
})
test('chart child keys are unique by element type and history captions retain the as-of date', () => {
  const all = nodes(renderComponent('Chart', { item: sampleResults()[1], months: SAMPLE.months }))
  const svg = all.find(node => node.type === 'svg')
  const children = svg.props.children
  const keys = children.map(child => child?.key).filter(key => key != null)
  assert.equal(new Set(keys).size, keys.length)
  assert.ok(keys.some(key => String(key).startsWith('tick-')))
  assert.ok(keys.some(key => String(key).startsWith('sold-')))
  assert.ok(keys.some(key => String(key).startsWith('forecast-')))
  assert.ok(keys.some(key => String(key).startsWith('history-label-')))
  assert.ok(keys.some(key => String(key).startsWith('forecast-label-')))
  const allPage = nodes(renderComponent('Page', { ctx: { storage } }))
  assert.match(all.find(node => node.type === 'svg').props['aria-label'], /As of 31 Oct 2026/)
  assert.ok(allPage.some(node => String(node.props?.children).includes('Stock figures as of 31 Oct 2026. Ordering decisions today ')))
})
test('A3: past sales and reliability are in closed native disclosures, newest-first data retained', () => {
  const all = nodes(renderComponent('Page', { ctx: { storage } }))
  const sales = all.find(node => node.type?.name === 'DataTable' && node.props.title === 'Past sales')
  assert.ok(sales)
  assert.deepEqual(plain(sales.props.headings), ['Month', 'Sold'])
  assert.equal(sales.props.rows.length, 12)
  assert.equal(sales.props.rows[0][0], 'Oct 2026')
  assert.equal(sales.props.rows[0][1], '15,092 m')
  const details = all.find(node => node.type === 'details' && nodes(node).some(n => n.props?.children === 'Past sales (12 months)'))
  assert.ok(details)
  assert.equal(details.props.open, undefined)
  assert.ok(!nodes(details).some(node => node.props?.children === 'How good is this forecast?'))
  const quality = all.find(node => node.type === 'details' && nodes(node).some(n => String(n.props?.children).startsWith('How good is this forecast? ·')))
  assert.ok(quality); assert.equal(quality.props.open, undefined)
  assert.equal(all.filter(node => node.props?.children === 'Past inventory is rebuilt from deliveries and sales.').length, 1)
  const reliability = all.find(node => node.type?.name === 'DataTable' && node.props.title === 'Last four months')
  assert.ok(reliability)
  assert.equal(reliability.props.rows.length, 4)
})
for (const [name, receipts, rebuilt, warning] of [
  ['complete valid receipts', { '2026-08': 5, '2026-09': 10, '2026-10': 20 }, true, null],
  ['absent receipts', undefined, false, null],
  ['partial receipts', { '2026-09': 10, '2026-10': 20 }, false, null],
  ['negative receipt invalid', { '2026-08': -1, '2026-09': 10, '2026-10': 20 }, false, null],
  ['complete zero receipts', { '2026-08': 0, '2026-09': 0, '2026-10': 0 }, true, null],
  ['negative reconstruction', { '2026-08': 0, '2026-09': 100, '2026-10': 40 }, true,
    'Supply history looks incomplete before Oct 2026'],
]) {
  test(`A6 selected-page rebuilt footer: ${name}`, () => {
    const dataset = { as_of: '2026-10-31', months: ['2026-08', '2026-09', '2026-10'], items: [{
      sku: 'SYNTHETIC', name: 'Synthetic history fixture', unit: 'ea', on_hand: 5.5,
      supplier_days: null, monthly_sales: [10, 20, 30], receipts: {}, historical_receipts: receipts,
    }] }
    const page = nodes(renderComponent('Page', { ctx: { storage } }, { 1: 'csv', 2: dataset }))
    const selected = page.find(n => n.props?.['aria-label'] === 'Selected item forecast')
    assert.ok(selected)
    const chart = nodes(selected).find(n => n.type?.name === 'Chart')
    assert.ok(chart, 'item remains forecastable')
    const all = [...page, ...nodes(renderComponent('Chart', chart.props))]
    const count = text => all.filter(n => n.props?.children === text).length
    assert.equal(count('Add delivery history to see past inventory.'), rebuilt ? 0 : 2,
      'the existing chart note is repeated inside the whole-timeline disclosure')
    const warnings = all.filter(n => typeof n.props?.children === 'string'
      && n.props.children.startsWith('Supply history looks incomplete before '))
    assert.deepEqual(warnings.map(n => n.props.children), warning ? [warning, warning] : [])
    assert.equal(count('Past inventory is rebuilt from deliveries and sales.'), rebuilt ? 1 : 0)
  })
}

test('trend copy shows arrows, honest zero baseline, down direction, and nonzero fractions', () => {
  const months = SAMPLE.months.slice(-6)
  const renderTrend = sales => {
    const dataset = { as_of: SAMPLE.as_of, months, items: [{ ...plain(SAMPLE.items[0]), monthly_sales: sales }] }
    return nodes(renderComponent('Page', { ctx: { storage } }, { 1: 'csv', 2: dataset }))
      .find(node => String(node.props?.children).startsWith('Trend:'))?.props.children
  }
  assert.equal(renderTrend([0, 0, 0, 1, 1, 1]), 'Trend: ↑ Up from a zero baseline (last 3 months vs prior 3)')
  assert.equal(renderTrend([10, 10, 10, 8, 8, 8]), 'Trend: ↓ Down 20% (last 3 months vs prior 3)')
  assert.equal(renderTrend([1000, 1000, 1000, 1000, 1000, 1001]), 'Trend: ↑ Up 0.03% (last 3 months vs prior 3)')
})
test('short history shows all months and omits trend when fewer than six months are available', () => {
  const dataset = plain(SAMPLE)
  dataset.months = dataset.months.slice(-5)
  dataset.as_of = '2026-10-31'
  dataset.items = [{ ...dataset.items[0], monthly_sales: [0, 0, 0, 0, 0] }]
  const all = nodes(renderComponent('Page', { ctx: { storage } }, { 1: 'csv', 2: dataset }))
  const sales = all.find(node => node.type?.name === 'DataTable' && node.props.title === 'Past sales')
  assert.equal(sales.props.rows.length, 5)
  assert.equal(sales.props.rows[0][0], 'Oct 2026')
  assert.ok(all.some(node => String(node.props?.children).includes('Average per month (5 months): 0 units')))
  assert.ok(all.some(node => node.props?.children === 'Trend: Not enough history (6 months needed)'))
  assert.ok(!all.some(node => String(node.props?.children).match(/Trend: (Up|Down|Flat) [\d.]+%/)))
  assert.ok(all.some(node => node.type === 'Button'), 'item list remains available for short history')
})
test('held selected item keeps its existing explanation and has no fabricated past-sales view', () => {
  const dataset = plain(SAMPLE)
  dataset.items = [{ ...dataset.items[0], on_hand: -1 }]
  const all = nodes(renderComponent('Page', { ctx: { storage } }, { 1: 'csv', 2: dataset }))
  assert.ok(all.some(node => node.props?.role === 'status' && String(node.props.children).includes('non-negative')))
  assert.ok(!all.some(node => node.type?.name === 'DataTable' && node.props.title === 'Past sales'))
  assert.ok(!all.some(node => node.props?.children === 'How good is this forecast?'))
})
test('priority rows show names, dates and confidence and switch columns at pane width 720', () => {
  for (const width of [360, 390, 719, 720, 820, 1440]) {
    const tree = renderComponent('Page', { ctx: { storage } }, { 0: width })
    const all = nodes(tree)
    const grid = all.find(node => node.props?.style?.display === 'grid' && node.props?.style?.gridTemplateColumns)
    assert.equal(grid.props.style.gridTemplateColumns, width >= 720 ? '300px minmax(0, 1fr)' : 'minmax(0, 1fr)')
    const list = all.find(node => node.props?.['aria-label'] === 'Inventory items, soonest run-out first')
    const rows = nodes(list).filter(n => n.type === 'Button')
    assert.equal(rows.length, 5)
    assert.equal(rows[0].type, 'Button')
    assert.equal(rows[0].props['aria-pressed'], true)
    assert.ok(rows[0].props.style.minHeight >= 44)
    const contents = nodes(rows[0])
    assert.equal(contents.find(node => node.type === 'strong').props.children, 'Foam floor underlay, green')
    assert.ok(contents.some(node => node.props?.children === 'Runs out Nov 2026'))
    assert.match(rows[0].props['aria-label'], /Usable for planning/)
    assert.equal(contents.find(node => node.type?.name === 'StatusMark').props.bucket, 'order')
    assert.match(rows[0].props.style.borderInlineStart, /var\(--ui-red\) 60%, var\(--ui-text-primary\) 40%/)
    assert.equal(all.filter(node => node.props?.children === 'Assumes nothing is on order.').length, 1)
    assert.equal(all.find(node => node.type === 'Badge').props.variant, 'muted')
    const tables = all.filter(node => node.type?.name === 'DataTable')
    const forecastTable = tables.find(node => node.props.title === 'Month by month: stock, sales, deliveries')
    assert.deepEqual(plain(forecastTable.props.headings), ['Month', 'Sold / Forecast', 'Delivered', 'Stock at month end'])
    assert.equal(tables.find(node => node.props.title === 'Last four months').props.rows.length, 4)
    assert.ok(all.some(node => node.type === 'SegmentedControl'))
    assert.ok(all.some(node => node.type?.name === 'Horizon'))
  }
})
test('A3: Delivered column stays visible including explicit zero future deliveries', () => {
  const dataset = plain(SAMPLE)
  dataset.items[1].receipts = { '2026-11': 100 }
  const props = { ctx: { storage } }
  const headings = data => nodes(renderComponent('Page', props, { 1: 'csv', 2: data }))
    .find(node => node.type?.name === 'DataTable' && node.props.title === 'Month by month: stock, sales, deliveries').props.headings
  assert.deepEqual(plain(headings(dataset)), ['Month', 'Sold / Forecast', 'Delivered', 'Stock at month end'])
  dataset.items[1].receipts = { '2026-11': 0 }
  assert.deepEqual(plain(headings(dataset)), ['Month', 'Sold / Forecast', 'Delivered', 'Stock at month end'])
})
test('horizon controls keep a valid accessible label and the settings default persists', () => {
  let horizon
  const all = nodes(renderComponent('Horizon', { value: 6, title: 'Look ahead', onChange: value => { horizon = value } }))
  const labelNode = all.find(node => node.props?.id === 'look-ahead')
  assert.equal(labelNode.props.children, 'Look ahead')
  assert.equal(labelNode.props.style.whiteSpace, 'nowrap')
  assert.equal(all.find(node => node.type === 'SelectTrigger').props.style.maxWidth, '100%')
  assert.equal(all.find(node => node.type === 'SelectTrigger').props['aria-labelledby'], 'look-ahead')
  all.find(node => node.type === 'Select').props.onValueChange('9')
  assert.equal(horizon, 9)
  const saved = []
  const settings = nodes(renderComponent('Settings', { ctx: { storage: { ...storage, set: (...args) => saved.push(args) } } }))
  settings.find(node => node.type?.name === 'Horizon').props.onChange(9)
  assert.deepEqual(saved, [['default_horizon', 9]])
})
test('RESUME5 shim forwards each Select trigger accessible name to the native control', () => {
  const element = (type, props, ...children) => ({ type, props: { ...props, children } })
  const shim = vm.createContext({ React: { createElement: element, Children: { toArray: children => [children].flat() } },
    createContext: () => { const context = {}; context.Provider = { context }; return context },
    useContext: context => context.value })
  const code = fs.readFileSync(new URL('../docs/sdk-shim.js', import.meta.url), 'utf8')
    .replace(/^import .*$/m, '').replaceAll('export ', '')
  vm.runInContext(code + '\nglobalThis.selects = { Select, SelectTrigger, SelectContent }', shim)
  const { Select, SelectTrigger, SelectContent } = shim.selects
  for (const naming of [{ 'aria-labelledby': 'look-ahead' }, { 'aria-labelledby': 'horizon' },
    { 'aria-labelledby': 'default-forecast-horizon' }, { 'aria-label': 'Look ahead' }]) {
    let changed
    const provider = Select({ value: '6', onValueChange: value => { changed = value },
      children: [{ type: SelectTrigger, props: naming }, { type: SelectContent, props: {} }] })
    provider.type.context.value = provider.props.value
    const native = SelectContent({ children: [] })
    assert.equal(native.type, 'select')
    assert.equal(native.props['aria-labelledby'], naming['aria-labelledby'])
    assert.equal(native.props['aria-label'], naming['aria-label'])
    native.props.onChange({ target: { value: '4' } })
    assert.equal(changed, '4')
  }
})
test('table numbers are right-aligned with tabular figures; months stay left-aligned', () => {
  const all = nodes(renderComponent('DataTable', { title: 'Month by month', headings: ['Month', 'Demand', 'Stock left'], rows: [['Nov 2026', '12,571', '-4,302']] }))
  const cells = all.filter(node => ['td', 'th'].includes(node.type))
  assert.equal(cells.length, 6)
  assert.deepEqual(cells.map(node => node.props.style.textAlign), ['left', 'right', 'right', 'left', 'right', 'right'])
  assert.ok(cells.every(node => node.props.style.fontVariantNumeric === 'tabular-nums'))
})
test('chart keeps a zero baseline and stops the line there at narrow and wide sizes', () => {
  const item = sampleResults()[1]
  for (const width of [328, 360, 720, 1440]) {
    const all = nodes(renderComponent('Chart', { item, months: SAMPLE.months }, { 0: width }))
    const line = all.find(node => node.type === 'polyline')
    const points = line.props.points.split(' ').map(point => point.split(',').map(Number))
    assert.ok(points.length >= 12 + 6 + 1)
    const bottom = all.find(n => n.props?.['data-now-divider']).props.y2
    assert.equal(points.at(-1)[1], bottom)
    assert.ok(points.every(([x, y]) => x >= 0 && x <= width && y >= 30 && y <= bottom))
    const text = all.filter(node => node.type === 'text')
    assert.ok(text.some(node => node.props.children === '0'))
    assert.ok(text.some(node => node.props.children === 'Metres'))
    assert.ok(text.some(node => node.props.children === 'Runs out Nov'))
    assert.ok(text.every(node => node.props.x >= 0 && node.props.x <= width && node.props.y >= 0 && node.props.y <= all.find(n => n.type === 'svg').props.height))
    const bars = all.filter(node => node.type === 'rect')
    assert.ok(bars.every(node => Math.abs(node.props.y + node.props.height - bottom) < 1e-9 && node.props.opacity >= 0.7))
    assert.ok(!text.some(node => String(node.props.children).startsWith('Run-out:')))
  }
})
test('long history keeps every sold bar before Now at narrow widths', () => {
  const months = Array.from({ length: 150 }, (_, i) => {
    const date = new Date(Date.UTC(2014, i, 1))
    return date.toISOString().slice(0, 7)
  })
  const sales = months.map((_, i) => i + 1)
  const item = { ...sampleResults()[1], monthly_sales: sales, projection: Array.from({ length: 6 }, (_, i) => ({ month: `2027-0${i + 1}`, demand: 80, stock: 100 - i * 80 })) }
  for (const width of [360, 390]) {
    const all = nodes(renderComponent('Chart', { item, months }, { 0: width }))
    const svg = all.find(node => node.type === 'svg')
    const divider = all.find(node => node.props?.['data-now-divider']).props.x1
    const sold = all.filter(node => node.type === 'rect' && node.props['data-period'] === 'sold')
    const forecast = all.filter(node => node.type === 'rect' && node.props['data-period'] === 'forecast')
    assert.equal(sold.length, 150)
    assert.equal(forecast.length, 6)
    assert.ok(sold.every(bar => bar.props.x + bar.props.width <= divider))
    assert.ok(forecast.every(bar => bar.props.x >= divider))
    assert.ok(sold.every(bar => bar.props.width > 0 && bar.props.width <= (divider - 12) / 150))
    assert.equal(svg.props.width, '100%')
  }
})

test('embedded sample equals the complete shipped dataset, receipts are objects', () => {
  assert.deepEqual(plain(SAMPLE), JSON.parse(fs.readFileSync(new URL('../data/sample.json', import.meta.url))))
  assert.ok(SAMPLE.items.every(item => !Array.isArray(item.receipts) && typeof item.receipts === 'object'))
})
test('JS engine independently matches all five oracle rows', () => {
  const expected = [[25860,5689,'2027-04',9],[8269,14153,'2026-11',15],[1863,295,'2027-04',13],[1125,153,'2027-05',21],[548,633,'2026-11',75]]
  const result = calculate(SAMPLE.items, SAMPLE.months, SAMPLE.as_of, 12)
  assert.deepEqual(plain(result.map(x => [x.stock, x.monthly_demand, x.runout_month, x.error_percent])), expected)
  assert.equal(label('2027-04'), 'Apr 2027')
})
const csv = 'sku,name,unit,on_hand,supplier_days,2026-01,2026-02,2026-03\nA,"Sealant, clear",ea,20,,1,2,3\n'
test('CSV quoting and unknown supplier days', () => {
  const parsed = parseCsv('\uFEFF' + csv)
  assert.equal(parsed.items[0].name, 'Sealant, clear')
  assert.equal(parsed.items[0].supplier_days, null)
  assert.equal(parsed.as_of, '2026-03-31')
})
test('CSV rejects invalid values, ordering, duplicates, shape and size', () => {
  assert.throws(() => parseCsv(csv.replace('2026-01,2026-02', '2026-02,2026-01')), /chronological/)
  assert.throws(() => parseCsv(csv.replace('20,,', 'wat,,')), /number/)
  assert.throws(() => parseCsv(csv.replace('20,,', '0x10,,')), /number/)
  assert.throws(() => parseCsv(csv.replace('20,,', '-1,,')), /number/)
  assert.throws(() => parseCsv(csv.replace('2026-03', '2026-04')), /consecutive/)
  assert.throws(() => parseCsv(csv + csv.split('\n')[1] + '\n'), /duplicate/)
  assert.throws(() => parseCsv(csv.replace('1,2,3', '1,2')), /column count/)
  assert.throws(() => parseCsv('x'.repeat(2 * 1024 * 1024 + 1)), /2 MiB/)
  assert.throws(() => parseCsv(csv.split('\n')[0] + '\n' + 'A,Item,ea,20,,1,2,3\n'.repeat(10001)), /10000/)
})
test('JS linear intra-month runout and invalid receipts', () => {
  const item = { sku:'FAKE', name:'Fake', unit:'ea', on_hand:5, supplier_days:3, monthly_sales:[10,10,10], receipts:{} }
  const [result] = calculate([item], ['2026-08','2026-09','2026-10'], '2026-10-31', 6)
  assert.equal(result.runout_day, '2026-11-15')
  assert.equal(result.order_by, '2026-11-12')
  assert.equal(calculate([{...item, receipts:[]}], ['2026-08','2026-09','2026-10'], '2026-10-31', 6)[0].held, true)
})

test('browser CSV matches Python records and exact validation errors', async () => {
  const { spawnSync } = await import('node:child_process')
  const cases = [csv, csv.replace('20,,', 'wat,,'), csv.replace('20,,', '-1,,'),
    csv.replace('20,,', '1e999,,'), csv.replace('1,2,3', '1,2'),
    csv.replace('2026-03', '2026-04'), csv.replace('Sealant, clear', 'Sealant\nclear'),
    csv.replace('"Sealant, clear"', 'Seal"ant'), csv.replace('"Sealant, clear"', '"broken'),
    csv.replace('"Sealant, clear"', '"Sealant"extra')]
  const receiptCsv = csv.replace('supplier_days,', 'supplier_days,category,').replace('20,,', '20,,Sealants,').replace('2026-03\n', '2026-03,rcv:2026-01,rcv:2026-02,rcv:2026-03\n').replace('1,2,3\n', '1,2,3,0,4,0\n')
  cases.push(receiptCsv, receiptCsv.replace('rcv:2026-03', 'rcv:2026-02'), receiptCsv.replace('rcv:2026-03', 'rcv:2026-04'), receiptCsv.replace('rcv:2026-03', 'rcv:2026-13'), receiptCsv.replace(',0,4,0', ',0,-4,0'), receiptCsv.replace(',rcv:2026-03', '').replace(',0,4,0', ',0,4'), receiptCsv.replace(',0,4,0', ',0,,0'))
  const script = `import importlib.util,sys,types,json,pathlib
root=pathlib.Path.cwd()
pkg=types.ModuleType('stock_runway');pkg.__path__=[str(root)];sys.modules['stock_runway']=pkg
from stock_runway.sources import load_csv,SourceError
path=root/'.scratch'/'focus-tree-preview'/'parity.csv'
path.parent.mkdir(parents=True,exist_ok=True)
results=[]
for text in json.load(sys.stdin):
 path.write_text(text,encoding='utf-8')
 try: results.append({'data':load_csv(str(path))})
 except SourceError as exc: results.append({'error':str(exc)})
print(json.dumps(results))`
  const env = { ...process.env }; delete env.PYTHONPATH
  const py = spawnSync(process.env.PYTHON || 'python3', ['-c', script], { input: JSON.stringify(cases), encoding: 'utf8', env })
  assert.equal(py.status, 0, py.stderr)
  const browser = cases.map(text => {
    try { return { data: plain(parseCsv(text)) } } catch (error) { return { error: error.message } }
  })
  assert.deepEqual(browser, JSON.parse(py.stdout))
})

test('chart ticks are whole, readable steps', () => {
  const { niceStep } = context.helpers
  assert.equal(niceStep(6914.1), 10000)
  assert.equal(niceStep(1450), 2000)
  assert.equal(niceStep(2400), 2500)
  assert.equal(niceStep(330), 500)
})

test('negative stock reads as Out with the shortfall', () => {
  const { stockCell } = context.helpers
  assert.equal(stockCell(1200), '1,200')
  assert.equal(stockCell(0), 'Out')
  assert.equal(stockCell(-4302), 'Out (short 4,302)')
})

const { sortRows, encodeCard, decodeCard, CARD_MAX_LINE } = context.helpers
const fixture = () => ({ as_of: '2026-10-31', horizon: 6, disclosure: 'Sample data; assumes nothing is on order.', more: 0,
  rows: [{ sku: 'TEST', name: 'Sealant · مادة 😀', runout: '2026-11', grade: 'Usable for planning', stock: 5, monthly: 10, held: false }] })
const attrsOf = line => ({ data: /^::stock-runway\{data="([A-Za-z0-9_-]+)"\}$/.exec(line)[1] })
const rawAttrs = data => ({ data: Buffer.from(JSON.stringify(data)).toString('base64url') })

test('card canonical base64url round-trip preserves Unicode and has one bounded line', () => {
  const data = fixture(), line = encodeCard(data)
  assert.deepEqual(plain(decodeCard(attrsOf(line))), data)
  assert.equal(line.includes('\n'), false)
  assert.ok(line.length < CARD_MAX_LINE)
  assert.equal(Buffer.from(attrsOf(line).data, 'base64url').toString('utf8'), JSON.stringify(data))
})
test('directive rejects malformed attributes, invalid UTF-8, invalid schema and excessive size', () => {
  for (const attrs of [null, {}, [], { data: 1 }, { data: '' }, { data: '====' }, { data: 'A' },
    { data: '_w' }, { data: 'e30' }, { data: 'x'.repeat(CARD_MAX_LINE) }, { ...rawAttrs(fixture()), injected: 'x' }]) {
    assert.equal(decodeCard(attrs), null)
  }
  const variants = [
    { ...fixture(), horizon: 0 }, { ...fixture(), horizon: true }, { ...fixture(), horizon: 1.5 },
    { ...fixture(), as_of: '2026-02-30' }, { ...fixture(), as_of: '2026-10-30' },
    { ...fixture(), more: -1 }, { ...fixture(), more: 1.5 }, { ...fixture(), more: true },
    { ...fixture(), disclosure: 'x'.repeat(513) }, { ...fixture(), unexpected: 1 },
    { ...fixture(), rows: Array(51).fill(fixture().rows[0]) },
    { ...fixture(), rows: Array(2).fill(fixture().rows[0]) },
    ...[{ stock: -1 }, { monthly: null }, { held: 'false' }, { grade: 'Excellent' },
      { runout: '2026-10' }, { runout: '2027-05' }, { runout: '2026-13' }, { name: '' },
      { sku: 'x'.repeat(121) }, { held: true }, { extra: 1 }]
      .map(change => ({ ...fixture(), rows: [{ ...fixture().rows[0], ...change }] })),
  ]
  for (const data of variants) assert.equal(decodeCard(rawAttrs(data)), null, JSON.stringify(data))
  assert.throws(() => encodeCard(variants[0]), /Invalid/)
})
test('row order is soonest first, then beyond horizon, with held items always last', () => {
  const rows = [{ sku: 'held', runout: null, held: true }, { sku: 'beyond', runout: null, held: false },
    { sku: 'later', runout: '2027-02', held: false }, { sku: 'soon', runout: '2026-11', held: false }]
  assert.deepEqual(plain(sortRows(rows).map(row => row.sku)), ['soon', 'later', 'beyond', 'held'])
  assert.equal(rows[0].sku, 'held', 'sorting does not mutate its input')
})

// Execute the real harness SDK shim, not a separate invented registration API.
function registered() {
  const element = (type, props) => ({ type, props })
  const ui = vm.createContext({ TextEncoder, TextDecoder, atob, btoa, Component: class {},
    React: { createElement: element }, createContext: value => ({ value }),
    useSyncExternalStore: (_, get) => get(), useContext: value => value.value,
    jsx: element, jsxs: element, useEffect: () => {}, useRef: () => ({ current: null }),
    useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}], useMemo: callback => callback(),
    effects: [],

  })
  ui.useEffect = effect => ui.effects.push(effect)
  const shim = fs.readFileSync(new URL('../docs/sdk-shim.js', import.meta.url), 'utf8').replace(/^import .*\n/m, '').replaceAll('export ', '')
  vm.runInContext(shim, ui)
  vm.runInContext(source.slice(source.indexOf('const SAMPLE =')).replace('export default', 'globalThis.plugin =').replaceAll('export ', '')
    + '\nglobalThis.sdk = { createHarnessContext, PALETTE_AREA, KEYBINDS_AREA, TRANSCRIPT_DIRECTIVE_AREA }; globalThis.quickData = quickData', ui)
  const values = new Map()
  const ctx = ui.sdk.createHarnessContext({ get: (key, fallback) => values.has(key) ? values.get(key) : fallback,
    set: (key, value) => values.set(key, value), remove: key => values.delete(key) })
  ui.plugin.register(ctx)
  return { ui, ctx, values }
}
test('SDK shim receives palette, rebindable shortcut, shell host and validated directive registrations', () => {
  const { ui, ctx } = registered()
  const palette = ctx.entries.find(e => e.area === ui.sdk.PALETTE_AREA && e.data.id === 'stock-runway.quick-view')
  const keybind = ctx.entries.find(e => e.area === ui.sdk.KEYBINDS_AREA)
  const hostEntry = ctx.entries.find(e => e.area === 'titleBar.center')
  const directive = ctx.entries.find(e => e.area === ui.sdk.TRANSCRIPT_DIRECTIVE_AREA)
  assert.equal(palette.data.label, 'Stock Runway: quick view')
  assert.deepEqual(plain(palette.data.keywords), ['stock', 'inventory', 'runway'])
  assert.deepEqual(plain(keybind.data.defaults), ['mod+shift+i'])
  assert.equal(keybind.data.id, palette.data.id)
  assert.equal(keybind.data.category, 'view')
  const boundary = hostEntry.render()
  assert.equal(boundary.type.name, 'RecoveryBoundary')
  const view = boundary.props.children
  assert.equal(view.props.model.state.get().open, false)
  view.type(view.props)
  const cleanup = ui.effects.pop()()
  palette.data.run()
  assert.equal(view.props.model.state.get().open, true)
  assert.equal(view.props.model.state.get().data.rows.length, 5)
  view.props.model.state.set({ open: false, data: null })
  keybind.data.run()
  assert.equal(view.props.model.state.get().open, true)
  assert.equal(directive.data.name, 'stock-runway')
  assert.equal(directive.data.render({ attrs: { data: 'garbage' } }), null)
  assert.equal(directive.data.render({ attrs: attrsOf(encodeCard(fixture())) }).type.name, 'RunwayTable')
  const popup = view.type(view.props)
  const dialog = nodes(popup).find(node => node.type.name === 'Dialog')
  assert.equal(dialog.props.open, true)
  const popupTable = nodes(popup).find(node => node.type.name === 'RunwayTable')
  assert.equal(popupTable.type, directive.data.render({ attrs: attrsOf(encodeCard(fixture())) }).type)
  dialog.props.onOpenChange(false)
  assert.equal(view.props.model.state.get().open, false)
  const full = nodes(popup).find(node => node.props?.children === 'Open full page')
  assert.equal(typeof full.props.onClick, 'function')
  keybind.data.run()
  cleanup()
  assert.equal(view.props.model.state.get().open, false, 'unmount clears stale open state')
  keybind.data.run()
  assert.equal(view.props.model.state.get().open, false, 'unmounted host refuses deferred opening')
  view.type(view.props)
  ui.effects.pop()()
  assert.equal(view.props.model.state.get().open, false, 'remount does not reopen stale popup')
})
test('quick view uses the persisted CSV, source and selected horizon without mounting the route', () => {
  const { ui, ctx, values } = registered()
  values.set('source', 'csv'); values.set('csv_data', plain(parseCsv(csv))); values.set('last_horizon', 3)
  const data = ui.quickData(ctx)
  assert.equal(data.rows.length, 1)
  assert.equal(data.rows[0].sku, 'A')
  assert.equal(data.horizon, 3)
  assert.ok(data.disclosure.startsWith('Local CSV'))
  const local = plain(parseCsv(csv))
  local.items = [{ ...local.items[0], sku: 'LATE', on_hand: 2 }, { ...local.items[0], sku: 'EARLY', on_hand: 1 }]
  values.set('csv_data', local)
  assert.deepEqual(plain(ui.quickData(ctx).rows.map(row => row.sku)), ['EARLY', 'LATE'])
  values.set('csv_data', null)
  assert.equal(ui.quickData(ctx), null, 'never silently substitutes sample for missing CSV')
})
test('page source and CSV persistence feeds the popup, with no network upload', async () => {
  const { ctx, ui, values } = registered()
  const boundary = ctx.entries.find(e => e.area === 'routes').render()
  assert.equal(boundary.type.name, 'RecoveryBoundary')
  const page = boundary.props.children
  const tree = page.type(page.props)
  const sourceControl = nodes(tree).find(node => node.type?.name === 'SegmentedControl')
  sourceControl.props.onChange('csv')
  assert.equal(values.get('source'), 'csv')
  // Re-render after selecting CSV, then load a file through the real async handler.
  const csvTree = page.type(page.props)
  const file = nodes(csvTree).find(node => node.type === 'input')
  await file.props.onChange({ target: { files: [{ size: csv.length, text: async () => csv }] } })
  assert.equal(ui.quickData(ctx).rows[0].sku, 'A')
  const horizon = nodes(csvTree).find(node => node.type?.name === 'Horizon')
  horizon.props.onChange(4)
  assert.equal(ui.quickData(ctx).horizon, 4)
})
test('card caps the entire line at 1900 and retains a sorted prefix with more count', () => {
  const data = fixture()
  data.rows = Array.from({ length: 40 }, (_, i) => ({ ...data.rows[0], sku: String(i), runout: i ? '2027-01' : '2026-11' }))
  const line = encodeCard(data), decoded = decodeCard(attrsOf(line))
  assert.equal(CARD_MAX_LINE, 1900)
  assert.ok(line.length <= 1900)
  assert.ok(decoded.rows.length > 0 && decoded.rows.length < 40)
  assert.equal(decoded.more, 40 - decoded.rows.length)
  const held = { ...data.rows[0], sku: 'HELD', held: true, runout: null, stock: null, monthly: null, grade: 'Check item data' }
  const withHeld = decodeCard(attrsOf(encodeCard({ ...data, rows: [held, ...data.rows] })))
  assert.ok(withHeld.rows.every(row => !row.held), 'held row is dropped before earlier run-outs')
  assert.equal(withHeld.more, 41 - withHeld.rows.length)
  assert.deepEqual(plain(decoded.rows), data.rows.slice(0, decoded.rows.length))
})
test('bad Unicode is omitted, never repaired into a different card', () => {
  for (const field of ['sku', 'name', 'disclosure']) {
    const data = fixture()
    if (field === 'disclosure') data.disclosure = '\ud800'
    else data.rows[0][field] = '\udfff'
    assert.equal(encodeCard(data), null)
    assert.equal(decodeCard(rawAttrs(data)), null)
  }
})
test('whitespace-only ids skip only that row and increase more', () => {
  const data = fixture()
  data.rows.push({ ...data.rows[0], sku: '   ' })
  const decoded = decodeCard(rawAttrs(data))
  assert.deepEqual(plain(decoded.rows), data.rows.slice(0, 1))
  assert.equal(decoded.more, 1)
})
test('popup ties within one month sort by run-out day', () => {
  const rows = [{ sku: 'late', held: false, runout: '2026-11', runout_day: '2026-11-25' },
    { sku: 'early', held: false, runout: '2026-11', runout_day: '2026-11-02' }]
  assert.deepEqual(plain(sortRows(rows).map(row => row.sku)), ['early', 'late'])
})
test('shared card table exposes a full-page omission count', () => {
  const { ctx } = registered()
  const directive = ctx.entries.find(e => e.area === 'transcriptDirectives')
  const view = directive.data.render({ attrs: rawAttrs({ ...fixture(), more: 7 }) })
  const tree = view.type(view.props)
  assert.ok(nodes(tree).some(node => node.props?.children === '+7 more, open full page'))
})
test('quick-view dialog shows the omission count as text, not a second full-page button', () => {
  const view = renderComponent('RunwayTable', { data: { ...fixture(), more: 7 }, moreAsText: true })
  const all = nodes(view)
  assert.ok(all.some(node => node.props?.children === '+7 more on the full page' && node.type === 'p'))
  assert.ok(!all.some(node => node.props?.children === '+7 more, open full page'))
})

// UI acceptance stays separate from the numerical oracle and strict card schema.
test('selected aluminium keeps its oracle values, units and all twelve months', () => {
  const all = nodes(renderComponent('Page', { ctx: { storage } }, { 0: 820, 3: 12, 4: 'TRM-ALU-25' }))
  assert.ok(all.some(n => n.type === 'h2' && n.props.children === 'Aluminium edge trim · SKU TRM-ALU-25'))
  assert.ok(all.some(n => n.props?.role === 'status' && /^(Order |Out of stock — Order |No order needed —)/.test(n.props.children)))
  assert.ok(all.some(n => n.props?.children === '1,125 m left · sells about 153 m a month'))
  const table = all.find(n => n.type?.name === 'DataTable' && n.props.title === 'Month by month: stock, sales, deliveries')
  assert.equal(table.props.rows.length, 12 + 1 + 12)
  assert.equal(table.props.rowStates[12], 'now')
  assert.deepEqual(plain(table.props.rowStates.slice(-12)), [...Array(6).fill(''), 'first-out', ...Array(5).fill('out')])
  assert.deepEqual(plain(table.props.rows[17]), ['Mar 2027 · Forecast', '112 m', '0 m', '340 m'])
  assert.equal(table.props.rows.at(-1)[3], 'Out of stock · short 1,468 m')
  assert.ok(all.some(n => n.type === 'details' && nodes(n).some(c => c.props?.children === 'How the forecast works')))
})
test('depletion row is distinguished by text and a strong rule, with no red later-date blanket', () => {
  const all = nodes(renderComponent('DataTable', { title: 'Month by month', headings: ['Month', 'Demand', 'Stock left'],
    rows: [['Mar 2027 · First depletion', '229 m', 'Out · short 20 m'], ['Apr 2027', '229 m', 'Out · short 249 m']], rowStates: ['first-out', 'out'] }))
  const rows = all.filter(n => n.type === 'tr').slice(1)
  assert.match(rows[0].props.style.borderTop, /2px/)
  assert.ok(all.find(n => n.type === 'table').props.style.maxWidth <= 760)
  const page = nodes(renderComponent('Page', { ctx: { storage } }, { 4: 'TRM-ALU-25' }))
  assert.ok(page.filter(n => n.type === 'Badge').every(n => n.props.variant === 'muted'))
})
test('chart separates every historical sale and horizon forecast around Now, with rebuilt historical inventory and paired supply bars', () => {
  const item = calculate(SAMPLE.items, SAMPLE.months, SAMPLE.as_of, 12)[3]
  for (const width of [328, 360, 390, 1440]) {
    const all = nodes(renderComponent('Chart', { item, months: SAMPLE.months }, { 0: width }))
    const bars = all.filter(n => n.type === 'rect' && n.props['data-period'] !== 'supply')
    assert.equal(all.filter(n => n.props?.['data-period'] === 'supply').length, bars.length)
    assert.equal(bars.length, item.monthly_sales.length + item.projection.length)
    assert.ok(bars.slice(0, item.monthly_sales.length).every(n => n.props['data-period'] === 'sold' && n.props.fill === 'var(--ui-blue)'))
    assert.ok(bars.slice(item.monthly_sales.length).every(n => n.props['data-period'] === 'forecast' && n.props.fill === 'var(--ui-bg-secondary)' && n.props.stroke))
    const divider = all.find(n => n.props?.['data-now-divider'] === true)
    assert.ok(divider)
    assert.ok(bars.slice(0, item.monthly_sales.length).every(n => n.props.x + n.props.width <= divider.props.x1))
    assert.ok(bars.slice(item.monthly_sales.length).every(n => n.props.x >= divider.props.x1))
    const maxTick = Math.max(...all.filter(n => n.type === 'text' && n.props.textAnchor === 'end' && /^[\d,]+(?:\.\d+)?k?$/.test(String(n.props.children))).map(n => {
      const text = String(n.props.children).replaceAll(',', '')
      return Number(text.replace(/k$/, '')) * (text.endsWith('k') ? 1000 : 1)
    }))
    assert.ok(maxTick >= Math.max(...item.monthly_sales), 'historical peak is included in the chart scale')
    assert.equal(all.find(n => n.type === 'polyline').props.stroke, 'var(--ui-text-primary)')
    const points = all.find(n => n.type === 'polyline').props.points.split(' ').map(p => Number(p.split(',')[0]))
    assert.ok(points[0] < divider.props.x1, 'complete receipts rebuild the past line')
    assert.ok(all.find(n => n.props?.role === 'img').props['aria-label'].includes('past sold'))
    assert.ok(all.some(n => n.type === 'line' && n.props.strokeWidth >= 1.5))
    assert.ok(all.some(n => String(n.props?.children).includes('Stock on hand')))
    assert.ok(all.some(n => String(n.props?.children).includes('Past demand')))
    assert.ok(all.some(n => String(n.props?.children).includes('Forecast')))
    assert.ok(all.some(n => String(n.props?.children).includes('Now')))
    assert.match(all.find(n => n.type === 'svg').props['aria-label'], /As of 31 Oct 2026/)
  }
})

test('aluminium low-range chart keeps the established whole tick sequence and foam k scale parses', () => {
  const rows = calculate(SAMPLE.items, SAMPLE.months, SAMPLE.as_of, 12)
  const ticks = item => nodes(renderComponent('Chart', { item, months: SAMPLE.months }, { 0: 360 }))
    .filter(node => node.type === 'text' && node.props.textAnchor === 'end' && /^[\d,]+(?:\.\d+)?k?$/.test(String(node.props.children))).map(node => String(node.props.children))
  assert.deepEqual(ticks(rows[3]), ['0', '500', '1,000', '1,500', '2,000'])
  assert.ok(Math.max(...ticks(rows[1]).map(text => {
    const value = text.replaceAll(',', '')
    return Number(value.replace(/k$/, '')) * (value.endsWith('k') ? 1000 : 1)
  })) >= 15092)
})

test('selected product rows use a semantic status accent and themed surface', () => {
  const all = nodes(renderComponent('Page', { ctx: { storage } }, { 0: 390, 4: 'TRM-ALU-25' }))
  const list = all.find(n => n.props?.['aria-label'] === 'Inventory items, soonest run-out first')
  const rows = nodes(list).filter(n => n.type === 'Button')
  assert.equal(rows.filter(n => n.props['aria-pressed']).length, 1)
  const selected = rows.find(n => n.props['aria-pressed'])
  const unselected = rows.find(n => !n.props['aria-pressed'])
  assert.notEqual(selected.props.style.background, unselected.props.style.background)
  assert.notEqual(selected.props.style.boxShadow, unselected.props.style.boxShadow)
  assert.match(selected.props.style.boxShadow, /2px var\(--ui-text-primary\)/)
  assert.match(rows.find(n => n.props['aria-pressed']).props.style.borderInlineStart, /--ui-(red|orange|green|blue|text-secondary)/)
  assert.ok(rows.every(n => !Object.hasOwn(n.props.style, 'outline')))
})
test('deliveries and backtest quantities keep units; only the first depletion is named first', () => {
  const dataset = plain(SAMPLE)
  dataset.items = [{ ...dataset.items[0], sku: 'RECEIPT', unit: 'm²', on_hand: 0, monthly_sales: Array(12).fill(10), receipts: { '2026-12': 25 } }]
  const all = nodes(renderComponent('Page', { ctx: { storage } }, { 1: 'csv', 2: dataset, 3: 4 }))
  const tables = all.filter(n => n.type?.name === 'DataTable')
  const forecast = tables.find(n => n.props.title === 'Month by month: stock, sales, deliveries')
  assert.deepEqual(plain(forecast.props.rowStates.slice(-4)), ['first-out', '', 'out', 'out'])
  assert.deepEqual(plain(forecast.props.rows.at(-3)), ['Dec 2026 · Forecast', '10 m²', '+25 m²', '5 m²'])
  assert.ok(tables.find(n => n.props.title === 'Last four months').props.rows.every(row => row[1].endsWith(' m²') && row[2].endsWith(' m²')))
  assert.equal(all.filter(n => n.props?.children === 'Includes 25 m² on order').length, 1)
  assert.ok(!all.some(n => n.props?.children === 'Assumes nothing is on order.'))
  assert.ok(all.some(n => String(n.props?.children).includes('Already depleted')))
})

test('A8 month-by-month table follows the selected horizon and shows the whole timeline with Now separator', () => {
  for (const horizon of [2, 6]) {
  const all = nodes(renderComponent('Page', { ctx: { storage } }, { 3: horizon, 4: 'UL-FOAM-GRN' }))
  const detail = selectedNodes(all)
  const table = detail.find(n => n.type?.name === 'DataTable' && n.props.title === 'Month by month: stock, sales, deliveries')
  const item = calculate(SAMPLE.items, SAMPLE.months, SAMPLE.as_of, horizon).find(row => row.sku === 'UL-FOAM-GRN')
  const history = inventoryHistory(item, SAMPLE.months)
  const quantity = value => `${value.toLocaleString('en-US', { maximumFractionDigits: 1 })} m`
  assert.deepEqual(plain(table.props.headings), ['Month', 'Sold / Forecast', 'Delivered', 'Stock at month end'])
  assert.equal(table.props.rows.length, 12 + 1 + horizon)
  const expectedHistory = SAMPLE.months.map((month, i) => [label(month), quantity(item.monthly_sales[i]), `${history.rows[i].delivered > 0 ? '+' : ''}${quantity(history.rows[i].delivered)}`,
    history.rows[i].raw_stock > 0 ? `Reconstructed ${quantity(history.rows[i].stock)}` : `Out of stock · Reconstructed ${quantity(history.rows[i].stock)}`])
  const expectedFuture = item.projection.map(row => [label(row.month) + ' · Forecast', quantity(row.demand), `${row.receipts > 0 ? '+' : ''}${quantity(row.receipts)}`,
    row.stock > 0 ? quantity(row.stock) : row.stock === 0 ? 'Out of stock · 0 m' : `Out of stock · short ${quantity(-row.stock)}`])
  assert.deepEqual(plain(table.props.rows), [...expectedHistory, ['Now', '', '', '8,269 m'], ...expectedFuture])
  assert.deepEqual(plain(table.props.rowStates), Array(12).fill('history').concat(['now', 'first-out', ...Array(horizon - 1).fill('out')]))
  }
})

test('A12 timeline auto-sizes maximum quantities and retains exact accessible compact values', () => {
  const data = clarityData({on_hand: 1e12, monthly_sales: [1e12, 1e12, 1e12],
    historical_receipts: {'2026-08': 1e12, '2026-09': 1e12, '2026-10': 1e12}})
  const timeline = selectedNodes(clarityPage(data)).find(n => n.type?.name === 'DataTable' && n.props.wrapColumns)
  assert.equal(timeline.props.rows.length, 10, 'three history + Now + six forecast')
  assert.equal(timeline.props.rows.at(-1).at(-1), 'Out of stock · short 5,000,000,000,000 m')
  const rendered = nodes(renderComponent('DataTable', timeline.props))
  assert.equal(rendered.find(n => n.type === 'table').props.style.tableLayout, 'auto')
  assert.ok(!rendered.some(n => n.type === 'colgroup' || n.type === 'col'), 'no fixed column widths')
  const css = rendered.find(n => n.type === 'style').props.children
  assert.doesNotMatch(css, /(?:^|[;{])\s*(?:min-width|width):\s*\d+px/m)
  const compactCells = rendered.filter(n => n.type === 'td' && n.props.title)
  assert.ok(compactCells.length >= 15)
  for (const cell of compactCells) {
    assert.equal(cell.props['aria-label'], cell.props.title)
    const content = nodes(cell)
    assert.equal(content.find(n => n.props?.className === 'runway-value-full').props.children, cell.props.title)
    assert.match(content.find(n => n.props?.className === 'runway-value-compact').props.children, /[1-5]e12/)
  }
  assert.ok(compactCells.some(n => n.props.title === '1,000,000,000,000 m'))
  assert.ok(compactCells.some(n => n.props.title === 'Out of stock · short 5,000,000,000,000 m'))
  const other = nodes(renderComponent('DataTable', {title:'Other', headings:['Stock'], rows:[['1,000,000,000,000 m']]}))
  assert.ok(!other.some(n => n.props?.className?.startsWith('runway-value-')))
  assert.equal(other.find(n => n.type === 'table').props.style.tableLayout, undefined)
})

test('A11 timeline scrolls natively with sticky Month and unbroken numeric tokens', () => {
  const detail = selectedNodes(clarityPage(fractionalData(), { 4: 'L' }))
  const timeline = detail.find(n => n.type?.name === 'DataTable' && n.props.title === 'Month by month: stock, sales, deliveries')
  const rendered = nodes(renderComponent('DataTable', timeline.props))
  const region = rendered.find(n => n.props?.role === 'region')
  assert.equal(region.props.style.overflowX, 'auto')
  assert.equal(region.props.tabIndex, 0)
  assert.ok(rendered.some(n => n.props?.['data-table-scroll-cue']))
  const cells = rendered.filter(n => ['th', 'td'].includes(n.type))
  assert.ok(cells.length > 40)
  for (const cell of cells) {
    // Polish: short values ('+30,000 m') stay on one line; month labels and long values may wrap at spaces only.
    assert.ok(['normal', 'nowrap'].includes(cell.props.style.whiteSpace))
    if (cell.type === 'th') assert.equal(cell.props.style.whiteSpace, 'normal')
    assert.equal(cell.props.style.overflowWrap, 'normal')
    assert.equal(cell.props.style.wordBreak, 'normal')
    assert.equal(cell.props.style.fontVariantNumeric, 'tabular-nums')
  }
  const monthCells = cells.filter(n => n.type === 'th')
  for (const cell of monthCells.filter(n => n.props.scope === 'row' || n.props.children === 'Month')) {
    assert.equal(cell.props.style.position, 'sticky')
    assert.equal(cell.props.style.left, 0)
    assert.equal(cell.props.style.background, 'var(--ui-bg-secondary)')
  }
  const month = monthCells.find(n => n.props['aria-label'] === 'Aug 2026')
  assert.ok(month, 'full accessible month preserved')
  const now = rendered.find(n => n.props?.['data-now-separator'])
  assert.equal(now.props.children[0].props.colSpan, 1)
  assert.equal(now.props.children.at(-1).props.children, '0.7 l')
  const other = nodes(renderComponent('DataTable', {title:'Other table', headings:['Item','Stock'], rows:[['Liquid','0.7 l']]}))
  assert.equal(other.find(n => n.type === 'td').props.style.whiteSpace, 'nowrap')
  assert.notEqual(other.find(n => n.type === 'table').props.style.tableLayout, 'fixed')
  assert.ok(!other.some(n => n.props?.['data-table-scroll-cue']))
  // Exercise the browser assertion itself: inside-cell glyphs must still fail
  // when a comma/decimal number is fragmented. This is synthetic, not browser proof.
  const capture = fs.readFileSync(new URL('../docs/capture-inventory.cjs', import.meta.url), 'utf8')
  const checkNumbers = vm.runInNewContext(capture.slice(capture.indexOf('function assertTimelineNumberTokens'), capture.indexOf('async function checkTimelineText')) + '\nassertTimelineNumberTokens', { assert })
  for (const text of ['14,153', '30,000', '0.7', '67,157', '2026', '1,000,000,000,000', '5e12', '-1.25e12']) {
    const cell = { text, tokens: [{ text, glyphs: [...text].map(text => ({text,width:7,height:15,top:20})) }] }
    checkNumbers(cell)
    cell.tokens[0].glyphs.at(-1).top = 36
    assert.throws(() => checkNumbers(cell), /numeric token split across lines/)
    cell.tokens[0].glyphs.at(-1).top = 20
    cell.tokens[0].glyphs.pop()
    assert.throws(() => checkNumbers(cell), /every digit and separator present/)
  }
})

test('A8 missing or partial delivery history keeps sales visible and stock and deliveries unknown', () => {
  for (const receipts of [undefined, { '2026-08': 0, '2026-09': 0 }]) {
    const data = clarityData({ historical_receipts: receipts, monthly_sales: [0, 10, 20], on_hand: 0 })
    const all = selectedNodes(clarityPage(data))
    const table = all.find(n => n.type?.name === 'DataTable' && n.props.title === 'Month by month: stock, sales, deliveries')
    assert.deepEqual(plain(table.props.rows.slice(0, 3)), [
      ['Aug 2026', '0 m', 'Unknown', 'Unknown'],
      ['Sep 2026', '10 m', 'Unknown', 'Unknown'],
      ['Oct 2026', '20 m', 'Unknown', 'Unknown'],
    ])
    assert.ok(all.some(n => n.props?.children === 'Add delivery history to see past inventory.'))
    assert.deepEqual(plain(table.props.rows.slice(4).map(r => r[1])), ['10 m', '10 m', '10 m', '10 m', '10 m', '10 m'])
    assert.ok(all.some(n => n.type?.name === 'Chart')) // forecast projection remains present
  }
})

test('A8 raw-negative reconstructed history and zero stock are named without claiming unmet demand', () => {
  const all = selectedNodes(clarityPage(clarityData({ on_hand: 0, monthly_sales: [50, 10, 0], historical_receipts: { '2026-08': 0, '2026-09': 100, '2026-10': 0 } })))
  const table = all.find(n => n.type?.name === 'DataTable' && n.props.title === 'Month by month: stock, sales, deliveries')
  assert.match(table.props.rows[0][3], /Reconstructed raw negative stock/)
  assert.match(table.props.rows[2][3], /Out of stock/)
  assert.ok(all.some(n => n.props?.children === 'Supply history looks incomplete before Sep 2026'))
  assert.ok(!table.props.rows.slice(0, 3).some(r => /unmet demand/i.test(r[3])))
})

test('A8 chart accessibility summary points to the whole-timeline table and reports unknown or incomplete history', () => {
  for (const [history, status] of [[{ '2026-09': 0, '2026-10': 0 }, 'incomplete|unknown'], [undefined, 'incomplete|unknown']]) {
    const item = calculate(clarityData({ historical_receipts: history }).items, ['2026-08', '2026-09', '2026-10'], '2026-10-31', 2)[0]
    const all = nodes(renderComponent('Chart', { item, months: ['2026-08', '2026-09', '2026-10'] }))
    assert.match(all.find(n => n.type === 'svg').props['aria-label'], /Month by month: stock, sales, deliveries table below/)
    assert.match(all.find(n => n.type === 'svg').props['aria-label'], new RegExp(status, 'i'))
  }
})

test('disclosure remains keyboard-accessible and source errors and empty states stay semantic', () => {
  const all = nodes(renderComponent('Page', { ctx: { storage } }))
  const disclosure = all.find(n => n.type === 'details' && nodes(n).some(c => c.props?.children === 'How the forecast works'))
  assert.ok(!disclosure.props.open, 'occasional details start closed')
  assert.equal(disclosure.props.children[0].type, 'summary')
  assert.ok(nodes(disclosure).some(n => String(n.props?.children).includes('cumulative unmet demand')))
  const empty = nodes(renderComponent('Page', { ctx: { storage } }, { 1: 'csv', 2: null, 5: 'Could not read CSV' }))
  assert.ok(empty.some(n => n.props?.role === 'alert' && n.props.children === 'Could not read CSV'))
  assert.ok(empty.some(n => n.type === 'EmptyState'))
  const dataset = plain(SAMPLE)
  dataset.items[1].on_hand = -1
  const held = nodes(renderComponent('Page', { ctx: { storage } }, { 1: 'csv', 2: dataset, 4: dataset.items[1].sku }))
  assert.ok(held.some(n => n.props?.role === 'status' && String(n.props.children).includes('non-negative')))
  assert.ok(!held.some(n => n.type?.name === 'Chart'))
})
test('every priority date has plain urgency and every confidence uses neutral presentation', () => {
  const all = nodes(renderComponent('Page', { ctx: { storage } }, { 0: 1440 }))
  assert.ok(all.some(n => n.props?.children === 'Runs out Nov 2026'))
  assert.ok(all.some(n => n.props?.children === 'Runs out May 2027'))
  const { ctx } = registered()
  const view = ctx.entries.find(e => e.area === 'transcriptDirectives').data.render({ attrs: rawAttrs(fixture()) })
  assert.ok(nodes(view.type(view.props)).filter(n => n.type?.name === 'Badge').every(n => n.props.variant === 'muted'))
})

test('zero stock chart says Out now and never plots negative inventory', () => {
  const item = { ...sampleResults()[0], stock: 0, on_hand: 0 }
  const all = nodes(renderComponent('Chart', { item, months: SAMPLE.months }, { 0: 390 }))
  assert.ok(all.some(n => n.props?.children === 'Out now'))
  assert.ok(all.find(n => n.type === 'polyline').props.points.split(' ').every(p => Number(p.split(',')[1]) <= all.find(n => n.props?.['data-now-divider']).props.y2))
})

test('A4 rebuild preserves raw negatives, anchors fractional on_hand and distinguishes missing from zero receipts', () => {
  const months = ['2026-08', '2026-09', '2026-10']
  const item = { ...plain(SAMPLE.items[0]), on_hand: 5.5, monthly_sales: [10,20,30], historical_receipts: undefined }
  assert.deepEqual(plain(inventoryHistory(item, months)), { rows: [], warning: 'Add delivery history to see past inventory.' })
  item.historical_receipts = { '2026-08':0, '2026-09':100, '2026-10':40 }
  const result = inventoryHistory(item, months)
  assert.deepEqual(plain(result.rows.map(r=>r.raw_stock)), [-84.5,-4.5,5.5])
  assert.deepEqual(plain(result.rows.map(r=>r.stock)), [0,0,5.5])
  assert.equal(result.warning, 'Supply history looks incomplete before Oct 2026')
  const computed = calculate([item],months,'2026-10-31',6)[0]
  const baseline = calculate([{...item,historical_receipts:undefined}],months,'2026-10-31',6)[0]
  for (const key of ['projection','monthly_demand','stock','runout_day','grade']) assert.deepEqual(plain(computed[key]),plain(baseline[key]))
  const chart = nodes(renderComponent('Chart',{item:computed, months}))
  assert.equal(chart.filter(n=>n.props?.children===result.warning).length,1)
  item.historical_receipts = Object.fromEntries(months.map(m=>[m,0]))
  assert.deepEqual(plain(inventoryHistory(item,months).rows.map(r=>r.raw_stock)),[55.5,35.5,5.5])
  delete item.historical_receipts['2026-08']
  assert.equal(inventoryHistory(item,months).rows.length,0)
})

test('A4 absent receipts suppress past line; future deliveries and recovery use only actual projection', () => {
  const item = {...sampleResults()[1], historical_receipts:undefined}
  const all = nodes(renderComponent('Chart',{item, months:SAMPLE.months},{0:390}))
  const now = all.find(n=>n.props?.['data-now-divider']).props.x1
  assert.equal(Number(all.find(n=>n.type==='polyline').props.points.split(',')[0]),now)
  assert.equal(all.filter(n=>n.props?.children==='Add delivery history to see past inventory.').length,1)
  const fixture = {...plain(SAMPLE.items[1]), on_hand:0, monthly_sales:Array(12).fill(10), receipts:{'2026-12':25}}
  const calculated = calculate([fixture],SAMPLE.months,SAMPLE.as_of,4)[0]
  const recovery = nodes(renderComponent('Chart',{item:calculated,months:SAMPLE.months}))
  const supply = recovery.filter(n=>n.props?.['data-period']==='supply').slice(12)
  assert.deepEqual(supply.map(n=>n.props['data-value']),[0,25,0,0])
  const line = recovery.find(n=>n.type==='polyline').props.points.split(' ').map(p=>p.split(',').map(Number))
  const bottom = recovery.find(n=>n.props?.['data-now-divider']).props.y2
  assert.ok(line.at(-3)[1] < bottom, 'confirmed December receipt recovers positive projected inventory')
})

test('A4 month-end points sit on full-month boundaries and desktop plot is two to one', () => {
  const item = sampleResults()[1]
  const all = nodes(renderComponent('Chart',{item,months:SAMPLE.months},{0:1100}))
  const bars = all.filter(n=>n.props?.['data-period']==='supply')
  const points = all.find(n=>n.type==='polyline').props.points.split(' ').map(p=>p.split(',').map(Number))
  const divider = all.find(n=>n.props?.['data-now-divider']).props
  const grid = all.find(n=>n.type==='line' && n.props.stroke==='var(--ui-stroke-secondary)').props
  assert.equal((grid.x2-grid.x1)/(divider.y2-divider.y1),2)
  const slot = (grid.x2-grid.x1)/bars.length
  for(let i=0;i<12;i++) assert.ok(Math.abs(points[i][0]-(grid.x1+(i+1)*slot))<1e-9)
  for(let i=12;i<bars.length;i++) assert.ok(points.some(p=>Math.abs(p[0]-(grid.x1+(i+1)*slot))<1e-9))
  assert.equal(points[11][0],divider.x1)
  assert.equal(points.filter(p=>p[0]===divider.x1).length,1, 'latest history is Now, no duplicate plateau')
  const demand = all.filter(n=>['sold','forecast'].includes(n.props?.['data-period']))
  for(let i=0;i<bars.length;i++) {
    assert.ok(demand[i].props.x >= grid.x1+i*slot)
    assert.ok(demand[i].props.x+demand[i].props.width <= bars[i].props.x+1e-9)
    assert.ok(bars[i].props.x+bars[i].props.width <= grid.x1+(i+1)*slot)
  }
  const crossing = all.find(n=>n.props?.['data-runout']).props.cx
  assert.ok(Math.abs((crossing-divider.x1)/slot-8269/14153)<1e-9)
  const caption = all.find(n=>n.type==='figcaption')
  assert.deepEqual(nodes(caption).filter(n=>n.type==='span' && Array.isArray(n.props.children)).map(n=>n.props.children[1]),
    ['Past demand','Forecast demand','Deliveries','Stock on hand'])
})

test('A4 grouped browser is runout sorted, search precedes 50 cap, Other fallback and flat toggle', () => {
  const dataset = plain(SAMPLE)
  dataset.items = Array.from({length:61},(_,i)=>({...dataset.items[0],sku:`SYN-${i}`,name:`Synthetic ${i}`,category:i%2?'Type':'',on_hand:100+i*100}))
  const page = states=>nodes(renderComponent('Page',{ctx:{storage}},{1:'csv',2:dataset,...states}))
  const all = page({})
  const panel = all.find(n=>n.props?.['aria-label']==='Inventory items, soonest run-out first')
  assert.equal(nodes(panel).filter(n=>n.type==='Button').length,50)
  assert.ok(nodes(panel).some(n=>String(n.props?.children).includes('Showing 50 of 61 matching products (61 total)')))
  assert.ok(nodes(panel).some(n=>n.type==='summary' && String(n.props.children).startsWith('Other ·')))
  const search = page({6:'SYN-60',7:'sku'})
  const filtered = search.find(n=>n.props?.['aria-label']==='Inventory items, soonest run-out first')
  assert.equal(nodes(filtered).filter(n=>n.type==='Button').length,1)
  assert.ok(nodes(filtered).some(n=>n.type==='strong' && n.props.children==='Synthetic 60'))
  assert.ok(nodes(filtered).some(n=>n.type==='small' && n.props.children==='SYN-60'))
  assert.equal(nodes(filtered).filter(n=>n.type==='details').length,0)
})

test('A4 supplier lead time affects urgency and existing forecast holds are respected', () => {
  const dataset = plain(SAMPLE)
  dataset.items[0].supplier_days = 200
  const page = nodes(renderComponent('Page',{ctx:{storage}},{1:'csv',2:dataset}))
  const row = page.find(n=>n.type==='Button' && n.props['aria-label'].includes('SEAL-CLR-300'))
  assert.equal(nodes(row).find(n=>n.type?.name==='StatusMark').props.bucket,'order')
  assert.match(row.props.style.borderInlineStart,/--ui-red/)
  assert.equal(calculate([{...dataset.items[0],hold_reason:'Some moves use a unit that cannot be converted.'}],SAMPLE.months,SAMPLE.as_of,6)[0].held,true)
})

test('A4 first and later runouts retain their fraction of the full calendar month at phone widths', () => {
  for (const width of [328,358,1100]) for (const [sku, expected] of [['UL-FOAM-GRN',8269/14153],['TRM-ALU-25',6+42/279]]) {
    const item = calculate(SAMPLE.items,SAMPLE.months,SAMPLE.as_of,12).find(r=>r.sku===sku)
    const all = nodes(renderComponent('Chart',{item,months:SAMPLE.months},{0:width}))
    const divider = all.find(n=>n.props?.['data-now-divider']).props
    const grid = all.find(n=>n.type==='line' && n.props.stroke==='var(--ui-stroke-secondary)').props
    const slot = (grid.x2-grid.x1)/(12+12)
    const marker = all.find(n=>n.props?.['data-runout']).props.cx
    assert.ok(Math.abs((marker-divider.x1)/slot-expected)<1e-9)
    const bandStart = divider.x1+Math.floor(expected)*slot
    assert.ok(marker>bandStart && marker<bandStart+slot)
    assert.ok(Math.abs((marker-bandStart)/slot-(expected%1))<1e-9)
    const points = all.find(n=>n.type==='polyline').props.points.split(' ').map(p=>p.split(',').map(Number))
    assert.ok(points.some(([x,y])=>x===marker && y===divider.y2))
    assert.equal(points.filter(([x])=>x===divider.x1).length,1)
  }
})

test('A4 exact historical stock and rounded forecast stock share Now without a false elapsed interval', () => {
  const months = SAMPLE.months.slice(-3)
  const raw = {...plain(SAMPLE.items[0]),on_hand:5.5,monthly_sales:[10,10,10],historical_receipts:Object.fromEntries(months.map(m=>[m,0]))}
  const item = calculate([raw],months,SAMPLE.as_of,6)[0]
  const all = nodes(renderComponent('Chart',{item,months}))
  const divider = all.find(n=>n.props?.['data-now-divider']).props
  const points = all.find(n=>n.type==='polyline').props.points.split(' ').map(p=>p.split(',').map(Number))
  assert.equal(points[2][0],divider.x1)
  assert.equal(points[3][0],divider.x1)
  const tickLines = all.filter(n=>n.type==='line' && n.props.stroke==='var(--ui-stroke-secondary)')
  const unitHeight = tickLines[0].props.y1-tickLines[1].props.y1
  const tickTexts = all.filter(n=>n.type==='text' && n.props.textAnchor==='end')
  const step = Number(String(tickTexts[1].props.children).replaceAll(',',''))
  assert.ok(Math.abs((divider.y2-points[2][1])/unitHeight*step-5.5)<1e-9)
  assert.ok(Math.abs((divider.y2-points[3][1])/unitHeight*step-5)<1e-9)
  assert.ok(all.some(n=>typeof n.props?.children==='string' && /Forecast starts from rounded-down stock/.test(n.props.children)))
  assert.equal(item.stock,5)
  assert.equal(item.runout_day,'2026-11-15')
})

test('A4 Chart renders all 65000 history months from an equivalent CSV below 2 MiB', () => {
  const months = Array.from({length:65000},(_,i)=>new Date(Date.UTC(1000,i,1)).toISOString().slice(0,7))
  const csvText = ['sku,name,unit,on_hand,supplier_days',...months,...months.map(m=>'rcv:'+m)].join(',')+'\n'
    +['SYNTHETIC','Synthetic long history','ea',1,'',...months.map(()=>0),...months.map(()=>0)].join(',')+'\n'
  assert.equal(Buffer.byteLength(csvText),1560075)
  assert.ok(Buffer.byteLength(csvText)<2*1024*1024)
  const raw = {sku:'SYNTHETIC',name:'Synthetic long history',unit:'ea',on_hand:1,supplier_days:null,
    monthly_sales:months.map(()=>0),historical_receipts:Object.fromEntries(months.map(m=>[m,0])),receipts:{}}
  const asOf = new Date(Date.UTC(1000,65000,0)).toISOString().slice(0,10)
  const item = calculate([raw],months,asOf,1)[0]
  assert.equal(item.held,false)
  const all = nodes(renderComponent('Chart',{item,months},{0:358}))
  assert.equal(all.filter(n=>n.props?.['data-period']==='sold').length,65000)
  assert.equal(all.filter(n=>n.props?.['data-period']==='supply').length,65001)
  assert.equal(all.filter(n=>n.props?.['data-period']==='forecast').length,1)
  assert.equal(all.find(n=>n.type==='polyline').props.points.split(' ').length,65001)
  const labels = all.filter(n=>String(n.key).startsWith('history-label-'))
  assert.ok(labels.length>0 && labels.length<=6,'date stride stays sparse, history is not capped')
})

test('A4 snapshot depletion stays visible while current status follows recovered supply', () => {
  const dataset = {as_of:SAMPLE.as_of,months:SAMPLE.months.slice(-3),items:[{sku:'ZERO',name:'Synthetic zero with delivery',unit:'ea',on_hand:0,supplier_days:null,monthly_sales:[10,10,10],receipts:{'2026-11':100}}]}
  const item = calculate(dataset.items,dataset.months,dataset.as_of,6)[0]
  assert.equal(item.runout_month,null)
  const page = nodes(renderComponent('Page',{ctx:{storage}},{1:'csv',2:dataset}))
  const row = page.find(n=>n.type==='Button' && n.props['aria-pressed']!==undefined)
  assert.match(row.props['aria-label'],/Already depleted/)
  assert.equal(nodes(row).find(n=>n.type?.name==='StatusMark').props.bucket,'healthy')
  assert.match(row.props.style.borderInlineStart,/--ui-green/)
  assert.ok(textValues(nodes(row)).includes('Already depleted'))
  assert.equal(nodes(row).find(n=>n.props?.['data-runout-tone']).props['data-runout-tone'],'order','already-depleted text stays red even when current status recovers')
  dataset.items[0].on_hand=110
  dataset.items[0].receipts={}
  const far = nodes(renderComponent('Page',{ctx:{storage}},{1:'csv',2:dataset,3:12}))
  const farRow = far.find(n=>n.type==='Button' && n.props['aria-pressed']!==undefined)
  const farItem = calculate(dataset.items, dataset.months, dataset.as_of, 12)[0]
  const expectedBucket = context.helpers.orderBucket(farItem, '2026-11-11', context.helpers.DEFAULT_ORDER_SETTINGS, dataset.as_of)
  assert.equal(expectedBucket, 'overstocked')
  assert.equal(nodes(farRow).find(n=>n.type?.name==='StatusMark').props.bucket, expectedBucket)
  assert.match(farRow.props.style.borderInlineStart,/--ui-blue/)
})

test('A4 fake Odoo missing or invalid receipt history still forecasts in Python and JS and requests history', async () => {
  const { spawnSync } = await import('node:child_process')
  const script = `import sys,types,pathlib,json
from datetime import date
root=pathlib.Path.cwd()
pkg=types.ModuleType('stock_runway');pkg.__path__=[str(root)];sys.modules['stock_runway']=pkg
from stock_runway.sources import OdooReadOnly
from stock_runway.engine import forecast
class Fake:
 def __init__(self,mode): self.mode=mode
 def __call__(self,*args,**kwargs): return self
 def authenticate(self,*args): return 1
 def execute_kw(self,db,uid,key,model,method,args,kwargs):
  assert method=='search_read'
  move=lambda qty,src,dst,unit: dict(product_id=[1,'Synthetic'],product_uom=[unit,'ea'],quantity=qty,date='2026-10-03 10:00:00',state='done',location_id=[src,'Synthetic'],location_dest_id=[dst,'Synthetic'])
  return {'product.product':[dict(id=1,name='Synthetic',default_code='SYN',uom_id=[1,'ea'],product_tmpl_id=[1,'Synthetic'])],
   'stock.location':[dict(id=41,usage='internal'),dict(id=90,usage='customer')]+([] if self.mode=='no-vendor' else [dict(id=70,usage='supplier')]),
   'stock.quant':[dict(product_id=[1,'Synthetic'],quantity=100,location_id=[41,'Synthetic'])],
   'stock.move':[move(20,41,90,1),move(3,90,41,1)]+([move(2,70,41,999)] if self.mode=='bad-unit' else []),
   'uom.uom':[dict(id=1,factor=1,category_id=[1,'Units'])],'product.supplierinfo':[]}[model]
out=[]
for mode in ['no-vendor','bad-unit','known-zero']:
 fake=Fake(mode)
 reader=OdooReadOnly(lambda name:{'ODOO_URL':'https://example.invalid','ODOO_DB':'fake','ODOO_USER':'fake','ODOO_API_KEY':'fake'}[name],server_proxy_factory=fake)
 data=reader.load(['SYN'],today=date(2026,11,8))
 out.append(dict(mode=mode,data=data,forecast=forecast(data['items'][0],data['months'],data['as_of'])))
print(json.dumps(out))`
  const env = {...process.env}; delete env.PYTHONPATH
  const py = spawnSync(process.env.PYTHON || 'python3',['-c',script],{encoding:'utf8',env})
  assert.equal(py.status,0,py.stderr)
  for (const {mode,data,forecast} of JSON.parse(py.stdout)) {
    const item = calculate(data.items,data.months,data.as_of,6)[0]
    assert.equal(item.held,false,mode)
    assert.equal(forecast.held,false,mode)
    for (const key of ['stock','monthly_demand','runout_month','runout_day','projection','grade']) assert.deepEqual(plain(item[key]),forecast[key],key)
    const chart = nodes(renderComponent('Chart',{item,months:data.months}))
    const missing = chart.filter(n=>n.props?.children==='Add delivery history to see past inventory.')
    assert.equal(missing.length,mode==='known-zero'?0:1,mode)
    if (mode!=='known-zero') {
      assert.equal(Object.hasOwn(data.items[0],'historical_receipts'),false,mode)
      const now = chart.find(n=>n.props?.['data-now-divider']).props.x1
      assert.equal(Number(chart.find(n=>n.type==='polyline').props.points.split(',')[0]),now)
    }
  }
})

test('A4 short and zero-sales history put Now and quantity labels on separate rows', () => {
  for (const width of [328,358]) for (const sales of [[10,10,10],[0,0,0]]) {
    const months = SAMPLE.months.slice(-3)
    const item = calculate([{...plain(SAMPLE.items[0]),on_hand:5,monthly_sales:sales,historical_receipts:undefined}],months,SAMPLE.as_of,12)[0]
    assert.equal(item.held,false)
    const all = nodes(renderComponent('Chart',{item,months},{0:width}))
    const now = all.find(n=>n.type==='text' && n.props.children==='Now').props
    const quantity = all.find(n=>n.type==='text' && n.props.children==='Units').props
    assert.ok(now.y-now.fontSize>=quantity.y+4,'distinct text rows with a gap; actual text bounds checked in browser harness')
    const divider = all.find(n=>n.props?.['data-now-divider']).props
    assert.equal(divider.y2-divider.y1,230,'phone plot height is retained')
  }
})

// A9: source rejection is separate from per-item runtime containment.
for (const [file, message] of [['date_boundary.csv',/1000-01.*9998-12/],['mixed_overflow.csv',/Row 3: supplier_days.*3650/],['finite_sales_overflow.csv',/1000000000000/]]) test(`A9 rejects ${file}`, () => {
  assert.throws(() => parseCsv(fs.readFileSync(new URL(`./fixtures/${file}`,import.meta.url),'utf8')),message)
})
test('A9 runtime limits and direct calendar guards hold only the bad item', () => {
  const good=plain(SAMPLE.items[0])
  for (const patch of [{supplier_days:9999999},{on_hand:1e308},{monthly_sales:Array(12).fill(1e308)},{receipts:{'2026-11':1e308}}]) {
    const rows=calculate([good,{...good,sku:'B',...patch}],SAMPLE.months,SAMPLE.as_of,6)
    assert.equal(rows[0].held,false); assert.equal(rows[1].held,true)
  }
  for (const months of [[],['bad','bad','2026-10'],['2026-06','2026-08','2026-10'],['9999-10','9999-11','9999-12']]) {
    assert.equal(calculate([{...good,monthly_sales:[1,1,1]}],months,months[0]?.startsWith('9999')?'9999-12-31':SAMPLE.as_of,6)[0].held,true)
  }
  const bad={...good,sku:'B'}; Object.defineProperty(bad,'monthly_sales',{get(){throw Error('PRIVATE secret')}})
  const rows=calculate([good,bad],SAMPLE.months,SAMPLE.as_of,6)
  assert.equal(rows[0].held,false); assert.match(rows[1].reason,/^Couldn't calculate: /)
  assert.ok(!JSON.stringify(rows).includes('PRIVATE'))
})
test('A9 fractional error preserves nonzero error and integer forecast', () => {
  const data=parseCsv(fs.readFileSync(new URL('./fixtures/fractional.csv',import.meta.url),'utf8'))
  for(const item of calculate(data.items,data.months,data.as_of,6)) {
    assert.equal(item.monthly_demand,1); assert.ok(item.error_percent>0 && item.error_percent<.01)
  }
})
test('A9 truly perfect fractional series may report zero error', () => {
  for(const value of [.1,.2,.07]) {
    const data=plain(SAMPLE); data.items[0].monthly_sales=Array(12).fill(value)
    assert.equal(calculate(data.items.slice(0,1),data.months,data.as_of,6)[0].error_percent,0)
  }
})

const fractionalData = () => plain(parseCsv(fs.readFileSync(new URL('./fixtures/fractional.csv', import.meta.url), 'utf8')))
test('A10 fractional fixture retains exact input and the explicit integer forecast oracle', () => {
  const data = fractionalData(), before = JSON.stringify(data)
  for (const item of calculate(data.items, data.months, data.as_of, 6)) {
    assert.equal(item.on_hand, 0.7)
    assert.equal(item.stock, 0)
    assert.equal(item.monthly_demand, 1)
    assert.deepEqual(plain(item.projection), [
      { month: '2026-11', demand: 1, receipts: 0, stock: -1 },
      { month: '2026-12', demand: 1, receipts: 0, stock: -2 },
      { month: '2027-01', demand: 1, receipts: 0, stock: -3 },
      { month: '2027-02', demand: 1, receipts: 0, stock: -4 },
      { month: '2027-03', demand: 1, receipts: 0, stock: -5 },
      { month: '2027-04', demand: 1, receipts: 0, stock: -6 },
    ])
    assert.equal(item.runout_month, '2026-11')
    assert.equal(item.runout_day, '2026-11-01')
    const { on_hand, ...calculation } = plain(item)
    const { on_hand: flooredInput, ...integerOracle } = plain(calculate([{ ...data.items.find(row => row.sku === item.sku), on_hand: 0 }], data.months, data.as_of, 6)[0])
    assert.deepEqual(calculation, integerOracle, 'all calculation fields including quality stay unchanged')
  }
  assert.equal(JSON.stringify(data), before)
})

for (const onHand of [0.7, 0.004, 0.000001, 0]) {
  test(`A10 present-zero status uses exact on-hand ${onHand}`, () => {
    const data = fractionalData()
    data.items[0].on_hand = onHand
    const all = clarityPage(data, { 4: 'L' }), detail = selectedNodes(all)
    const expected = onHand === 0 ? 'Already depleted' : 'Runs out Nov 2026'
    assert.match(detail.find(n => n.props?.role === 'status').props.children, /^(Order |Out of stock — Order |No order needed —)/)
    const row = all.find(n => n.type === 'Button' && n.props['aria-pressed'] === true)
    assert.ok(row.props['aria-label'].startsWith(`${expected} · L · `))
    assert.ok(textValues(nodes(row)).includes(expected))
    if (onHand > 0) assert.ok(!textValues(detail).includes('Already depleted'))
  })
  test(`A10 present-zero SVG label uses exact on-hand ${onHand}`, () => {
    const data = fractionalData()
    data.items[0].on_hand = onHand
    const item = calculate(data.items, data.months, data.as_of, 6)[0]
    const before = JSON.stringify(item), pathBefore = JSON.stringify(stockPath(item))
    const chart = nodes(renderComponent('Chart', { item, months: data.months }, { 0: 390 }))
    const labels = chart.filter(n => n.type === 'text').map(n => n.props.children)
    assert.ok(labels.includes(onHand === 0 ? 'Out now' : 'Runs out Nov'))
    if (onHand > 0) assert.ok(!labels.includes('Out now'))
    assert.match(chart.find(n => n.type === 'svg').props['aria-label'], /As of 31 Oct 2026\. Unit: l\./)
    assert.ok(textValues(chart).includes('Dots show stock at month end.'))
    assert.ok(textValues(chart).includes('Left of Now: what happened. Right: forecast.'))
    assert.equal(item.stock, 0)
    assert.equal(item.monthly_demand, 1)
    assert.equal(item.runout_day, '2026-11-01')
    assert.deepEqual(plain(item.projection).map(row => row.stock), [-1, -2, -3, -4, -5, -6])
    assert.equal(JSON.stringify(item), before)
    assert.equal(JSON.stringify(stockPath(item)), pathBefore)
  })
}

for (const [onHand, display] of [[0.7, '0.7'], [0.004, '<0.01'], [0.000001, '<0.01'], [0.01, '0.01'], [1.25, '1.25'], [9.99, '9.99'], [20, '20'], [0, '0']]) {
  test(`A10 headline shows exact current stock ${onHand} with A9 formatting`, () => {
    const data = fractionalData()
    data.items[0].on_hand = onHand
    const detail = selectedNodes(clarityPage(data, { 4: 'L' }))
    const headline = textValues(detail).find(text => text.includes(' left · sells about '))
    assert.equal(headline, `${display} l left · sells about 1 l a month${onHand < 1 ? ' · less than a month left' : ''}`)
    if (onHand > 0) assert.ok(!headline.startsWith('0 l left'))
    const chart = detail.find(node => node.type?.name === 'Chart')
    const integer = calculate([{ ...data.items[0], on_hand: Math.floor(onHand) }], data.months, data.as_of, 6)[0]
    assert.equal(chart.props.item.stock, Math.floor(onHand))
    assert.deepEqual(plain(chart.props.item.projection), plain(integer.projection))
  })
  test(`A10 Now has an accessible exact stock cell for ${onHand}, with separation intact`, () => {
    const data = fractionalData()
    data.items[0].on_hand = onHand
    const detail = selectedNodes(clarityPage(data, { 4: 'L' }))
    const table = detail.find(node => node.type?.name === 'DataTable' && node.props.title === 'Month by month: stock, sales, deliveries')
    const rendered = nodes(renderComponent('DataTable', table.props))
    const now = rendered.find(node => node.props?.['data-now-separator'])
    const cells = nodes(now).filter(node => ['th', 'td'].includes(node.type))
    assert.equal(cells.length, 4, 'sticky Now header, two empty timeline cells and dedicated stock cell')
    assert.equal(cells[0].type, 'th'); assert.equal(cells[0].props.scope, 'row')
    assert.equal(cells[0].props.children, 'Now'); assert.equal(cells[0].props.colSpan, 1)
    assert.equal(cells[3].type, 'td'); assert.equal(cells[3].props.children, `${display} l`)
    assert.equal(cells[3].props.style.textAlign, 'right')
    assert.ok(cells.every(cell => /2px solid/.test(cell.props.style.borderBlock)))
  })
  test(`A10 local quick view stock ${onHand} is exact without changing calculation or card schema`, () => {
    const { ui, ctx, values } = registered(), data = fractionalData()
    data.items[0].on_hand = onHand
    values.set('source', 'csv'); values.set('csv_data', data)
    const before = JSON.stringify(data), view = ui.quickData(ctx)
    assert.equal(view.rows.find(row => row.sku === 'L').stock, onHand)
    const table = nodes(renderComponent('RunwayTable', { data: view })).find(node => node.type?.name === 'DataTable')
    const row = table.props.rows.find(row => textValues(nodes(row[0])).includes('L'))
    assert.equal(row[2], display)
    assert.equal(context.helpers.stockCell(onHand), onHand === 0 ? 'Out' : display)
    assert.equal(context.helpers.validCard(view), true, 'existing fields and numeric schema suffice')
    assert.equal(calculate(data.items, data.months, data.as_of, 6)[0].stock, Math.floor(onHand))
    assert.equal(JSON.stringify(data), before)
  })
}
test('A9 quick view fails safely for corrupted saved data without persistence in evaluation', () => {
  const {ctx,ui,values}=registered()
  values.set('source','csv'); values.set('csv_data',{months:['9999-12'],as_of:'9999-12-31',items:[]})
  const before=JSON.stringify([...values])
  assert.equal(ui.quickData(ctx).error,true)
  assert.equal(JSON.stringify([...values]),before)
})
test('A9 pending page upload cannot persist after a source switch', async () => {
  const {ctx,values}=registered()
  values.set('source','csv'); values.set('csv_data',plain(parseCsv(csv)))
  const page=ctx.entries.find(e=>e.area==='routes').render().props.children
  const tree=page.type(page.props), before=JSON.stringify(values.get('csv_data'))
  let release
  const pending=nodes(tree).find(n=>n.props?.id==='runway-csv').props.onChange({target:{files:[{size:csv.length,text:()=>new Promise(resolve=>{release=resolve})}]}})
  nodes(tree).find(n=>n.type?.name==='SegmentedControl').props.onChange('sample')
  release(csv.replace('Alpha','Replacement')); await pending
  assert.equal(values.get('source'),'sample'); assert.equal(JSON.stringify(values.get('csv_data')),before)
})
test('A9 thrown dataset calculation is rejected before replacing saved CSV', async () => {
  const {ctx,ui,values}=registered()
  values.set('source','csv'); values.set('csv_data',plain(parseCsv(csv)))
  const page=ctx.entries.find(e=>e.area==='routes').render().props.children
  const tree=page.type(page.props), before=JSON.stringify(values.get('csv_data'))
  vm.runInContext('calculate = () => { throw Error("PRIVATE calculation failure") }',ui)
  await nodes(tree).find(n=>n.props?.id==='runway-csv').props.onChange({target:{files:[{size:csv.length,text:async()=>csv}]}})
  assert.equal(JSON.stringify(values.get('csv_data')),before)
})
test('A9 source caps all quantities and accepts the inclusive lead-time cap', () => {
  const months=SAMPLE.months.slice(-3)
  const headers=['sku','name','unit','on_hand','supplier_days',...months,...months.map(m=>'rcv:'+m)]
  for(const column of ['on_hand','2026-08','rcv:2026-08']) for(const number of [1e12,1e12+1]) {
    const values=['A','Synthetic','m','5','3650','10','10','10','0','0','0']
    values[headers.indexOf(column)]=String(number)
    const csv=headers.join(',')+'\n'+values.join(',')+'\n'
    if(number>1e12) assert.throws(()=>parseCsv(csv),/Row 2:.*1000000000000/)
    else assert.equal(parseCsv(csv).items[0].supplier_days,3650)
  }
})
test('A9 date edges remain representable; unsupported ratio and history stay safe', () => {
  for(const last of ['1000-03','9998-12']) {
    const [y,m]=last.split('-').map(Number)
    const months=Array.from({length:3},(_,i)=>new Date(Date.UTC(y,m-3+i,1)).toISOString().slice(0,7))
    const asOf=new Date(Date.UTC(y,m,0)).toISOString().slice(0,10)
    assert.equal(calculate([{...plain(SAMPLE.items[0]),monthly_sales:[1,1,1],supplier_days:3650}],months,asOf,12)[0].held,false)
  }
  const data=plain(SAMPLE), item=data.items[0]
  item.monthly_sales=[...Array(8).fill(1e12),...Array(4).fill(1e-300)]
  assert.equal(calculate([item],data.months,data.as_of,6)[0].held,true)
  item.monthly_sales=Array(12).fill(1)
  item.historical_receipts=Object.fromEntries(data.months.map(m=>[m,1e308]))
  assert.equal(inventoryHistory(item,data.months).rows.length,0)
})
test('A9 unexpected exceptions cannot impersonate safe CSV validation messages', () => {
  const {ui}=registered()
  const message=vm.runInContext('uploadError(Error("Row 2: PRIVATE unexpected failure"))',ui)
  assert.ok(!message.includes('PRIVATE'))
})

// RESUME3 independent oracle: walk every UTC day, consuming 1 / days-in-month
// of monthly demand. It deliberately does not call any product calendar helper.
const orderOracle = (snapshot, endpoint, demand, stock, receipts = {}, pack = 1, minimum = 0) => {
  const common = 377580n, scale = 1000000n // LCM(28,29,30,31), six-place source decimals
  const decimal = n => BigInt(Math.round(n * Number(scale)))
  let need = -decimal(stock) * common
  for (let day = Date.parse(snapshot) + 86400000; day <= Date.parse(endpoint); day += 86400000) {
    const date = new Date(day), days = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
    need += decimal(demand) * (common / BigInt(days))
    if (date.getUTCDate() === 1) need -= decimal(receipts[date.toISOString().slice(0,7)] || 0) * common
  }
  if (need <= 0n) return 0
  need = need > decimal(minimum)*common ? need : decimal(minimum)*common
  const packN = decimal(pack)*common
  return Number((need + packN - 1n) / packN) * pack
}
test('RESUME3 quantity covers snapshot through the promised future order endpoint', () => {
  for (const [stock, cover, orderBy, endpoint, quantity] of [
    // LOW-ITEM: Dec 2 + 14 + 60 ends Feb 14; 105 calendar demand - 45 stock = 60.
    [45,2,'2026-12-02','2027-02-14',60],
    // YEAR: Nov 27 2027 + 14 + 1080 ends Nov 25 2030; 1465 calendar demand - 400 = 1065.
    [400,36,'2027-11-27','2030-11-25',1065],
  ]) {
    const result=repairMath({on_hand:stock},'2026-11-11',{...repairSettings(),months_of_cover:cover})
    assert.equal(result.order_by,orderBy)
    assert.equal(result.quantity,quantity)
    assert.equal(result.quantity,orderOracle('2026-10-31',endpoint,30,stock))
  }
})
test('RESUME3 months-old stock projects today and retains exact stock in quantity', () => {
  const result=repairMath({on_hand:45.7},'2027-03-15')
  assert.equal(result.out_of_stock,true)
  assert.equal(result.supply_gap,true)
  assert.equal(result.order_by,'now')
  assert.equal(result.quantity,orderOracle('2026-10-31','2027-05-28',30,45.7))
  // A received delivery restores stock; the old snapshot shortage is no longer current.
  const recovered=repairMath({on_hand:0,receipts:{'2026-11':100}},'2026-12-01')
  assert.equal(recovered.out_of_stock,false)
  assert.equal(recovered.supply_gap,false)
})
test('RESUME3 dead stock reaches No sales before Overstocked', () => {
  assert.equal(context.helpers.orderBucket(guidanceItem({on_hand:5,monthly_demand:0,monthly_sales:[0,0,0]}),'2026-11-11',repairSettings()),'no-sales')
})
test('RESUME3 needs-data omits invalid quantity explanation and stale date is visible', () => {
  const all=clarityPage(clarityData({supplier_days:null}),{9:{...repairSettings(),default_delivery_days:null}})
  const text=textValues(all).join(' ')
  assert.match(text,/Stock figures as of 31 Oct 2026/)
  assert.doesNotMatch(text,/NaN|Order quantity is forecast demand for/)
})
test('RESUME3 panel and chip agree and include every attention row beyond 50', () => {
  const data=clarityData({monthly_sales:[0,0,0],on_hand:0})
  data.items=Array.from({length:61},(_,i)=>({...data.items[0],sku:`EMPTY-${i}`}))
  const all=clarityPage(data),panel=all.find(n=>String(n.props?.['aria-label']||'').startsWith('Order now ('))
  assert.equal(panel.props['aria-label'],'Order now (61)')
  assert.equal(nodes(panel).filter(n=>n.props?.['data-order-sku']).length,61)
  assert.equal(textValues(nodes(all.find(n=>n.props?.['data-bucket']==='order'))).join(''),'Order now (61)')
  assert.doesNotMatch(textValues(nodes(panel)).join(' '),/Order 0 /)
})


test('RESUME3 required blank blur keeps draft and stored calculation with explicit error; optional blank clears', () => {
  for (const optional of [false,true]) {
    const updates=[],calls=[],props={title:'Setting',id:'fixture',value:2,onChange:text=>{calls.push(text); return optional}}
    const tree=renderComponent('OrderSettingInput',props,{0:''},updates)
    nodes(tree).find(n=>n.type==='input').props.onBlur()
    assert.deepEqual(calls,[''])
    assert.deepEqual(updates,[{index:1,value:optional?false:'required'}])
    if (!optional) {
      const invalid=nodes(renderComponent('OrderSettingInput',props,{0:'',1:'required'}))
      assert.equal(invalid.find(n=>n.type==='input').props.value,'')
      assert.equal(invalid.find(n=>n.type==='input').props['aria-invalid'],true)
      assert.match(textValues(invalid).join(' '),/required.*previous value \(2\).*still used/)
    }
  }
})
test('RESUME5 cleared delivery persists null across remount and puts unknown suppliers in Needs data', () => {
  let saved = { ...repairSettings(), default_delivery_days: 20 }
  const ctx = { storage: { get: (key, fallback) => key === 'order_settings' ? saved : fallback,
    set: (key, value) => { assert.equal(key, 'order_settings'); saved = plain(value) } } }
  const page = () => nodes(renderComponent('Page', { ctx }, { 1: 'csv', 2: clarityData({ supplier_days: null }) }))
  const field = page().find(n => n.props?.id === 'default-delivery-days')
  const changes = []
  nodes(renderComponent('OrderSettingInput', field.props, {}, changes)).find(n => n.type === 'input')
    .props.onChange({ target: { value: '' } })
  assert.equal(saved.default_delivery_days, 20, 'empty text remains a draft until blur')
  nodes(renderComponent('OrderSettingInput', field.props, { 0: '' })).find(n => n.type === 'input').props.onBlur()
  assert.equal(saved.default_delivery_days, null)
  const reloaded = page()
  assert.equal(reloaded.find(n => n.props?.id === 'default-delivery-days').props.value, null)
  const reason = 'No delivery time — set one in Advanced'
  assert.equal(selectedNodes(reloaded).find(n => n.props?.role === 'status').props.children, `Needs data — ${reason}`)
  const math = context.helpers.orderGuidance, bucket = context.helpers.orderBucket
  assert.equal(math(guidanceItem({ supplier_days: null }), '2026-11-11', saved).reason, reason)
  assert.equal(bucket(guidanceItem({ supplier_days: null }), '2026-11-11', saved), 'needs-data')
  const knownZero = math(guidanceItem({ supplier_days: 0 }), '2026-11-11', saved)
  assert.equal(knownZero.lead_days, 0)
  assert.equal(knownZero.used_default_lead, false)
  assert.notEqual(knownZero.status, 'needs-data')
})
for (const invalid of ['0', '-1', 'text']) test(`RESUME5 invalid default delivery ${invalid} retains saved value and shows error`, () => {
  const saved = { ...repairSettings(), default_delivery_days: 20 }, writes = []
  const ctx = { storage: { get: (key, fallback) => key === 'order_settings' ? saved : fallback,
    set: (...args) => writes.push(args) } }
  const field = nodes(renderComponent('Page', { ctx })).find(n => n.props?.id === 'default-delivery-days')
  const states = {}, changes = []
  let tree = nodes(renderComponent('OrderSettingInput', field.props, states, changes))
  tree.find(n => n.type === 'input').props.onChange({ target: { value: invalid } })
  for (const change of changes) states[change.index] = change.value
  tree = nodes(renderComponent('OrderSettingInput', field.props, states, changes))
  tree.find(n => n.type === 'input').props.onBlur()
  assert.deepEqual(writes, [], 'invalid draft must never overwrite the saved default')
  assert.equal(tree.find(n => n.type === 'input').props.value, invalid)
  assert.equal(tree.find(n => n.type === 'input').props['aria-invalid'], true)
  assert.match(tree.find(n => n.props?.role === 'alert').props.children, /previous setting is used/)
  assert.equal(context.helpers.normalizeOrderSettings({ ...saved, default_delivery_days: Number(invalid) }).default_delivery_days, 14)
})
test('RESUME5 fractional guidance uses fixed today while snapshot stock remains exact', () => {
  const data = fractionalData(), item = calculate(data.items, data.months, data.as_of, 6)[0]
  assert.equal(data.as_of, '2026-10-31')
  assert.equal(item.on_hand, 0.7)
  assert.equal(item.monthly_demand, 1)
  const result = context.helpers.orderGuidance(item, '2026-11-11', repairSettings(), data.as_of)
  assert.equal(result.projected_balance_today, -11 / 30)
  assert.equal(result.out_of_stock, true)
  assert.equal(result.order_by, 'now')
  assert.equal(result.endpoint, '2027-01-24')
  // Nov + Dec + 24/31 Jan demand, minus exact 0.7 l; ceil(2 + 24/31 - 0.7) = 3.
  assert.equal(result.quantity, orderOracle('2026-10-31', '2027-01-24', 1, 0.7))
  assert.equal(result.quantity, 3)
})
test('RESUME3 no-order incoming has units and zero-demand wording never describes positive demand', () => {
  const settings={...repairSettings(),months_of_cover:0}
  const all=clarityPage(clarityData({on_hand:30,supplier_days:0,monthly_sales:[30,30,30],receipts:{'2026-11':30}}),{9:settings})
  assert.match(textValues(selectedNodes(all)).join(' '),/No order needed — 30 m in confirmed deliveries cover/)
  assert.doesNotMatch(textValues(all).join(' '),/no recent sales/)
  const urgent=clarityPage(clarityData({on_hand:30,supplier_days:14,monthly_sales:[30,30,30]}),{9:settings})
  const panel=urgent.find(n=>String(n.props?.['aria-label']||'').startsWith('Order now ('))
  assert.equal(panel.props['aria-label'],'Order now (1)')
  assert.match(textValues(nodes(panel)).join(' '),/No order needed — enough stock until 30 Nov 2026/)
  assert.doesNotMatch(textValues(nodes(panel)).join(' '),/Out of stock|Order 0 /)
})
test('RESUME4 B1 November receipt is available from start of month, with no fictitious gap', () => {
  const result=repairMath({on_hand:20,supplier_days:14,receipts:{'2026-11':100}},'2026-11-11')
  assert.equal(result.projected_balance_today,109)
  assert.equal(result.out_of_stock,false)
  assert.equal(result.supply_gap,false)
  assert.equal(result.runout_date,'2027-02-28')
  assert.equal(result.order_by,'2027-02-14')
  assert.equal(result.endpoint,'2027-04-29')
  assert.equal(result.quantity,59) // 179 calendar demand through Apr 29 minus 20 stock and 100 receipt.
  assert.equal(result.quantity,orderOracle('2026-10-31',result.endpoint,30,20,{'2026-11':100}))
  const all=clarityPage(clarityData({on_hand:20,supplier_days:14,monthly_sales:[30,30,30],receipts:{'2026-11':100}}))
  const panel=all.find(n=>String(n.props?.['aria-label']||'').startsWith('Order now ('))
  const row=all.find(n=>n.props?.['aria-label']?.includes(' · SYN-A7 · '))
  assert.equal(panel.props['aria-label'],'Order now (0)')
  assert.match(textValues(nodes(panel)).join(' '),/around 14 Feb 2027/)
  for (const part of [nodes(row),nodes(selectedNodes(all).find(n => n.props?.role === 'status'))]) {
    assert.match(textValues(part).join(' '),/Order 59 m by 14 Feb 2027/)
    assert.doesNotMatch(textValues(part).join(' '),/Short from|Out of stock/)
  }
  assert.doesNotMatch(textValues(selectedNodes(all)).join(' '),/Short from/)
})
test('RESUME4 true temporary gap retains earliest crossing before and after later receipt', () => {
  for (const today of ['2026-11-11','2026-11-19','2026-11-20','2026-11-25','2026-12-01','2026-12-11']) {
    const item=guidanceItem({on_hand:20,receipts:{'2026-12':100}})
    const result=repairMath(item,today)
    assert.equal(result.runout_date,'2026-11-20')
    assert.equal(result.order_by,'now')
    assert.equal(result.gap_date,'2026-11-20','never replace the historical crossing with today')
    assert.equal(result.delivery_date,'2026-12-01')
    assert.equal(result.delivery_quantity,100)
    assert.equal(result.supply_gap,true)
    assert.equal(result.out_of_stock,today==='2026-11-20'||today==='2026-11-25')
    assert.equal(context.helpers.orderBucket(item,today,repairSettings()),'order')
    assert.equal(result.quantity,orderOracle('2026-10-31',result.endpoint,30,20,{'2026-12':100}))
  }
})
test('RESUME4 zero balance on month end precedes next start-of-month receipt', () => {
  const result=repairMath({on_hand:30,receipts:{'2026-12':100}},'2026-11-11')
  assert.equal(result.runout_date,'2026-11-30')
  assert.equal(result.order_by,'2026-11-16')
  assert.equal(result.gap_date,'2026-11-30')
  assert.equal(result.delivery_date,'2026-12-01')
})
test('RESUME4 stale snapshot retains one-month and at least three-month cases', () => {
  for (const [today,endpoint,quantity] of [['2026-12-01','2027-03-01',61],['2027-02-11','2027-04-26',116]]) {
    const result=repairMath({on_hand:30,receipts:{'2026-11':30}},today)
    assert.equal(result.endpoint,endpoint)
    assert.equal(result.quantity,quantity)
    assert.equal(result.quantity,orderOracle('2026-10-31',endpoint,30,30,{'2026-11':30}))
  }
})
test('RESUME4 receipt endpoints are inclusive at month start and snapshot receipts excluded', () => {
  const settings={...repairSettings(),months_of_cover:0}
  for (const [today,expected,incoming] of [['2026-11-30',29,0],['2026-12-01',10,20],['2026-12-02',11,20]]) {
    const result=repairMath({on_hand:1.7,supplier_days:0,receipts:{'2026-10':999,'2026-12':20}},today,settings)
    assert.equal(result.quantity,expected)
    assert.equal(result.incoming,incoming)
  }
})
test('RESUME4 panel, product row and detail retain earliest gap and order date', () => {
  let trimmed=0
  for (const cover of [2,6]) {
    const all=clarityPage(clarityData({on_hand:20,supplier_days:14,monthly_sales:[30,30,30],receipts:{'2026-12':100}}),{9:{...repairSettings(),months_of_cover:cover}})
    const panel=all.find(n=>String(n.props?.['aria-label']||'').startsWith('Order now ('))
    const row=all.find(n=>n.props?.['aria-label']?.includes(' · SYN-A7 · '))
    // Owner trim 2026-11-11: an 'order'-bucket product row no longer repeats the order/shortage lines shown in Order now and the detail panel.
    const rowBucket=nodes(row).find(n=>n.props?.['data-status-label'])?.props['data-status-label']
    const parts=[nodes(panel),selectedNodes(all)]; if (rowBucket!=='order') parts.push(nodes(row))
    for (const part of parts) {
      const text=textValues(part).join(' ')
      assert.match(text,/Short from 20 Nov 2026 until the Dec delivery of 100 m\./)
      assert.doesNotMatch(text,/by (?!6 Nov 2026)\d{1,2} [A-Z][a-z]{2} \d{4}/)
      if (cover===6) assert.match(text,/Order [\d,]+ m now/)
    }
    if (rowBucket==='order') {
      const rowText=textValues(nodes(row)).join(' ')
      assert.doesNotMatch(rowText,/Order [\d,]+ m (now|by)|Short from/,'order row is trimmed')
      trimmed++
    }
    const main=all.find(n=>n.type==='main'),children=main.props.children.filter(Boolean)
    assert.equal(children[0].type,'h1')
    assert.equal(children[1],panel,'order panel is the first content block after title')
    const sentence=nodes(panel).find(n=>n.props?.['data-order-answer'])
    const product=nodes(panel).find(n=>n.props?.['data-order-product'])
    assert.ok(sentence.props.style.fontSize>product.props.style.fontSize)
    assert.ok(sentence.props.style.fontWeight>product.props.style.fontWeight)
  }
  assert.ok(trimmed>0,"at least one order-bucket row exercised the trim")
})


test('polish rows retain needs-data reasons and overstock duration without invented orders', () => {
  const held = structuredClone(plain(SAMPLE))
  held.items = [{ ...held.items[0], hold_reason: 'Synthetic hold' }]
  const all = nodes(renderComponent('Page', {ctx:{storage}}, {1:'csv',2:held}))
  const row = all.find(n=>n.type==='Button' && n.props['aria-pressed']!==undefined)
  assert.ok(textValues(nodes(row)).includes('Synthetic hold'))
  assert.ok(textValues(nodes(row)).includes('Check item data'))
  assert.doesNotMatch(textValues(nodes(row)).join(' '), /No order needed|Order \d/)
  const data = structuredClone(plain(SAMPLE))
  data.items = [{...data.items[0], on_hand:1000000}]
  const item = calculate(data.items,data.months,data.as_of,6)[0]
  const guidance = context.helpers.orderGuidance(item,'2026-11-11',context.helpers.DEFAULT_ORDER_SETTINGS,data.as_of)
  const over = nodes(renderComponent('Page',{ctx:{storage}},{1:'csv',2:data}))
  const overRow = over.find(n=>n.type==='Button' && n.props['aria-pressed']!==undefined)
  assert.equal(nodes(overRow).find(n=>n.type?.name==='StatusMark').props.bucket,'overstocked')
  assert.ok(textValues(nodes(overRow)).includes(`~${guidance.overstock_months.toLocaleString('en-US',{maximumFractionDigits:1})} months of stock`))
})

test('polish timeline preserves values with semantic delivery/shortage and forecast differentiation', () => {
  const tree = renderComponent('DataTable', {headings:['Month','Sold / Forecast','Delivered','Stock at month end'],
    title:'Timeline',wrapColumns:true, rows:[['Nov 2026 · Forecast','30 m','+10 m','Out of stock · short 20 m']],rowStates:['first-out']})
  const all = nodes(tree)
  const delivery = all.find(n=>n.props?.['data-cell-tone']==='delivery')
  const negative = all.find(n=>n.props?.['data-cell-tone']==='negative')
  assert.equal(delivery.props.children,'10 m'); assert.equal(delivery.props['aria-label'],'10 m'); assert.match(delivery.props.style.color,/--ui-green/)
  assert.equal(negative.props.children,'Out of stock · short 20 m'); assert.match(negative.props.style.color,/--ui-red/)
  assert.equal(delivery.props.style.fontStyle,'italic')
  assert.ok(delivery.props.style.background)
})


test('quick capture waits for the mounted dialog host after reload without changing shortcut assertions', () => {
  const entry = fs.readFileSync(new URL('../docs/harness-entry.js', import.meta.url), 'utf8')
  const capture = fs.readFileSync(new URL('../docs/capture-quick-view.cjs', import.meta.url), 'utf8')
  assert.ok(entry.indexOf('window.runwayDialogHostReady = false') < entry.indexOf('const root = createRoot'))
  assert.match(entry, /remount: \(\) => \{ window\.runwayDialogHostReady = false; generation\+\+; render\(\)/)
  const effect = entry.match(/useEffect\(\(\) => \{\n    window\.runwayDialogHostReady = titlebarVisible([\s\S]*?)\}, \[titlebarVisible\]\)/)
  assert.ok(effect, 'readiness is a parent effect, not a render-time flag')
  const state = { window: {}, titlebarVisible: true }
  vm.runInNewContext('globalThis.cleanup = (() => { window.runwayDialogHostReady = titlebarVisible' + effect[1] + '})()', state)
  assert.equal(state.window.runwayDialogHostReady, true)
  state.cleanup(); assert.equal(state.window.runwayDialogHostReady, false)
  const reload = capture.slice(capture.indexOf('await page.reload()'), capture.indexOf('// The statusbar can disappear'))
  assert.match(reload, /Stock Runway settings/)
  assert.ok(reload.indexOf('window.runwayDialogHostReady === true') < reload.indexOf("await page.keyboard.press('Meta+Shift+i')"))
  assert.ok(reload.includes("'CSV survives reload'"))
})

test('controls audit: every disclosure header is at least 40px tall', () => {
  const source = fs.readFileSync(new URL('../desktop/plugin.js', import.meta.url), 'utf8')
  const summaries = source.match(/jsxs?\('summary', \{ style: [^}]*\}?/g) || []
  assert.ok(summaries.length >= 6)
  for (const s of summaries) assert.match(s, /summaryHit/, s)
  assert.match(source, /const summaryHit = \{[^}]*minHeight: 40/)
})

test('seasonal factors, clamps, zero, fallback and deseasonalised level use independent oracles', () => {
  vm.runInContext('globalThis.seasonalHelpers={demandModel,monthDemand}', context)
  const {demandModel,monthDemand}=context.seasonalHelpers
  for (const [sales,seasonal,level,demands] of [
    [[50,150,...Array(10).fill(100)],true,100,[50,150]],
    [[0,1000,...Array(10).fill(10)],true,20,[10,40]],
    [Array(12).fill(0),true,0,[0,0]],
    [Array(12).fill(0.1),true,0.1,[1,1]],
    [Array(11).fill(10),false,10,[10,10]],
    [Array(3).fill(1.0000000000000002),false,1.0000000000000002,[2,2]],
  ]) {
    const model=demandModel(sales,'2026-12')
    assert.equal(model.seasonal,seasonal)
    assert.ok(Math.abs(model.level-level)<1e-12)
    assert.ok(model.factors.every(f=>f>=0.5&&f<=2))
    assert.deepEqual([monthDemand(model,'2027-01'),monthDemand(model,'2027-02')],demands)
  }
  assert.deepEqual(plain(demandModel([50,150,...Array(10).fill(100)],'2026-12').factors),[0.5,1.5,...Array(10).fill(1)])
})

test('seasonal order quantity sums full differing months and actual partial-month days', () => {
  const months=Array.from({length:12},(_,i)=>`2026-${String(i+1).padStart(2,'0')}`)
  const raw={sku:'SYN',name:'Synthetic',unit:'m',on_hand:0,supplier_days:0,monthly_sales:[50,150,...Array(10).fill(100)],receipts:{}}
  const item=calculate([raw],months,'2026-12-31',6)[0]
  const settings={...context.helpers.DEFAULT_ORDER_SETTINGS,months_of_cover:2}
  const guidance=context.helpers.orderGuidance(item,'2027-01-01',settings)
  assert.equal(guidance.endpoint,'2027-03-02')
  assert.equal(guidance.quantity,207) // ceil(50 + 150 + 100*2/31)
  assert.equal(guidance.runout_date,'2027-01-01')
  const incoming=calculate([{...raw,receipts:{'2027-02':10}}],months,'2026-12-31',6)[0]
  assert.equal(context.helpers.orderGuidance(incoming,'2027-01-01',settings).quantity,197)
  assert.equal(context.helpers.orderGuidance(item,'2027-01-01',{...settings,product_overrides:{SYN:{minimum_order:220,pack_size:12}}}).quantity,228)
  for (const [sales,expected] of [[[150,50,...Array(10).fill(100)],'2027-01-16'],[[50,150,...Array(10).fill(100)],'2027-02-05']]) {
    const row=calculate([{...raw,on_hand:75,monthly_sales:sales}],months,'2026-12-31',6)[0]
    assert.equal(row.runout_day,expected)
    assert.equal(context.helpers.orderGuidance(row,'2026-12-31',settings).runout_date,expected)
  }
  const sample=sampleResults()[0]
  assert.deepEqual(plain(sample.projection.map(r=>r.demand)),[5689,4789,5282,5523,4504,3962])
  assert.equal(sample.runout_day,'2027-04-01')
})

test('seasonal Python/JS sample and synthetic stress parity, including decimals and year 9998', async () => {
  const {spawnSync}=await import('node:child_process')
  const cases=[{items:plain(SAMPLE.items),months:plain(SAMPLE.months),as_of:SAMPLE.as_of}]
  for (const fixture of Object.values(visualStress)) if(fixture?.items?.length) cases.push({...fixture,items:fixture.items.slice(0,8)})
  const months=Array.from({length:12},(_,i)=>`9998-${String(i+1).padStart(2,'0')}`)
  for (const sales of [Array(12).fill(0),Array(12).fill(0.1),[1e12,0.000001,...Array(10).fill(999999999999.9999)]])
    cases.push({months,as_of:'9998-12-31',items:[{sku:'EDGE',name:'Synthetic',unit:'m',on_hand:100,supplier_days:0,monthly_sales:sales,receipts:{}}]})
  const py=spawnSync(process.env.PYTHON||'python3',['-c','import json,sys; from engine import forecast; data=json.load(sys.stdin); print(json.dumps([[forecast(i,d["months"],d["as_of"],12) for i in d["items"]] for d in data]))'],{input:JSON.stringify(cases),encoding:'utf8'})
  assert.equal(py.status,0,py.stderr)
  const expected=JSON.parse(py.stdout)
  cases.forEach((d,c)=>calculate(d.items,d.months,d.as_of,12).forEach((row,i)=>{
    assert.equal(row.held,expected[c][i].held,`held case ${c}/${i}`)
    if (!row.held) for(const key of ['monthly_demand','seasonal','projection','runout_day','order_by','error_percent','grade'])
      assert.deepEqual(plain(row[key]),expected[c][i][key],`${key} case ${c}/${i}`)
  }))
})

test('owner-frozen settings, editors and historical checks remain byte-identical to baseline', async (t) => {
  const {execFileSync}=await import('node:child_process')
  // Development-history guard: skipped in published copies that do not carry the baseline commits.
  try { execFileSync('git',['cat-file','-e','f0417de^{commit}'],{stdio:'ignore'}); execFileSync('git',['cat-file','-e','17759b9^{commit}'],{stdio:'ignore'}) } catch { t.skip('baseline commits not in this checkout'); return }
  // f0417de = 17759b9 + owner-approved settings label/hint text only (same maths).
  const baseline=execFileSync('git',['show','f0417de:desktop/plugin.js'],{encoding:'utf8'})
  for(const [start,end] of [['export const DEFAULT_ORDER_SETTINGS','const dateOrdinal ='],["      // Owner 'align this'",'function defaultHorizon('],['      const check =','      const total =']])
    assert.equal(source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))),baseline.slice(baseline.indexOf(start),baseline.indexOf(end,baseline.indexOf(start))))
  const engine=fs.readFileSync(new URL('../engine.py',import.meta.url),'utf8')
  const oldEngine=execFileSync('git',['show','17759b9:engine.py'],{encoding:'utf8'})
  assert.equal(engine.slice(engine.indexOf('def backtest'),engine.indexOf('def inventory_history')),oldEngine.slice(oldEngine.indexOf('def backtest'),oldEngine.indexOf('def inventory_history')))
})

test('polish snapshot guard rejects any changed pure block or backend/sample bytes', async () => {
  const {createRequire}=await import('node:module')
  const realRequire=createRequire(import.meta.url)
  const guardSource=fs.readFileSync(new URL('../docs/capture-polish.cjs',import.meta.url),'utf8')
  const block=guardSource.slice(guardSource.indexOf('function logicGuard()'),guardSource.indexOf('\nconst labelIndex'))
  for (const changed of [null,'desktop/plugin.js','engine.py','sources.py','tools.py','data/sample.json']) {
    const scope=vm.createContext({assert,Buffer,require:realRequire,fs:{readFileSync:(file,encoding)=>{
      const value=fs.readFileSync(file,encoding)
      if(file!==changed) return value
      if(file==='desktop/plugin.js') return value.replace('const SAMPLE =','const SAMPLE = /* mutation */')
      return encoding ? value+'\nmutation' : Buffer.concat([value,Buffer.from('\nmutation')])
    }}})
    vm.runInContext(block+'\nglobalThis.runGuard=logicGuard',scope)
    if (changed) assert.throws(()=>scope.runGuard(),/changed from seasonal snapshot/)
    else assert.equal(scope.runGuard().byteIdentical,true)
  }
})

test('seasonal and short-history chart copy accurately describes the selected method', () => {
  const long=sampleResults()[0]
  const short=calculate([{...plain(SAMPLE.items[0]),monthly_sales:[10,20,30]}],plain(SAMPLE.months.slice(-3)),SAMPLE.as_of,6)[0]
  const seasonal=textValues(nodes(renderComponent('Chart',{item:long,months:SAMPLE.months}))).join(' ')
  assert.match(seasonal,/Forecast follows last year's seasonal pattern, scaled to the last 3 months/)
  assert.match(seasonal,/0.5–2 times average/)
  const flat=textValues(nodes(renderComponent('Chart',{item:short,months:SAMPLE.months.slice(-3)}))).join(' ')
  assert.match(flat,/Needs 12 months of sales for seasonal ups and downs/)
  assert.doesNotMatch(flat,/Forecast follows last year's|Seasonal factors/)
})


test('ERP export CSVs (SAP B1, NetSuite, Zoho, QuickBooks, Dynamics) parse in the browser exactly like Python', async () => {
  const {execFileSync}=await import('node:child_process')
  const dir=new URL('../docs/erp-examples/',import.meta.url)
  const files=fs.readdirSync(dir).filter(f=>f.endsWith('.csv')).sort()
  assert.ok(files.length>=5)
  const canon=parseCsv('sku,name,unit,on_hand,supplier_days,2026-01,2026-02,2026-03\nA-1,Widget,pcs,1200,30,100,110,120\n')
  for (const f of files) {
    const js=parseCsv(fs.readFileSync(new URL(f,dir),'utf8'))
    assert.deepEqual(js.months,canon.months,f)
    const a=js.items[0], b=canon.items[0]
    assert.equal(a.sku,b.sku,f); assert.equal(a.name,b.name,f); assert.equal(a.on_hand,b.on_hand,f)
    assert.deepEqual([...a.monthly_sales],[...b.monthly_sales],f)
    const py=JSON.parse(execFileSync(process.env.PYTHON||'python3',['-c',`import sys,types,json;from pathlib import Path;p=types.ModuleType('stock_runway');p.__path__=['.'];sys.modules['stock_runway']=p;from stock_runway.sources import load_csv;d=load_csv(sys.argv[1]);i=d['items'][0];print(json.dumps([d['months'],i['sku'],i['name'],i['unit'],i['on_hand'],i['supplier_days'],i['monthly_sales'],i.get('category')]))`,new URL(f,dir).pathname],{encoding:'utf8'}))
    assert.deepEqual([[...js.months],a.sku,a.name,a.unit,a.on_hand,a.supplier_days,[...a.monthly_sales],a.category ?? null],py,f)
  }
  for (const [label,want] of [['Jan 2026','2026-01'],['January 2026','2026-01'],['Jan-26','2026-01'],['01/2026','2026-01'],['2026/01','2026-01'],['Sept 2026','2026-09'],['Price',null],['2026-13',null],['Janx 2026',null]]) assert.equal(context.helpers.erpMonth(label),want,label)
  assert.throws(()=>parseCsv('Item Name,Qty On Hand,Jan 2026,Feb 2026,Mar 2026\nW,5,1,2,3\n'),/ERP names/)
})
