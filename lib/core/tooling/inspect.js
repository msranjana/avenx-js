/**
 * Collects all active component instances and application registration metadata.
 * @param {object} app - The AvenxApp instance.
 * @returns {object} Inspector data payload.
 */
function getInspectorData(app) {
  const activeComponents = [];
  if (typeof document !== 'undefined') {
    const elements = document.querySelectorAll('[data-avenx-comp], [data-avenx-comp-dynamic]');
    elements.forEach((el) => {
      if (el.__avenx_comp_instance) {
        const comp = el.__avenx_comp_instance;
        activeComponents.push({
          name: comp.constructor.name,
          state: comp.state || {},
          props: comp.props || {},
        });
      }
    });
  }

  const registeredBridges = {};
  for (const [name, bridge] of Object.entries(app.bridges || {})) {
    registeredBridges[name] = bridge;
  }

  const registeredComponents = app.components ? Array.from(app.components.keys()) : [];
  const registeredPages = app.pages ? Array.from(app.pages.keys()) : [];

  const routes = app.router ? app.router.routes : {};
  const currentRoute = app.router ? app.router.currentRoute : null;

  return {
    activeComponents,
    registeredBridges,
    registeredComponents,
    registeredPages,
    routes,
    currentRoute,
  };
}

/**
 * Initializes the inspector for an AvenxApp.
 * @param {object} app - The AvenxApp instance.
 */
export function initInspector(app) {
  if (typeof window === 'undefined' || typeof globalThis.BroadcastChannel === 'undefined') {
    return;
  }

  const channel = new globalThis.BroadcastChannel('avenx-inspector-channel');

  const broadcast = () => {
    channel.postMessage({
      type: 'inspect-data',
      data: getInspectorData(app),
    });
  };

  channel.onmessage = (event) => {
    if (event.data === 'request-inspect-data') {
      broadcast();
    }
  };

  // Automatically broadcast on page transitions or component lifecycles/updates.
  const originalUpdateAll = app.updateAll;
  app.updateAll = function (...args) {
    const res = originalUpdateAll.apply(this, args);
    broadcast();
    return res;
  };

  const originalMountPage = app.mountPage;
  app.mountPage = function (...args) {
    const res = originalMountPage.apply(this, args);
    broadcast();
    return res;
  };

  // Intercept component lifecycles using capturing phase listeners (since they don't bubble)
  window.addEventListener('avenx:update', () => broadcast(), true);
  window.addEventListener('avenx:mount', () => broadcast(), true);
  window.addEventListener('avenx:unmount', () => broadcast(), true);
}
