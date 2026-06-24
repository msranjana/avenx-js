const assert = require('assert');
const StyleProcessor = require('../../lib/compiler/StyleProcessor');

try {
    console.log('🧪 Testing StyleProcessor...');
    const sp = new StyleProcessor();
    
    sp.addVariable('primary-color', '#ff0000');
    assert.strictEqual(sp.cssVariables['primary-color'], '#ff0000');
    
    sp.addGlobalCSS('body { background: white; }');
    assert.ok(sp.rawGlobalCSS.has('body { background: white; }'));
    
    const processed = sp.process('<div @css my-class></div>', { 'my-class': 'color: red;' }, 'MyComp');
    assert.ok(processed.includes('class="avenx-'));

    // Test media queries and keyframes scoping
    const complexCss = `
    color: red;
    & h1 { color: blue; }
    @media (max-width: 600px) {
        & h2 { color: green; }
    }
    @keyframes slide {
        from { transform: translateX(0); }
        to { transform: translateX(100px); }
    }
    @supports (display: grid) {
        & .grid { display: grid; }
    }
    `;

    const sp2 = new StyleProcessor();
    const hash = sp2.getHash(complexCss, 'TestComponent');
    sp2.extractRules(complexCss, hash);

    const generatedCss = sp2.scopedStyles;

    // Verify top-level base rule scoping
    assert.ok(generatedCss.includes(`.${hash} { color: red; }`), 'Should scope top-level base properties');
    // Verify nested rule scoping
    assert.ok(generatedCss.includes(`.${hash} h1 { color: blue; }`), 'Should scope nested selectors');
    // Verify media query is compiled at top level and contains nested scoped rule
    assert.ok(generatedCss.includes(`@media (max-width: 600px) {`), 'Should retain @media query');
    assert.ok(generatedCss.includes(`.${hash} h2 { color: green; }`), 'Should scope nested selectors inside @media');
    // Verify keyframes are unmodified inside
    assert.ok(generatedCss.includes(`@keyframes slide {`), 'Should retain @keyframes');
    assert.ok(generatedCss.includes(`from { transform: translateX(0); }`), 'Should keep from keyframe unchanged');
    assert.ok(generatedCss.includes(`to { transform: translateX(100px); }`), 'Should keep to keyframe unchanged');
    // Verify supports queries
    assert.ok(generatedCss.includes(`@supports (display: grid) {`), 'Should retain @supports query');
    assert.ok(generatedCss.includes(`.${hash} .grid { display: grid; }`), 'Should scope nested selectors inside @supports');

    console.log('  ✅ StyleProcessor tests passed!');
} catch (error) {
    console.error('❌ StyleProcessor tests failed!');
    console.error(error);
    process.exit(1);
}

