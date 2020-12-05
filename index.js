const AbortController = require('abort-controller')

class SparsePrefetcher {
  constructor (opts = {}) {
    this._linear = opts.linear !== false
    this._length = opts.length || 10
  }

  prefetch (ite, index) {
    return {
      start: Math.max(index, ite.startBlock),
      end: Math.min(index + this._length, ite.endBlock),
      linear: this._linear
    }
  }
}

/* eslint-disable no-unused-vars */
class EagerPrefetcher {
  constructor (opts = {}) {
    this._linear = opts.linear !== false
    this._done = false
  }

  prefetch (ite) {
    if (this._done) return null
    this._done = true
    return { start: ite.startBlock, end: ite.endBlock, linear: this._linear }
  }
}
/* eslint-enable no-unused-vars */

module.exports = class HypercoreSeekableIterator {
  constructor (core, opts = {}) {
    this.core = core

    this.start = opts.byteOffset >= 0 ? opts.byteOffset : 0
    this.end = opts.byteLength >= 0 ? Math.min(this.start + opts.byteLength, core.byteLength) : core.byteLength
    this.startBlock = this.start === 0 ? 0 : opts.startBlock
    this.endBlock = this.end === core.byteLength ? this.core.length - 1 : opts.endBlock

    this.position = this.start

    this._controller = new AbortController()
    this._prefetcher = opts.prefetcher || new SparsePrefetcher(opts)
    this._lastPrefetch = null

    this._seeking = this.position
    this._opened = false
    this._destroyed = false

    this._index = null
    this._relativeOffset = null

    // TODO: Does this need to be unregistered on destroy?
    if (opts.signal) opts.signal.on('abort', () => this._destroy())
  }

  async _open () {
    if (this._opened) return
    this._opened = true
    const [startPos, endPos] = await Promise.all([
      this._seek(),
      this.endBlock !== undefined ? { index: this.endBlock } : seek(this.core, this.end)
    ])
    this.startBlock = startPos.index
    this.endBlock = endPos.index
  }

  _destroy () {
    if (this._destroyed) return { value: undefined, done: true }
    this._destroyed = true
    this._controller.abort()
    if (this._lastPrefetch) this.core.undownload(this._lastPrefetch)
    return { value: undefined, done: true }
  }

  async _seek () {
    this._seeking = Math.min(Math.max(this._seeking, 0), this.core.byteLength)
    const next = await seek(this.core, this._seeking, { signal: this._controller.signal })
    this.position = this._seeking

    this._index = next.index
    this._relativeOffset = next.relativeOffset
    this._seeking = null

    return next
  }

  async next () {
    if (this.position < this.start || this.position >= this.end) return this._destroy()
    if (!this._opened) await this._open()
    if (this._seeking !== null) {
      await this._seek()
      return this.next()
    }

    const prefetch = this._prefetcher.prefetch(this, this._index)
    if (prefetch) {
      if (this._lastPrefetch) this.core.undownload(this._lastPrefetch)
      this._lastPrefetch = this.core.download(prefetch)
    }

    let block = await get(this.core, this._index, { signal: this._controller.signal })
    const remainder = this.end - this.position
    if (this._relativeOffset || (remainder < block.length)) {
      block = block.slice(this._relativeOffset, this._relativeOffset + remainder)
    }

    this._index++
    this._relativeOffset = 0
    this.position += block.length

    return { value: block, done: false }
  }

  seek (byteOffset) {
    this._seeking = this.start + byteOffset
  }

  throw () {
    return this._destroy()
  }

  return () {
    return this._destroy()
  }

  [Symbol.asyncIterator] () {
    return this
  }
}

function get (core, idx, opts) {
  return new Promise((resolve, reject) => {
    core.get(idx, opts, (err, block) => {
      if (err) return reject(err)
      return resolve(block)
    })
  })
}

function seek (core, byteOffset, opts) {
  return new Promise((resolve, reject) => {
    core.seek(byteOffset, opts, (err, index, relativeOffset) => {
      if (err) return reject(err)
      return resolve({ index, relativeOffset })
    })
  })
}
