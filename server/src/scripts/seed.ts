import mongoose from 'mongoose'
import { connectMongo, disconnectMongo } from '../db'
import { Customer } from '../models/Customer'
import { Transaction } from '../models/Transaction'
import { SourceOfTruth } from '../models/SourceOfTruth'
import { TaskDefinition } from '../models/TaskDefinition'
import { AuditLogEntry } from '../models/AuditLogEntry'
import { TaskExecution } from '../models/TaskExecution'
import { EmailLog } from '../models/EmailLog'
import { Note } from '../models/Note'

const daysFromNow = (d: number) => {
  const x = new Date()
  x.setDate(x.getDate() + d)
  return x
}

async function clear() {
  await Promise.all([
    Customer.deleteMany({}),
    Transaction.deleteMany({}),
    SourceOfTruth.deleteMany({}),
    TaskDefinition.deleteMany({}),
    AuditLogEntry.deleteMany({}),
    TaskExecution.deleteMany({}),
    EmailLog.deleteMany({}),
    Note.deleteMany({}),
  ])
}

type Customers = { redline: any; pacificCrest: any; harborMain: any }

async function seedCustomers(): Promise<Customers> {
  const [redline, pacificCrest, harborMain] = await Customer.create([
    { name: 'Redline Realty' },
    { name: 'Pacific Crest Homes' },
    { name: 'Harbor & Main' },
  ])
  return { redline, pacificCrest, harborMain }
}

