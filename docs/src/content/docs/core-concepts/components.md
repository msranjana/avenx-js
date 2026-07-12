---
title: 'Component Structure'
description: 'Understand how Avenx Single File Components are structured with template, script, and style tags.'
---

---

In Avenx-JS, a component is defined by two companion files in the same directory: `<name>.component.js` (logic and template) and `<name>.component.css` (styles).

## JavaScript File (`.component.js`)

The component file contains configuration tags at the top and the HTML template at the bottom. The configuration tags are parsed at compile-time and stripped out before outputting class declarations.

- `<state key="val" />` - Declares the component's reactive local properties. Attributes are coerced to their corresponding JS types (numbers, booleans, arrays, or objects).
- `<computed name="computedName" value="expression" />` - Defines computed getters. The value attribute accepts stringified JS expressions.
- `<action name="methodName"> ... </action>` - Defines actions (methods) that have access to the component's state, computed attributes, and bridges in their execution scope.

```html
<!-- src/components/greet/greet.component.js -->
<state username="Guest" isLoggedIn="false" />
<computed name="greeting" value="isLoggedIn ? 'Welcome back, ' + username : 'Hello, Guest!'" />
<action name="login"> state.username = "Jane Doe"; state.isLoggedIn = true; </action>
<div class="greet-box">
  <h3>{{ greeting }}</h3>
  <button @click="login()">Log In</button>
</div>
```

## Attribute Coercion & Types

Every attribute passed to `<state>` starts as a plain HTML attribute string. Before the value is assigned to reactive state, the component compiler's expression parser coerces it into the corresponding JavaScript type: strings, booleans, numbers, arrays, and objects are all resolved automatically.

- `username="Guest"` is resolved as a `string` → `"Guest"`
- `isLoggedIn="false"` is resolved as a `boolean` → `false`
- `count="42"` is resolved as a `number` → `42`
- `tags='["work", "urgent"]'` is resolved as an `array`, parsed as JSON → `["work", "urgent"]`
- `user='{"name": "John"}'` is resolved as an `object`, parsed as JSON → `{ name: "John" }`

Strings, booleans, and numbers are coerced automatically and require no special quoting. Arrays and objects are different: the parser attempts to parse the attribute's contents as **JSON**. If parsing fails, the parser cannot safely guess your intent, and the value falls back to a raw string instead of throwing, which often shows up later as a confusing error when your template or actions try to use it as an array or object.

Because array and object values are parsed as JSON, they must follow strict JSON syntax, most importantly, **object keys and string values must use double quotes**, not single quotes or unquoted identifiers. Since the attribute itself has to be wrapped in quotes too, wrap the **attribute** in single quotes and use **double quotes** for the JSON inside it:

```html
<state user='{"name": "John", "role": "admin"}' /> <state tags='["work", "urgent", "backend"]' />
```

The following will **not** parse correctly and will silently fall back to a raw string, because unquoted keys and single-quoted string values are valid JavaScript object literal syntax but not valid JSON:

```html
<state user="{name: 'John'}" />
```

When declaring array or object state:

- Wrap the whole attribute value in single quotes so double quotes can be used inside it.
- Use double quotes around every object key and string value.
- Avoid trailing commas, they are invalid in JSON even though they are valid in JavaScript.
- If a `<state>` value behaves like a string instead of an array or object, check that it is valid JSON first.

## Component Nesting Restrictions

> **Important:** Custom components can currently only be resolved, instantiated, and mounted when they are declared directly inside an Avenx Page template (`.page.js`).

Standard Avenx components (`.component.js`) do not support mounting child components inside their own templates. Child component registration and mounting are handled at the `AvenxPage` level and are not available to the base `AvenxComponent` class.

For example, placing a custom component inside a Page template is supported:

```html
<!-- src/pages/home/home.page.js -->
<div class="home-page">
  <Navbar />
  <Card />
</div>
```

In this case, the Page runtime can resolve and mount the `Navbar` and `Card` components.

However, nesting one custom component inside another standard component is currently not supported:

```html
<!-- src/components/card/card.component.js -->
<div class="card">
  <Navbar />
  <p>Card content</p>
</div>
```

Although the compiler may parse the custom `<Navbar />` tag, the base `AvenxComponent` runtime does not resolve and mount it as a child component.

### Symptom

When a custom component tag is placed inside a standard `.component.js` template, the application may render an empty element or placeholder in the DOM instead of mounting the expected child component.

For example:

```html
<div class="card">
  <Navbar />
</div>
```

may result in the child component area appearing as an empty `div` in the rendered DOM.

This behavior occurs because child component mounting is handled by `AvenxPage`, while standard `AvenxComponent` instances do not currently provide child component registration or mounting functionality.

### Recommended Component Design

Until nested components are supported by the component runtime:

- Declare custom component instances directly inside `.page.js` templates.
- Use Pages as the composition layer for combining multiple components.
- Keep `.component.js` templates focused on their own markup, state, computed values, and actions.
- Avoid placing custom component tags inside standard component templates.
- Move sibling components to the containing Page when multiple components need to appear together.

Instead of nesting components like this:

```html
<!-- Not currently supported -->
<!-- src/components/dashboard/dashboard.component.js -->
<div class="dashboard">
  <Navbar />
  <Stats />
</div>
```

compose them directly in the Page template:

```html
<!-- Recommended -->
<!-- src/pages/dashboard/dashboard.page.js -->
<div class="dashboard">
  <Navbar />
  <Stats />
</div>
```

This structure ensures that each custom component can be correctly resolved, instantiated, and mounted by the Page runtime.

## Compilation Lifecycle & Limits

The Avenx compiler processes `.component.js` files by scanning for supported configuration tags and template content. During compilation, only `<state>`, `<computed>`, `<action>`, and template content are preserved and transformed into the generated component output.

Standard JavaScript declarations written outside these supported tags, such as ES module imports, local variables, constants, and helper functions, are not preserved by the compiler. Code that depends on these declarations may therefore cause runtime `ReferenceError` exceptions after compilation.

For example, avoid declaring imports or helper functions directly in a component file:

```javascript
import { formatName } from './utils.js';
const defaultName = 'Guest';
function getDisplayName(name) {
  return formatName(name);
}
<state username="Guest" />
<action name="updateName">
  state.username = getDisplayName(defaultName);
</action>
```

In this example, the `import`, `defaultName`, and `getDisplayName` declarations are outside the supported component tags and may be removed during compilation.

Instead, keep component logic inside supported tags or move reusable utilities into external files that can be accessed through supported application patterns.

For utilities that are intentionally exposed globally, reference them through the `window` object:

```html
<action name="updateName"> state.username = window.AppUtils.formatName(state.username); </action>
```

When writing `.component.js` files:

- Keep reactive state declarations inside `<state>` tags.
- Keep computed values inside `<computed>` tags.
- Keep component methods and state mutations inside `<action>` tags.
- Move reusable helper logic into external utility files.
- Reference intentionally global utilities through properties on `window`.

Understanding these compilation limits helps prevent missing imports, undefined helpers, and runtime `ReferenceError` exceptions caused by code being removed from the compiled output.
