
// Idempotent: safe to re-run against a server that already has some/all of
// these definitions (matches by customer + name, creates only what's
// missing, and always re-applies the Pacific Crest threshold PATCH).
// Run with the server already up: `npm run apply-rule-queue` (loads PORT
// from .env via dotenv.config.ts, same convention as seed.ts).
const BASE = process.env.APPLY_RULE_QUEUE_BASE_URL ?? `http://localhost:${process.env.PORT ?? 4000}/api`

type Json = Record<string, unknown>

async function api<T = Json>(method: string, path: string, body?: Json): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : undefined
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${text}`)
  }
  return data as T
}

async function getCustomerIdByName(name: string): Promise<string> {
  const customers = await api<Json[]>('GET', '/customers')
  const match = customers.find(c => c.name === name)
  if (!match) throw new Error(`Customer not found: ${name}`)
  return match._id as string
}

async function findDefinitionByName(customerId: string, name: string): Promise<Json | undefined> {
  const defs = await api<Json[]>('GET', `/task-definitions?customerId=${customerId}`)
  return defs.find(d => d.name === name)
}

async function ensureDefinition(customerId: string, def: Json): Promise<{ action: 'created' | 'skipped'; id: string }> {
  const existing = await findDefinitionByName(customerId, def.name as string)
  if (existing) {
    console.log(`  [skip] "${def.name}" already exists (${existing._id})`)
    return { action: 'skipped', id: existing._id as string }
  }
  const created = await api<Json>('POST', '/task-definitions', { customerId, ...def })
  console.log(`  [create] "${def.name}" -> ${created._id}`)
  return { action: 'created', id: created._id as string }
}

async function main() {
  console.log(`Applying rule queue against ${BASE} ...\n`)

  const pacificCrestId = await getCustomerIdByName('Pacific Crest Homes')
  const redlineId = await getCustomerIdByName('Redline Realty')
  const harborMainId = await getCustomerIdByName('Harbor & Main')

  // --- Threshold change: Pacific Crest "High-value flag", $500k -> $750k ---
  console.log('Pacific Crest Homes: High-value flag threshold -> $750,000')
  const highValueFlag = await findDefinitionByName(pacificCrestId, 'High-value flag')
  if (!highValueFlag) throw new Error('Pacific Crest "High-value flag" definition not found — was seed run?')
  const currentPredicates = highValueFlag.predicates as Json[]
  const alreadyApplied = currentPredicates.some(p => p.key === 'purchasePrice' && p.value === 750000)
  if (alreadyApplied) {
    console.log(`  [skip] already at $750,000 (${highValueFlag._id})`)
  } else {
    const updated = await api('PATCH', `/task-definitions/${highValueFlag._id}`, {
      predicates: [{ key: 'purchasePrice', op: 'gte', value: 750000 }],
      description: 'Flag transactions over $750k for review.',
    })
    console.log(`  [update] ${highValueFlag._id} ->`, JSON.stringify((updated as Json).predicates))
  }

  // --- Pacific Crest #1: FHA -> appraisal-timeline note ---
  console.log('\nPacific Crest Homes: #1 FHA appraisal note')
  await ensureDefinition(pacificCrestId, {
    name: 'FHA appraisal timeline note',
    description: 'Remind the coordinator to check FHA appraisal timelines when financing is set to FHA.',
    watchedKeys: ['financingType'],
    predicates: [{ key: 'financingType', op: 'eq', value: 'fha' }],
    actions: [
      {
        type: 'createNote',
        config: { body: 'Financing set to FHA — check FHA appraisal timelines for {{propertyAddress}}.' },
      },
    ],
    enabled: true,
  })

  // --- Pacific Crest #2: failed inspection on FHA/VA -> email ---
  console.log('\nPacific Crest Homes: #2 failed inspection (FHA/VA) email')
  await ensureDefinition(pacificCrestId, {
    name: 'Failed inspection email (FHA/VA)',
    description: 'Email the customer when an inspection fails on an FHA or VA financed deal. Cash deals are not covered.',
    watchedKeys: ['inspectionStatus', 'financingType'],
    predicates: [
      { key: 'inspectionStatus', op: 'eq', value: 'failed' },
      { key: 'financingType', op: 'in', value: ['fha', 'va'] },
    ],
    actions: [
      {
        type: 'sendEmail',
        config: {
          to: '{{customerContactEmail}}',
          subject: 'Failed inspection on {{financingType}} deal: {{propertyAddress}}',
          body: 'Inspection failed on a {{financingType}}-financed deal at {{propertyAddress}}. Please follow up.',
        },
      },
    ],
    enabled: true,
  })

  // --- Redline #4a: earnest money < 5% of price, non-FHA -> flag ---
  console.log('\nRedline Realty: #4a low earnest money flag (non-FHA)')
  await ensureDefinition(redlineId, {
    name: 'Low earnest money flag',
    description: 'Flag when earnest money is below 5% of purchase price, except on FHA deals (see "Low earnest money FHA email").',
    watchedKeys: ['earnestMoneyAmount', 'purchasePrice', 'financingType'],
    predicates: [
      { key: 'earnestMoneyAmount', op: 'lt', value: { $field: 'purchasePrice', multiplier: 0.05 } },
      { key: 'financingType', op: 'ne', value: 'fha' },
    ],
    actions: [{ type: 'setFlag', config: { flagName: 'lowEarnestMoney', value: true } }],
    enabled: true,
  })

  // --- Redline #4b: earnest money < 5% of price, FHA -> email instead ---
  console.log('\nRedline Realty: #4b low earnest money email (FHA)')
  await ensureDefinition(redlineId, {
    name: 'Low earnest money FHA email',
    description: 'On FHA deals, email the coordinator instead of flagging when earnest money is below 5% of purchase price.',
    watchedKeys: ['earnestMoneyAmount', 'purchasePrice', 'financingType'],
    predicates: [
      { key: 'earnestMoneyAmount', op: 'lt', value: { $field: 'purchasePrice', multiplier: 0.05 } },
      { key: 'financingType', op: 'eq', value: 'fha' },
    ],
    actions: [
      {
        type: 'sendEmail',
        config: {
          to: '{{editorEmail}}',
          subject: 'Low earnest money on FHA deal: {{propertyAddress}}',
          body: 'Earnest money ({{earnestMoneyAmount}}) is below 5% of purchase price ({{purchasePrice}}) on this FHA deal.',
        },
      },
    ],
    enabled: true,
  })

  // --- Harbor & Main #5: closing <7 days + inspection pending -> flag + email ---
  console.log('\nHarbor & Main: #5 closing soon + inspection pending')
  await ensureDefinition(harborMainId, {
    name: 'Closing soon with inspection pending',
    description: 'Flag and email when closing is within 7 days and inspection is still pending.',
    watchedKeys: ['closingDate', 'inspectionStatus'],
    predicates: [
      { key: 'closingDate', op: 'daysUntilLte', value: 7 },
      { key: 'inspectionStatus', op: 'eq', value: 'pending' },
    ],
    actions: [
      { type: 'setFlag', config: { flagName: 'closingSoonInspectionPending', value: true } },
      {
        type: 'sendEmail',
        config: {
          to: '{{customerContactEmail}}',
          subject: 'Closing soon, inspection still pending: {{propertyAddress}}',
          body: 'Closing for {{propertyAddress}} is within 7 days and inspection status is still pending.',
        },
      },
    ],
    enabled: true,
  })

  // --- Harbor & Main #6: cash deal -> auto-set Harbor Title ---
  console.log('\nHarbor & Main: #6 cash deal -> Harbor Title')
  await ensureDefinition(harborMainId, {
    name: 'Cash deal default title company',
    description: 'On cash deals, automatically set title company to Harbor Title.',
    watchedKeys: ['financingType'],
    predicates: [{ key: 'financingType', op: 'eq', value: 'cash' }],
    actions: [{ type: 'setField', config: { key: 'titleCompany', value: 'Harbor Title' } }],
    enabled: true,
  })

  // --- Harbor & Main #7: titleCompany set/changed -> email agent ---
  console.log('\nHarbor & Main: #7 title company change -> email agent')
  await ensureDefinition(harborMainId, {
    name: 'Title company change agent notice',
    description: 'Email the agent whenever title company is set or changes (including the automatic cash-deal case).',
    watchedKeys: ['titleCompany'],
    predicates: [{ key: 'titleCompany', op: 'exists' }],
    actions: [
      {
        type: 'sendEmail',
        config: {
          to: '{{agentEmail}}',
          subject: 'Title company update: {{propertyAddress}}',
          body: 'Title company for {{propertyAddress}} is now {{titleCompany}}. Earnest money will be directed there.',
        },
      },
    ],
    enabled: true,
  })

  console.log('\nDone.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