async function seedTransactions(customers: Customers) {
  const { redline, pacificCrest, harborMain } = customers
  const definitions = [
    { customer: redline, address: '142 Cherry Lane, Austin TX', status: 'active', fields: { propertyAddress: '142 Cherry Lane, Austin TX', purchasePrice: 875000, closingDate: daysFromNow(45), buyerName: 'Patel Family', sellerName: 'Lopez Family', agentName: 'Marisol Vega', agentEmail: 'marisol.vega@homefinder.test', inspectionStatus: 'scheduled', financingType: 'conventional', earnestMoneyAmount: 25000, titleCompany: 'Lone Star Title' } },
    { customer: redline, address: '88 Beachview Dr, Santa Cruz CA', status: 'active', fields: { propertyAddress: '88 Beachview Dr, Santa Cruz CA', purchasePrice: 2400000, closingDate: daysFromNow(28), buyerName: 'A. Chen', sellerName: 'P. Murphy', agentName: 'Devon Park', agentEmail: 'devon.park@coastalrealty.test', inspectionStatus: 'pending', financingType: 'cash', earnestMoneyAmount: 200000, titleCompany: 'Coastal Title Co' } },
    { customer: pacificCrest, address: '512 Maple Ave, Denver CO', status: 'active', fields: { propertyAddress: '512 Maple Ave, Denver CO', purchasePrice: 645000, closingDate: daysFromNow(60), buyerName: 'J. Reyes', sellerName: 'M. Klein', agentName: 'Bailey Tran', agentEmail: 'bailey.tran@rockyrealty.test', inspectionStatus: 'complete', financingType: 'fha', earnestMoneyAmount: 15000, titleCompany: 'Mile High Title' } },
    { customer: pacificCrest, address: '7 Riverbend Ct, Portland OR', status: 'active', fields: { propertyAddress: '7 Riverbend Ct, Portland OR', purchasePrice: 1100000, closingDate: daysFromNow(75), buyerName: 'Karim Bros', sellerName: 'A. Schultz', agentName: 'Sloane Park', agentEmail: 'sloane.park@bridgetown.test', inspectionStatus: 'scheduled', financingType: 'conventional', earnestMoneyAmount: 40000, titleCompany: 'Stumptown Title' } },
    { customer: redline, address: '900 Sunset Blvd, Los Angeles CA', status: 'closed', fields: { propertyAddress: '900 Sunset Blvd, Los Angeles CA', purchasePrice: 3200000, closingDate: daysFromNow(-21), buyerName: 'Hollywood LLC', sellerName: 'Sunset Trust', agentName: 'Rae Holloway', agentEmail: 'rae@hwoodrealty.test', inspectionStatus: 'complete', financingType: 'cash', earnestMoneyAmount: 300000, titleCompany: 'Pacific Title' } },
    { customer: pacificCrest, address: '23 Birch St, Burlington VT', status: 'closed', fields: { propertyAddress: '23 Birch St, Burlington VT', purchasePrice: 410000, closingDate: daysFromNow(-90), buyerName: 'M. Caron', sellerName: 'D. Berlin', agentName: 'Alex Lake', agentEmail: 'alex@greenmtn.test', inspectionStatus: 'complete', financingType: 'va', earnestMoneyAmount: 8000, titleCompany: 'Green Mountain Title' } },
    { customer: harborMain, address: '301 Pine Trail, Asheville NC', status: 'active', fields: { propertyAddress: '301 Pine Trail, Asheville NC', purchasePrice: 580000, closingDate: daysFromNow(7), buyerName: 'F. Yamato', sellerName: 'L. Ross', agentName: 'Camille Boyd', agentEmail: 'camille.boyd@blueridge.test', inspectionStatus: 'pending', financingType: 'conventional', earnestMoneyAmount: 18000 } },
    { customer: harborMain, address: '14 Echo Way, Boise ID', status: 'active', fields: {} },
    { customer: redline, address: '19 Alder Ct, Boise ID', status: 'active', fields: { propertyAddress: '19 Alder Ct, Boise ID', purchasePrice: '875,000', closingDate: daysFromNow(40), buyerName: 'T. Okafor', sellerName: 'R. Lindqvist', agentName: 'Marisol Vega', agentEmail: 'marisol.vega@homefinder.test', inspectionStatus: 'scheduled', financingType: 'conventional', earnestMoneyAmount: '$15,000', titleCompany: 'Gem State Title' } },
    { customer: redline, address: '4 Juniper Way, Reno NV', status: 'active', fields: { propertyAddress: '4 Juniper Way, Reno NV', purchasePrice: 600000, closingDate: daysFromNow(33), buyerName: 'S. Varga', sellerName: 'K. Oduya', agentName: 'Devon Park', agentEmail: 'devon.park@coastalrealty.test', inspectionStatus: 'complete', financingType: 'conventional', earnestMoneyAmount: 30000, titleCompany: 'Sierra Title' } },
    { customer: redline, address: '77 Mesa Verde Dr, Tucson AZ', status: 'active', fields: { propertyAddress: '77 Mesa Verde Dr, Tucson AZ', purchasePrice: 0, closingDate: daysFromNow(90), buyerName: 'Delgado Trust', sellerName: 'N. Haas', agentName: 'Rae Holloway', agentEmail: 'rae@hwoodrealty.test', inspectionStatus: 'pending', financingType: 'cash', earnestMoneyAmount: 5000 } },
    { customer: pacificCrest, address: '260 Lakeshore Rd, Tahoe CA', status: 'active', fields: { propertyAddress: '260 Lakeshore Rd, Tahoe CA', purchasePrice: 720000, closingDate: daysFromNow(12).toISOString().slice(0, 10), buyerName: 'L. Brennan', sellerName: 'The Moss Family', agentName: 'Bailey Tran', agentEmail: 'bailey.tran@rockyrealty.test', inspectionStatus: 'failed', financingType: 'FHA', earnestMoneyAmount: 20000, titleCompany: 'Tahoe Title' } },
    { customer: harborMain, address: '5 Orchard Ln, Burlington VT', status: 'active', fields: { propertyAddress: '5 Orchard Ln, Burlington VT', purchasePrice: 455000, closingDate: daysFromNow(5), buyerName: 'P. Nakamura', sellerName: 'G. Oyelaran', agentName: 'Camille Boyd', agentEmail: 'camille.boyd@blueridge.test', inspectionStatus: 'scheduled', financingType: 'va', earnestMoneyAmount: 14000, titleCompany: 'Green Mountain Title' } },
  ]

  for (const def of definitions) {
    const txn = await Transaction.create({ customerId: def.customer._id, address: def.address, status: def.status as any })
    await SourceOfTruth.create({ transactionId: txn._id, fields: def.fields })
  }
}

