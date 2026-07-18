import assert from 'assert';
import { performance } from 'perf_hooks';
import '../test/helpers/register-happy-dom.js';
import { AvenxComponent } from '../lib/core/runtime/AvenxComponent.js';
import { RAW_SYMBOL, PROXY_REF_SYMBOL } from '../lib/core/reactive/proxyHandler.js';

// Helper to generate 10,000 nested array elements
function createNestedItems(count) {
  const items = [];
  for (let i = 0; i < count; i++) {
    items.push({
      index: i,
      details: {
        title: `Item ${i}`,
        nested: {
          value: i,
        },
      },
    });
  }
  return items;
}

const count = 10000;
const iterations = 30;
const trials = 5;

function runBenchmark(bypassSymbol) {
  // Set the global bypass flag
  globalThis.__avenx_bypass_symbol__ = bypassSymbol;

  const itemsArray = createNestedItems(count);
  const template = '<div>{{ items.length }}</div>';

  const component = new AvenxComponent(
    { items: itemsArray },
    {},
    {},
    template,
    {}
  );

  const containerEl = document.createElement('div');
  component.mount(containerEl);

  // Warmup
  for (let iter = 0; iter < 5; iter++) {
    for (let i = 0; i < count; i++) {
      const item = component.state.items[i];
      const val1 = item.details.nested.value;
      const val2 = item.details.title;
      const val3 = item.index;
    }
  }

  // Assert optimization state on raw targets
  if (!bypassSymbol) {
    const rawItems = component.state.items[RAW_SYMBOL];
    assert.ok(rawItems[PROXY_REF_SYMBOL], 'PROXY_REF_SYMBOL should be defined on raw items array');
    const rawItem0 = component.state.items[0][RAW_SYMBOL];
    assert.ok(rawItem0[PROXY_REF_SYMBOL], 'PROXY_REF_SYMBOL should be defined on raw item 0');
    const rawDetails = component.state.items[0].details[RAW_SYMBOL];
    assert.ok(rawDetails[PROXY_REF_SYMBOL], 'PROXY_REF_SYMBOL should be defined on raw details');
  }

  let minTime = Infinity;

  for (let trial = 0; trial < trials; trial++) {
    const start = performance.now();
    for (let iter = 0; iter < iterations; iter++) {
      for (let i = 0; i < count; i++) {
        const item = component.state.items[i];
        const val1 = item.details.nested.value;
        const val2 = item.details.title;
        const val3 = item.index;
      }
    }
    const end = performance.now();
    const timeTaken = end - start;
    if (timeTaken < minTime) {
      minTime = timeTaken;
    }
  }

  // Reset flag
  globalThis.__avenx_bypass_symbol__ = false;

  return minTime;
}

function main() {
  console.log(`Running Reactivity Lookup Benchmark with nested structure of ${count} array elements...`);

  // Run 1: WeakMap-only lookups (bypassSymbol = true)
  const timeWeakMap = runBenchmark(true);
  console.log(`[WeakMap-only] Minimum time for ${iterations} iterations: ${timeWeakMap.toFixed(2)}ms`);
  const avgWeakMap = timeWeakMap / iterations;
  console.log(`[WeakMap-only] Average time per iteration: ${avgWeakMap.toFixed(4)}ms`);

  // Run 2: Symbol-optimized lookups (bypassSymbol = false)
  const timeSymbol = runBenchmark(false);
  console.log(`[Symbol-optimized] Minimum time for ${iterations} iterations: ${timeSymbol.toFixed(2)}ms`);
  const avgSymbol = timeSymbol / iterations;
  console.log(`[Symbol-optimized] Average time per iteration: ${avgSymbol.toFixed(4)}ms`);

  // Calculate speedup
  const reduction = ((timeWeakMap - timeSymbol) / timeWeakMap) * 100;
  console.log(`\nCPU processing time reduction (best of ${trials} trials): ${reduction.toFixed(2)}%`);

  // Verify it meets the 15% reduction requirement
  assert.ok(reduction >= 15, `Expected at least a 15% reduction in CPU processing time, but got ${reduction.toFixed(2)}%`);
  console.log('✅ Reactivity Lookup Optimization meets/exceeds the 15% threshold!');
}

main();
