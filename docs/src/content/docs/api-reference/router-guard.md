---
title: 'AvenxRouter & Guard API'
description: 'API documentation for routing hooks, guards, navigation, and page lifecycle management.'
---

Classes responsible for navigation controls and route access authorization.

## AvenxRouter

Created by calling `AvenxApp.initRouter(routes, options)`.

### Configuration Options

The second argument to `initRouter` is an optional `options` object that controls router behavior:

| Option                  | Type       | Default        | Description                                                                                                                                           |
| ------------------------ | ---------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prefix`                 | `string`   | `''`           | A base path prepended to every route hash. Useful when the app is served from a subdirectory (e.g. `'/app'` turns `#/dashboard` into `#/app/dashboard`). |
| `guardTimeout`           | `number`   | `5000`         | Maximum time, in milliseconds, a guard's `canActivate` is allowed to take (including async/promise-based guards) before the navigation is considered stalled and `AVX_R14` (`ROUTER_GUARD_TIMEOUT`) is triggered. |
| `guardTimeoutRedirect`   | `string`   | `undefined`    | A hash path to redirect to automatically if a guard times out, instead of leaving navigation stalled. If omitted, a timed-out guard simply denies the transition. |
| `transition`             | `string`   | `'none'`       | Enables a named transition effect (e.g. `'fade'`, `'slide'`) applied to the page container when navigating between routes.                             |

```javascript
const router = AvenxApp.initRouter(routes, {
  prefix: '/app',
  guardTimeout: 8000,
  guardTimeoutRedirect: '#/login',
  transition: 'fade'
});
```

### Methods

- `navigate(hash)`: Programs a