async function seedTaskDefinitions(customers: Customers) {
  const { redline, pacificCrest, harborMain } = customers
  await TaskDefinition.create([
    {
      customerId: redline._id,
      name: 'High-value flag',
      description: 'Flag transactions over $1M for review.',
      watchedKeys: ['purchasePrice'],
      predicates: [{ key: 'purchasePrice', op: 'gte', value: 1000000 }],
      actions: [{ type: 'setFlag', config: { flagName: 'highValue', value: true } }],
      enabled: true,
    },
    {
      customerId: redline._id,
      name: 'High-value email',
      description: 'Notify the agent on a high-value transaction.',
      watchedKeys: ['purchasePrice', 'agentEmail'],
      predicates: [
        { key: 'purchasePrice', op: 'gte', value: 1000000 },
        { key: 'agentEmail', op: 'exists' },
      ],
      actions: [
        {
          type: 'sendEmail',
          config: {
            to: '{{agentEmail}}',
            subject: 'High-value transaction: {{propertyAddress}}',
            body: 'Heads up — purchase price is now {{purchasePrice}}. Please confirm financing details.',
          },
        },
      ],
      enabled: true,
    },
    {
      // Pacific Crest wanted the same high-value alert as Redline, but at their own
      // threshold — so it got copied and tweaked. This is how per-customer rules
      // are managed today.
      customerId: pacificCrest._id,
      name: 'High-value flag',
      description: 'Flag transactions over $500k for review.',
      watchedKeys: ['purchasePrice'],
      predicates: [{ key: 'purchasePrice', op: 'gte', value: 500000 }],
      actions: [{ type: 'setFlag', config: { flagName: 'highValue', value: true } }],
      enabled: true,
    },
    {
      customerId: pacificCrest._id,
      name: 'Inspection reminder',
      description: 'Add a note when inspection is incomplete and closing is set.',
      watchedKeys: ['inspectionStatus', 'closingDate'],
      predicates: [
        { key: 'inspectionStatus', op: 'ne', value: 'complete' },
        { key: 'closingDate', op: 'exists' },
      ],
      actions: [
        {
          type: 'createNote',
          config: { body: 'Inspection still pending; closing date {{closingDate}}.' },
        },
      ],
      enabled: true,
    },
    {
      customerId: redline._id,
      name: 'Cash deal flag',
      description: 'Flag cash deals.',
      watchedKeys: ['financingType'],
      predicates: [{ key: 'financingType', op: 'eq', value: 'cash' }],
      actions: [{ type: 'setFlag', config: { flagName: 'cashDeal', value: true } }],
      enabled: true,
    },
    {
      customerId: harborMain._id,
      name: 'Title company missing',
      description: 'Create a note when title company is missing close to closing.',
      watchedKeys: ['titleCompany', 'closingDate'],
      predicates: [
        { key: 'closingDate', op: 'exists' },
        { key: 'titleCompany', op: 'notExists' },
      ],
      actions: [{ type: 'createNote', config: { body: 'Title company not yet selected.' } }],
      enabled: true,
    },
    {
      customerId: harborMain._id,
      name: 'Failed inspection note',
      description: 'Add a note when an inspection fails.',
      watchedKeys: ['inspectonStatus'],
      predicates: [{ key: 'inspectonStatus', op: 'eq', value: 'failed' }],
      actions: [{ type: 'createNote', config: { body: 'Inspection failed; schedule a re-inspection.' } }],
      enabled: true,
    },
  ])
}

async function main() {
  await connectMongo()
  // eslint-disable-next-line no-console
  console.log('Clearing collections...')
  await clear()
  // eslint-disable-next-line no-console
  console.log('Seeding customers...')
  const customers = await seedCustomers()
  // eslint-disable-next-line no-console
  console.log('Seeding transactions...')
  await seedTransactions(customers)
  // eslint-disable-next-line no-console
  console.log('Seeding task definitions...')
  await seedTaskDefinitions(customers)
  // eslint-disable-next-line no-console
  console.log('Done.')
  await disconnectMongo()
  await mongoose.connection.close()
}

main().catch(err => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(1)
})
