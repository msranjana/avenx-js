import { DomPatcher } from './domPatch.js';
import { logger } from '../runtime/AvenxLogger.js';
import { AvenxErrorCodes, formatMessage } from '../runtime/AvenxError.js';

/**
 * Handles efficient rendering of lists by managing DOM fragments and performing keyed diffing.
 */
export class ListManager {
  /** @type {WeakMap<HTMLTemplateElement, {listRef: Array, items: Array}>} */
  #listCache = new WeakMap();

  /** @type {WeakMap<HTMLTemplateElement, Array<Element>>} */
  #nodePool = new WeakMap();

  /**
   * @param {DynamicEvaluator} evaluator - The expression evaluator.
   * @param {TemplateRenderer} renderer - The template renderer.
   * @param {EventBinder} [eventBinder] - The event binder to unbind removed elements.
   */
  constructor(evaluator, renderer, eventBinder) {
    this.evaluator = evaluator;
    this.renderer = renderer;
    this.eventBinder = eventBinder;
    this.patcher = new DomPatcher();
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      this.parserDiv = document.createElement('div');
    }
  }

  /**
   * Processes all template-based lists within a root element.
   * @param {Element} root - The root element to search in.
   * @param {object} scope - The evaluation scope.
   * @param {object} state - The component state.
   */
  process(root, scope, state) {
    const templates = root.querySelectorAll('template[data-ax-for]');
    templates.forEach((template) => {
      let parent = template.parentNode;
      let insideSlot = false;
      while (parent) {
        if (parent.nodeName === 'SLOT' && parent.hasAttribute && parent.hasAttribute('data-avenx-transcluded')) {
          insideSlot = true;
          break;
        }
        parent = parent.parentNode;
      }
      if (!insideSlot) {
        this.#updateList(template, scope, state);
      }
    });
  }

  /**
   * Updates a specific list based on its template and current state.
   * @param {HTMLTemplateElement} template - The list template.
   * @param {object} scope - The evaluation scope.
   * @param {object} state - The component state.
   * @private
   */
  #updateList(template, scope, state) {
    const listExpr = template.getAttribute('data-ax-for');
    const itemVar = template.getAttribute('data-ax-as');
    const keyExpr = template.getAttribute('data-ax-key');

    let list;
    try {
      list = this.evaluator.evaluateExpression(listExpr, scope, state);
    } catch (e) {
      logger.warn(
        formatMessage(AvenxErrorCodes.RENDER_LIST_EVALUATION_FAILED, listExpr, e.message || e)
      );
      return;
    }

    if (!Array.isArray(list)) {
      list = [];
    }

    const cached = this.#listCache.get(template);
    if (
      cached &&
      cached.listRef === list &&
      cached.items.length === list.length &&
      cached.items.every((item, i) => item === list[i])
    ) {
      return;
    }

    const currentItems = this.#getCurrentItems(template);
    const rawItems = list.map((item, index) => {
      const itemScope = { ...scope, [itemVar]: item, index };
      let key = index;
      if (keyExpr) {
        try {
          key = this.evaluator.evaluateExpression(keyExpr, itemScope, state);
        } catch (e) {
          logger.warn(
            formatMessage(AvenxErrorCodes.RENDER_KEY_EVALUATION_FAILED, keyExpr, e.message || e)
          );
        }
      }
      return { item, key: String(key), itemScope, index };
    });

    const keyCounts = {};
    for (const entry of rawItems) {
      keyCounts[entry.key] = (keyCounts[entry.key] || 0) + 1;
    }

    const warnedKeys = new Set();
    const nextItems = rawItems.map((entry) => {
      let finalKey = entry.key;
      if (keyCounts[entry.key] > 1) {
        if (!warnedKeys.has(entry.key)) {
          logger.warn(
            formatMessage(AvenxErrorCodes.RENDER_LIST_DUPLICATE_KEY, entry.key, listExpr)
          );
          warnedKeys.add(entry.key);
        }
        finalKey = `${entry.key}_${entry.index}`;
      }
      return { item: entry.item, key: finalKey, itemScope: entry.itemScope };
    });

    // 1. Remove items that are no longer in the list
    const nextKeys = new Set(nextItems.map((i) => i.key));
    for (const [key, element] of currentItems.entries()) {
      if (!nextKeys.has(key)) {
        if (this.eventBinder) {
          this.eventBinder.unbind(element);
        }
        this.patcher.triggerLeave(element, null, () => {
          this.#resetNodeState(element);
          element.remove();
          let pool = this.#nodePool.get(template);
          if (!pool) {
            pool = [];
            this.#nodePool.set(template, pool);
          }
          pool.push(element);
        });
      }
    }

    // 2. Add or move items
    let lastElement = template;
    const itemTemplate = template.innerHTML.replace(/{%/g, '{{').replace(/%}/g, '}}');

    nextItems.forEach(({ key, itemScope }) => {
      let element = currentItems.get(key);
      const resolver = (expr) => this.evaluator.evaluateExpression(expr, itemScope, state);
      const html = this.renderer.render(itemTemplate, resolver).trim();

      let newElement = null;
      if (this.parserDiv) {
        this.parserDiv.innerHTML = html;
        newElement = this.parserDiv.firstElementChild;
      } else if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
        const temp = document.createElement('div');
        temp.innerHTML = html;
        newElement = temp.firstElementChild;
      }

      if (newElement) {
        newElement = this.patcher.cleanElement(newElement);
        newElement.setAttribute('data-ax-list-item', '');
        newElement.setAttribute('data-ax-key-val', key);
      }

      if (element) {
        if (newElement) {
          let needsPatch = element.outerHTML !== newElement.outerHTML;
          if (!needsPatch) {
            const hasDirectives =
              element.hasAttribute('data-ax-show') ||
              element.hasAttribute('data-ax-class') ||
              element.hasAttribute('data-ax-html') ||
              (typeof element.querySelector === 'function' &&
                (element.querySelector('[data-ax-show]') ||
                  element.querySelector('[data-ax-class]') ||
                  element.querySelector('[data-ax-html]')));
            if (hasDirectives) {
              needsPatch = true;
            }
          }
          if (needsPatch) {
            this.patcher.patchElement(element, newElement, resolver);
          }
        }
      } else {
        // Try to get a recycled node from the pool
        const pool = this.#nodePool.get(template);
        const recycledElement = pool ? pool.pop() : null;

        if (recycledElement && newElement) {
          this.patcher.patchElement(recycledElement, newElement, resolver);
          element = recycledElement;
          this.patcher.triggerEnter(element, resolver);
        } else if (newElement) {
          element = newElement;
          this.patcher.applyDirectives(element, resolver);
          this.patcher.triggerEnter(element, resolver);
        }
      }

      if (element) {
        // Ensure correct order
        if (element.previousElementSibling !== lastElement) {
          lastElement.after(element);
        }
        lastElement = element;
      }

      if (this.parserDiv) {
        this.parserDiv.innerHTML = '';
      }
    });

    this.#listCache.set(template, {
      listRef: list,
      items: [...list],
    });
  }

  /**
   * Resets element state like focus, selection, and inputs.
   * @param {Element} element - The element to reset.
   * @private
   */
  #resetNodeState(element) {
    if (typeof document !== 'undefined' && document.activeElement &&
        (element === document.activeElement || element.contains(document.activeElement))) {
      if (typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
    }

    if (typeof window !== 'undefined' && window.getSelection) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        try {
          const range = selection.getRangeAt(0);
          if (element.contains(range.commonAncestorContainer)) {
            selection.removeAllRanges();
          }
        } catch {
          // Ignore
        }
      }
    }

    const inputs = [];
    ['input', 'textarea', 'select'].forEach((tag) => {
      const found = element.querySelectorAll(tag);
      if (found && found.forEach) {
        found.forEach((el) => inputs.push(el));
      }
    });
    inputs.forEach((input) => {
      if (input.tagName === 'INPUT') {
        const type = input.getAttribute('type');
        if (type === 'checkbox' || type === 'radio') {
          input.checked = false;
        } else {
          input.value = '';
          if (typeof input.setSelectionRange === 'function') {
            try {
              input.setSelectionRange(0, 0);
            } catch {
              // Ignore
            }
          }
        }
      } else if (input.tagName === 'TEXTAREA') {
        input.value = '';
        if (typeof input.setSelectionRange === 'function') {
          try {
            input.setSelectionRange(0, 0);
          } catch {
            // Ignore
          }
        }
      } else if (input.tagName === 'SELECT') {
        input.selectedIndex = -1;
      }
    });
  }

  /**
   * Retrieves currently rendered items for a template by scanning subsequent siblings.
   * @param {HTMLTemplateElement} template - The template.
   * @returns {Map<string, Element>}
   * @private
   */
  #getCurrentItems(template) {
    const items = new Map();
    let current = template.nextElementSibling;
    while (current && current.hasAttribute('data-ax-list-item')) {
      if (!current._isLeaving) {
        const key = current.getAttribute('data-ax-key-val');
        items.set(key, current);
      }
      current = current.nextElementSibling;
    }
    return items;
  }
}
