# hypercore-seekable-iterator

A seekable AsyncIterator for Hypercores that supports AbortControllers for cancellation, and block prefetching.

By default, the iterator will linearly prefetch the next 10 blocks each time a chunk is read.

## Installation
```
npm i hypercore-seekable-iterator
```

## Example
```js
const core = hypercore(ram)
const SeekableIterator = require('hypercore-seekable-iterator')

// Assuming the core contains many blocks.

const ite = new SeekableIterator(core, {
  // Start reading at byte offset 10 in the Hypercore
  byteOffset: 10,
    // Stop reading at position 60
  byteLength: 50
})

for await (const chunk of ite) {
  // Can seek during iteration.
  // Seeking is sync, and will happen before the next chunk is yielded.
  // The seek argument is relative to the initial start position.
  if (chunk.length === 10) {
    ite.seek(0)
  }
}
```

## API

#### `const ite = new HypercoreSeekableIterator(core, opts = {})`
Create a new iterator.

Options include:
```js
  byteOffset, // The initial byte offset
  byteLength, // The size of the range to read (defines the end position)
  startBlock, // (Optimization) If you know which block the start position is in, this speeds up the first read
  endBlock,   // (Optimization) If you know which block the end position is in, this speeds up the first read,
  prefetch    // A function of the form (ite, index) => (download range)
```

#### `await ite.next()`
Yield the next chunk.

#### `ite.seek(pos)`
Seek to a numeric position relative to the initial starting byte offset (e.g. `ite.seek(0)` will return to the initial position).

### Prefetch
You can pass in a custom prefetching function to define how blocks should be downloaded in the background during iteration.

The default prefetch will always download the next 10 blocks. In the future, this will become adaptive!

A prefetch function returns arguments to Hypercore's `download` method:
```js
function customPrefetch (ite, index) {
  return { start: index + 1, end: index + 5, linear: true }
}
```
`ite` is an instance of HypercoreSeekableIterator (you can use this to determine download bounds).
`index` is the index of the current read.

## License
MIT
