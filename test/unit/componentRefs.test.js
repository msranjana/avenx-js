import assert from 'assert';
import { AvenxComponent } from '../../lib/core/runtime/AvenxComponent.js';
import { MockDOMElement, setupDOMMock, teardownDOMMock } from '../helpers/dom-mock.js';

/**
 * Tests data-ax-ref collection and component-scoped DOM references.
 */
async function testComponentRefs() {
  console.log('🧪 Testing data-ax-ref DOM element referencing...');

  setupDOMMock();

  try {
    const comp = new AvenxComponent(
      {},
      {},
      {},
      '<div><input data-ax-ref="myInput"></div>',
      {},
    );

    const root = new MockDOMElement('div');
    const input = new MockDOMElement('input');

    input.setAttribute('data-ax-ref', 'myInput');
    root.appendChild(input);

    comp.__setMountTarget(root);

    // __setMountTarget clears the initial content, so append the element
    // again to simulate the rendered component DOM.
    root.appendChild(input);

    comp.runUpdate();

    assert.strictEqual(
      comp.$refs.myInput,
      input,
      '$refs.myInput should point to the referenced DOM element.',
    );

    console.log('  ✅ Referenced DOM element is available through $refs.');

    comp.unmount();

    assert.deepStrictEqual(
      comp.$refs,
      {},
      '$refs should be cleared when the component is unmounted.',
    );

    console.log('  ✅ $refs are cleared after unmount.');
  } finally {
    teardownDOMMock();
  }
}

(async () => {
  try {
    await testComponentRefs();
    console.log('✅ Component refs tests passed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Component refs tests failed!');
    console.error(error);
    process.exit(1);
  }
})();
import '../helpers/register-happy-dom.js';
import { AvenxComponent } from '../../lib/core/runtime/AvenxComponent.js';

/**
 * Tests that elements marked with data-ax-ref are exposed through $refs.
 */
function testComponentRefCollection() {
  console.log('🧪 Testing data-ax-ref collection...');

  const component = new AvenxComponent({}, {}, {}, '<input data-ax-ref="myInput"></input>');
  const root = document.createElement('div');

  component.__setMountTarget(root);
  component.runUpdate();

  const input = root.childNodes[0];
  assert.ok(input, 'Input element should be created');
  assert.strictEqual(component.$refs.myInput, input, '$refs.myInput should point to the referenced DOM element.');

  console.log('  ✅ data-ax-ref element is available through $refs.');
}

/**
 * Tests that refs are scoped to the current component boundary.
 */
function testComponentRefScoping() {
  console.log('🧪 Testing data-ax-ref component scoping...');

  const template = `
    <div>
      <input data-ax-ref="parentInput"></input>
      <div data-avenx-comp="child-component">
        <input data-ax-ref="childInput"></input>
      </div>
    </div>
  `;
  const component = new AvenxComponent({}, {}, {}, template);
  const root = document.createElement('div');

  component.__setMountTarget(root);
  component.runUpdate();

  const outerDiv = root.childNodes[0];
  const parentInput = outerDiv.querySelector('[data-ax-ref="parentInput"]');

  assert.strictEqual(component.$refs.parentInput, parentInput, 'The parent component should collect its own ref.');
  assert.strictEqual(
    component.$refs.childInput,
    undefined,
    'The parent component should not collect refs inside nested components.',
  );

  console.log('  ✅ Refs remain scoped to the current component boundary.');
}

/**
 * Tests that refs are cleared when the component is unmounted.
 */
function testComponentRefCleanup() {
  console.log('🧪 Testing data-ax-ref cleanup...');

  const component = new AvenxComponent({}, {}, {}, '<input data-ax-ref="myInput"></input>');
  const root = document.createElement('div');

  component.__setMountTarget(root);
  component.runUpdate();

  const input = root.childNodes[0];
  assert.strictEqual(component.$refs.myInput, input, '$refs.myInput should exist before unmount.');

  component.unmount();

  assert.deepStrictEqual(component.$refs, {}, '$refs should be cleared after component unmount.');

  console.log('  ✅ $refs are cleared after unmount.');
}

function runTests() {
  try {
    testComponentRefCollection();
    testComponentRefScoping();
    testComponentRefCleanup();

    console.log('✅ All component ref tests passed successfully!');
  } catch (error) {
    console.error('❌ Component ref tests failed!');
    console.error(error);
    process.exit(1);
  }
}

runTests();

