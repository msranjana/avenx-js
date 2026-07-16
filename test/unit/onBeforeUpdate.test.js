import assert from 'assert';
import '../helpers/register-happy-dom.js';
import { AvenxComponent } from '../../lib/core/runtime/AvenxComponent.js';

let loggedErrors = [];
const originalConsoleError = console.error;

function hookConsoleError() {
  loggedErrors = [];
  console.error = (...args) => {
    loggedErrors.push(args.join(' '));
  };
}

function restoreConsoleError() {
  console.error = originalConsoleError;
}

async function testOnBeforeUpdate() {
  console.log('🧪 Testing onBeforeUpdate lifecycle hook...');

  hookConsoleError();

  // Test 1: runs before DOM patch and can access current DOM state
  let beforeUpdateCalled = false;
  let updateCalled = false;
  let domContentInBeforeUpdate = '';
  let domContentInUpdate = '';

  const comp = new AvenxComponent(
    { count: 0 },
    {},
    {},
    '<div>Counter: {{ count }}</div>',
    {
      onBeforeUpdate() {
        beforeUpdateCalled = true;
        const el = this._getElement();
        domContentInBeforeUpdate = el ? el.innerHTML : '';
      },
      onUpdate() {
        updateCalled = true;
        const el = this._getElement();
        domContentInUpdate = el ? el.innerHTML : '';
      }
    }
  );

  const root = document.createElement('div');
  comp.mount(root); // Standard mount, which calls initial render

  // Wait for initial render microtask to clear
  await comp.nextTick();

  // Initial render should have completed, but did not trigger beforeUpdate/onUpdate (since they only run on reactive updates)
  assert.strictEqual(beforeUpdateCalled, false, 'onBeforeUpdate should not run during initial mount');
  assert.strictEqual(updateCalled, false, 'onUpdate should not run during initial mount');
  assert.ok(root.innerHTML.includes('Counter: 0'), 'Initial DOM should be rendered');

  // Now trigger update by mutating state reactively
  comp.state.count = 1;
  await comp.nextTick(); // Wait for reactive update to flush

  assert.strictEqual(beforeUpdateCalled, true, 'onBeforeUpdate should be called');
  assert.strictEqual(updateCalled, true, 'onUpdate should be called');
  assert.ok(domContentInBeforeUpdate.includes('Counter: 0'), 'onBeforeUpdate should see old DOM state: ' + domContentInBeforeUpdate);
  assert.ok(domContentInUpdate.includes('Counter: 1'), 'onUpdate should see new DOM state: ' + domContentInUpdate);

  console.log('  ✅ onBeforeUpdate runs before DOM patch and accesses current DOM successfully.');

  // Test 2: Hook failures are caught and logged with AVX_R12
  loggedErrors = [];
  let beforeUpdateErrorCalled = false;
  const compError = new AvenxComponent(
    { count: 0 },
    {},
    {},
    '<div>Counter: {{ count }}</div>',
    {
      onBeforeUpdate() {
        beforeUpdateErrorCalled = true;
        throw new Error('Simulated onBeforeUpdate error');
      }
    }
  );

  const rootError = document.createElement('div');
  compError.mount(rootError);

  // Wait for initial render microtask to clear
  await compError.nextTick();

  compError.state.count = 1;
  await compError.nextTick(); // Wait for reactive update to flush (error logged by scheduler)

  assert.strictEqual(beforeUpdateErrorCalled, true, 'onBeforeUpdate should run and throw');
  assert.strictEqual(loggedErrors.length, 1, 'Should log exactly one error');
  assert.ok(loggedErrors[0].includes('AVX_R12'), 'Logged error should contain code AVX_R12');
  assert.ok(loggedErrors[0].includes('onBeforeUpdate'), 'Logged error should contain onBeforeUpdate identifier');
  assert.ok(loggedErrors[0].includes('Simulated onBeforeUpdate error'), 'Logged error should contain original error message');

  console.log('  ✅ onBeforeUpdate errors are caught and logged as AVX_R12.');

  // Test 3: State mutation inside onBeforeUpdate throws AVX_R11 (STATE_MUTATION_IN_UPDATE)
  loggedErrors = [];
  let mutationHookCalled = false;
  let errorThrown = null;

  const compMutation = new AvenxComponent(
    { count: 0 },
    {},
    {},
    '<div>Counter: {{ count }}</div>',
    {
      onBeforeUpdate() {
        mutationHookCalled = true;
        this.count = 42; // Attempting to mutate reactive state
      }
    }
  );

  const rootMutation = document.createElement('div');
  compMutation.mount(rootMutation);

  // Wait for initial render microtask to clear
  await compMutation.nextTick();

  try {
    // Make the component dirty
    compMutation.state.count = 1;
    // Run update synchronously to catch the thrown mutation error
    compMutation.update();
  } catch (err) {
    errorThrown = err;
  }

  assert.strictEqual(mutationHookCalled, true, 'onBeforeUpdate should run');
  assert.ok(errorThrown, 'Should throw an error when mutating state in onBeforeUpdate');
  assert.strictEqual(errorThrown.code, 'AVX_R11', 'Should throw AVX_R11 error');

  console.log('  ✅ State mutation in onBeforeUpdate throws AVX_R11 successfully.');

  restoreConsoleError();
}

(async () => {
  try {
    await testOnBeforeUpdate();
    console.log('  ✅ onBeforeUpdate tests passed!');
    process.exit(0);
  } catch (error) {
    restoreConsoleError();
    console.error('❌ onBeforeUpdate tests failed!');
    console.error(error);
    process.exit(1);
  }
})();
