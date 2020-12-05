const test = require('tape')
const hypercore = require('hypercore')
const ram = require('random-access-memory')

const HypercoreSeekableIterator = require('..')

test('simple iterator, no bounds, block-aligned read', async t => {
  const { core, reference } = await createTestCore(2, 10)
  const ite = new HypercoreSeekableIterator(core)

  for await (const chunk of ite) {
    t.same(chunk, reference.shift())
  }
  t.same(reference.length, 0)
  t.end()
})

test('iterator with byteOffset, block-aligned read', async t => {
  const { core, reference } = await createTestCore(2, 10)
  const ite = new HypercoreSeekableIterator(core, {
    byteOffset: 10
  })

  reference.shift()
  for await (const chunk of ite) {
    t.same(chunk, reference.shift())
  }

  t.same(reference.length, 0)
  t.end()
})

test('iterator with byteOffset and byteLength, block-aligned read', async t => {
  const { core, reference } = await createTestCore(3, 10)
  const ite = new HypercoreSeekableIterator(core, {
    byteOffset: 10,
    byteLength: 10
  })

  const sliced = reference.slice(1, 2)
  for await (const chunk of ite) {
    t.same(chunk, sliced.shift())
  }

  t.same(sliced.length, 0)
  t.end()
})

test('iterator with byteOffset and byteLength, non-block-aligned read', async t => {
  const { core, reference } = await createTestCore(3, 10)
  const ite = new HypercoreSeekableIterator(core, {
    byteOffset: 10,
    byteLength: 15
  })

  const sliced = reference.slice(1)
  sliced[1] = sliced[1].slice(0, 5)

  for await (const chunk of ite) {
    t.same(chunk, sliced.shift())
  }

  t.same(sliced.length, 0)
  t.end()
})

test('iterator with byteOffset and byteLength, two non-block-aligned reads', async t => {
  const { core, reference } = await createTestCore(3, 10)
  const ite = new HypercoreSeekableIterator(core, {
    byteOffset: 15,
    byteLength: 10
  })

  const sliced = reference.slice(1)
  sliced[0] = sliced[0].slice(5)
  sliced[1] = sliced[1].slice(0, 5)

  for await (const chunk of ite) {
    t.same(chunk, sliced.shift())
  }

  t.same(sliced.length, 0)
  t.end()
})

test('iterator with byteOffset and byteLength, non-block-aligned read, added seek', async t => {
  const { core, reference } = await createTestCore(3, 10)
  const ite = new HypercoreSeekableIterator(core, {
    byteOffset: 10,
    byteLength: 15
  })

  const sliced = reference.slice(1, 3)
  sliced[1] = sliced[1].slice(0, 5)
  sliced.unshift(sliced[0])

  for await (const chunk of ite) {
    t.same(chunk, sliced.shift())
    if (sliced.length === 2) {
      ite.seek(0)
      continue
    }
  }

  t.same(sliced.length, 0)
  t.end()
})

test('empty reads', async t => {
  const { core } = await createTestCore(3, 10)

  {
    const ite = new HypercoreSeekableIterator(core, {
      byteOffset: 10,
      byteLength: 0
    })
    t.true((await ite.next()).done)
  }

  {
    const ite = new HypercoreSeekableIterator(core, {
      byteOffset: 30,
      byteLength: 30
    })
    t.true((await ite.next()).done)
  }

  t.end()
})

test('overflowing read', async t => {
  const { core, reference } = await createTestCore(3, 10)
  const ite = new HypercoreSeekableIterator(core, {
    byteOffset: 25,
    byteLength: 10
  })

  const sliced = reference.slice(2)
  sliced[0] = sliced[0].slice(5)

  for await (const chunk of ite) {
    t.same(chunk, sliced.shift())
  }

  t.same(sliced.length, 0)
  t.end()
})

async function createTestCore (numBlocks, blockLength) {
  const core = hypercore(ram)
  const reference = []
  for (let i = 0; i < numBlocks; i++) {
    const buf = Buffer.allocUnsafe(blockLength).fill('abcdefghijk')
    reference.push(buf)
    await new Promise(resolve => core.append(buf, resolve))
  }
  return { core, reference }
}
