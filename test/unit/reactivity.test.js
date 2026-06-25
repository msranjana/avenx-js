const assert = require('assert');

// Mock DOM environment for AvenxApp
const mockElement = { 
    innerHTML: '',
    querySelector: () => null,
    querySelectorAll: () => []
};

global.document = {
    querySelector: () => mockElement
};

const { ProxyHandlerFactory, isReactiveTarget } = require('../../lib/core/reactive/proxyHandler');
const { StateFactory } = require('../../lib/core/reactive/createState');
const { AvenxApp } = require('../../lib/core/runtime/AvenxApp');

function testIsReactiveTarget() {
    console.log('🧪 Testing isReactiveTarget helper...');
    
    // Primitives
    assert.strictEqual(isReactiveTarget(null), false);
    assert.strictEqual(isReactiveTarget(undefined), false);
    assert.strictEqual(isReactiveTarget(42), false);
    assert.strictEqual(isReactiveTarget('hello'), false);
    assert.strictEqual(isReactiveTarget(true), false);
    
    // Plain objects and arrays
    assert.strictEqual(isReactiveTarget({}), true);
    assert.strictEqual(isReactiveTarget({ name: 'Alice' }), true);
    assert.strictEqual(isReactiveTarget([]), true);
    assert.strictEqual(isReactiveTarget(Object.create(null)), true);
    
    // Built-ins & custom classes
    assert.strictEqual(isReactiveTarget(new Date()), false);
    assert.strictEqual(isReactiveTarget(/regex/), false);
    assert.strictEqual(isReactiveTarget(new Map()), false);
    assert.strictEqual(isReactiveTarget(new Set()), false);
    assert.strictEqual(isReactiveTarget(Promise.resolve()), false);
    
    class CustomClass {}
    assert.strictEqual(isReactiveTarget(new CustomClass()), false);
    
    console.log('  ✅ isReactiveTarget helper tests passed!');
}

function testStateDeepReactivity() {
    console.log('🧪 Testing deep reactivity on component state...');
    
    let changeCount = 0;
    const initialState = {
        user: {
            name: 'Alice',
            profile: {
                age: 25
            }
        },
        tags: ['js', 'reactive']
    };
    
    const state = new StateFactory().create(initialState, {
        onChange: () => {
            changeCount++;
        }
    });
    
    // 1. Initial changeCount is 0
    assert.strictEqual(changeCount, 0);
    
    // 2. Mutating nested object should trigger onChange
    state.user.name = 'Bob';
    assert.strictEqual(changeCount, 1);
    assert.strictEqual(state.user.name, 'Bob');
    
    // 3. Mutating deeply nested object should trigger onChange
    state.user.profile.age = 26;
    assert.strictEqual(changeCount, 2);
    assert.strictEqual(state.user.profile.age, 26);
    
    // 4. Mutating nested array should trigger onChange
    state.tags.push('web');
    assert.strictEqual(changeCount, 3);
    assert.deepStrictEqual([...state.tags], ['js', 'reactive', 'web']);
    
    // 5. Deleting nested property should trigger onChange
    delete state.user.profile.age;
    assert.strictEqual(changeCount, 4);
    assert.strictEqual(state.user.profile.age, undefined);
    
    console.log('  ✅ Component state deep reactivity tests passed!');
}

function testReferentialIdentity() {
    console.log('🧪 Testing preservation of referential identity...');
    
    const state = new StateFactory().create({
        user: { name: 'Alice' }
    });
    
    const firstAccess = state.user;
    const secondAccess = state.user;
    
    // Verify that the exact same Proxy wrapper is returned
    assert.strictEqual(firstAccess, secondAccess, 'Should return cached proxy for the same object reference');
    
    console.log('  ✅ Referential identity tests passed!');
}

function testProxyUnwrapping() {
    console.log('🧪 Testing proxy unwrapping on assignment...');
    
    const state = new StateFactory().create({
        user1: { name: 'Alice' },
        user2: null
    });
    
    // Accessing user1 returns a proxy
    const user1Proxy = state.user1;
    
    // Assigning user1 proxy to user2
    state.user2 = user1Proxy;
    
    // Check that we don't double proxy or accumulate proxies in target raw structure.
    // The target of user2 should be the raw object of user1.
    // We verify by changing state.user2.name and seeing it mutate the underlying object.
    state.user2.name = 'Charlie';
    assert.strictEqual(state.user1.name, 'Charlie');
    
    console.log('  ✅ Proxy unwrapping tests passed!');
}

async function testBridgeDeepReactivity() {
    console.log('🧪 Testing deep reactivity on global bridges...');
    
    const app = new AvenxApp({ target: '#app' });
    
    let updateAllCount = 0;
    // Mock updateAll to count updates
    app.updateAll = () => {
        updateAllCount++;
    };
    
    // Register a bridge with nested objects
    app.registerBridge('config', {
        theme: {
            dark: true,
            colors: {
                primary: 'blue'
            }
        },
        toggleTheme() {
            this.theme.dark = !this.theme.dark;
        }
    });
    
    const bridge = app.bridges.config;
    
    // Mutating nested property triggers app.updateAll()
    bridge.theme.colors.primary = 'red';
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.strictEqual(updateAllCount, 1);
    
    // Calling bridge method which mutates nested state triggers updateAll
    bridge.toggleTheme();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.strictEqual(updateAllCount, 2);
    assert.strictEqual(bridge.theme.dark, false);
    
    console.log('  ✅ Global bridge deep reactivity tests passed!');
}

function testBuiltinsAreNotProxied() {
    console.log('🧪 Testing that built-ins are not proxied...');
    
    const date = new Date(2026, 5, 23);
    const set = new Set([1, 2, 3]);
    
    const state = new StateFactory().create({
        time: date,
        numbers: set
    });
    
    // Verify that accessed properties are the exact original instances (no proxies)
    assert.strictEqual(state.time, date);
    assert.strictEqual(state.numbers, set);
    
    // Calling methods on them should work exactly as normal without throwing
    assert.strictEqual(state.time.getFullYear(), 2026);
    assert.strictEqual(state.numbers.has(2), true);
    
    console.log('  ✅ Built-ins are not proxied tests passed!');
}

(async () => {
    try {
        testIsReactiveTarget();
        testStateDeepReactivity();
        testReferentialIdentity();
        testProxyUnwrapping();
        await testBridgeDeepReactivity();
        testBuiltinsAreNotProxied();
        console.log('✅ All reactivity tests passed!');
    } catch (error) {
        console.error('❌ Reactivity tests failed!');
        console.error(error);
        process.exit(1);
    }
})();
