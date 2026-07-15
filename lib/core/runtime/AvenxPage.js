import { AvenxComponent } from './AvenxComponent.js';
import { logger } from './AvenxLogger.js';
import { AvenxErrorCodes, formatMessage } from './AvenxError.js';

/**
 * AvenxPage is a specialized component that can host child components.
 * It automatically mounts child components defined in its template via [data-avenx-comp].
 */
export class AvenxPage extends AvenxComponent {
  /** @type {Map<string, typeof AvenxComponent>} @private */
  #componentRegistry;
  /** @type {Map<Element, AvenxComponent>} @private */
  #childComponents = new Map();

  /**
   * @param {object} initialState - Initial state.
   * @param {object} computed - Computed properties.
   * @param {object} bridges - Shared bridges.
   * @param {string} template - HTML template.
   * @param {object} methods - Component methods.
   * @param {Map<string, typeof AvenxComponent>} componentRegistry - Registry of available components.
   * @param {object} props - Component properties.
   * @param {object} styles - Component CSS variables.
   */
  constructor(
    initialState = {},
    computed = {},
    bridges = {},
    template = '',
    methods = {},
    componentRegistry = new Map(),
    props = {},
    styles = {},
  ) {
    super(initialState, computed, bridges, template, methods, props, styles);
    this.#componentRegistry = componentRegistry;
  }

  /**
   * Updates the page and then mounts/updates child components.
   */
  update() {
    super.update();
    this.#mountChildComponents();
  }

  /**
   * Unmounts the page and all child components.
   */
  unmount() {
    for (const compInstance of this.#childComponents.values()) {
      if (typeof compInstance.unmount === 'function') {
        compInstance.unmount();
      }
    }
    this.#childComponents.clear();
    super.unmount();
  }

  /**
   * Finds all mount points for child components and initializes or updates them.
   * @private
   */
  #mountChildComponents() {
    const root = this._getElement();
    if (!root) return;

    const mountPoints = Array.from(root.querySelectorAll('[data-avenx-comp], [data-avenx-comp-dynamic]'));
    const currentElements = new Set(mountPoints);

    // 1. Clean up/unmount child components whose elements are no longer in the DOM/page
    for (const [el, compInstance] of this.#childComponents.entries()) {
      if (!currentElements.has(el) || !root.contains(el)) {
        if (typeof compInstance.unmount === 'function') {
          compInstance.unmount();
        }
        this.#childComponents.delete(el);
      }
    }

    // 2. Instantiate new components or update existing ones
    const registry = this.#getRegistry();
    mountPoints.forEach((el) => {
      let CompClass = null;
      let compName = null;

      if (el.hasAttribute('data-avenx-comp')) {
        compName = el.getAttribute('data-avenx-comp');
        CompClass = registry.get(compName);
      } else if (el.hasAttribute('data-avenx-comp-dynamic')) {
        const dynamicExpr = el.getAttribute('data-avenx-comp-dynamic');
        try {
          let resolvedVal = this._evaluate(dynamicExpr);
          if (resolvedVal && resolvedVal[Symbol.for('rawTarget')]) {
            resolvedVal = resolvedVal[Symbol.for('rawTarget')];
          }
          if (typeof resolvedVal === 'string') {
            compName = resolvedVal;
            CompClass = registry.get(resolvedVal);
          } else if (typeof resolvedVal === 'function') {
            CompClass = resolvedVal;
            compName = resolvedVal.name;
          }
        } catch (e) {
          logger.warn(
            formatMessage(AvenxErrorCodes.PAGE_PROP_EVALUATION_FAILED, dynamicExpr, e.message || e)
          );
        }
      }

      if (CompClass) {
        // Extract props from element's data-props-* attributes
        const props = {};
        for (const attr of el.attributes) {
          if (attr.name.startsWith('data-props-')) {
            const propName = attr.name.slice('data-props-'.length);
            try {
              props[propName] = this._evaluate(attr.value);
            } catch (e) {
              logger.warn(
                formatMessage(AvenxErrorCodes.PAGE_PROP_EVALUATION_FAILED, attr.value, e.message || e)
              );
            }
          }
        }

        if (this.#childComponents.has(el)) {
          const compInstance = this.#childComponents.get(el);
          if (compInstance.constructor === CompClass) {
            if (typeof compInstance.setProps === 'function') {
              compInstance.setProps(props);
            } else if (typeof compInstance.update === 'function') {
              compInstance.update();
            }
          } else {
            // Component class changed! Unmount the old one and mount the new one
            if (typeof compInstance.unmount === 'function') {
              compInstance.unmount();
            }
            // Clear content of el before mounting new one to avoid merge issues
            el.innerHTML = '';
            const newInstance = new CompClass(this._getBridges(), props);
            newInstance.$parent = this;
            newInstance.mount(el);
            this.#childComponents.set(el, newInstance);
          }
        } else {
          const compInstance = new CompClass(this._getBridges(), props);
          compInstance.$parent = this;
          compInstance.mount(el);
          this.#childComponents.set(el, compInstance);
        }
      } else {
        // If it was dynamic and is now null/undefined/unresolved, we should unmount any existing component
        if (this.#childComponents.has(el)) {
          const compInstance = this.#childComponents.get(el);
          if (typeof compInstance.unmount === 'function') {
            compInstance.unmount();
          }
          this.#childComponents.delete(el);
          el.innerHTML = '';
        }
        if (compName) {
          logger.warn(formatMessage(AvenxErrorCodes.PAGE_COMPONENT_NOT_REGISTERED, compName));
        }
      }
    });
  }

  /**
   * Retrieves the component registry.
   * @returns {Map<string, typeof AvenxComponent>}
   * @protected
   */
  _getComponentRegistry() {
    return this.#componentRegistry;
  }

  /**
   * Resolves the component registry dynamically by traversing parent page instances.
   * @returns {Map<string, typeof AvenxComponent>}
   * @private
   */
  #getRegistry() {
    if (this.#componentRegistry instanceof Map) {
      return this.#componentRegistry;
    }
    const root = this._getElement();
    if (root) {
      let parentEl = root.parentNode;
      while (parentEl) {
        if (
          parentEl.__avenx_comp_instance &&
          typeof parentEl.__avenx_comp_instance._getComponentRegistry === 'function'
        ) {
          const reg = parentEl.__avenx_comp_instance._getComponentRegistry();
          if (reg instanceof Map) {
            return reg;
          }
        }
        parentEl = parentEl.parentNode;
      }
    }
    return new Map();
  }
}
