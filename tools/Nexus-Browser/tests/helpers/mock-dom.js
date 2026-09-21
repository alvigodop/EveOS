function createMockNode(spec) {
  if (typeof spec === 'string') {
    return {
      nodeType: 3,
      nodeValue: spec,
      parentElement: null,
      parentNode: null,
      previousSibling: null,
      nextSibling: null,
      get textContent() { return this.nodeValue; },
      set textContent(value) { this.nodeValue = value; },
      remove() {
        if (!this.parentNode) return;
        const index = this.parentNode.childNodes.indexOf(this);
        if (index !== -1) {
          this.parentNode.childNodes.splice(index, 1);
          if (this.previousSibling) this.previousSibling.nextSibling = this.nextSibling;
          if (this.nextSibling) this.nextSibling.previousSibling = this.previousSibling;
        }
        this.parentNode = null;
        this.parentElement = null;
      },
      cloneNode() {
        return createMockNode(this.nodeValue);
      }
    };
  }

  const element = {
    nodeType: 1,
    tagName: spec.tag.toUpperCase(),
    attributes: spec.attrs || {},
    childNodes: [],
    parentElement: null,
    parentNode: null,
    previousSibling: null,
    nextSibling: null,
    get className() { return this.attributes.class || ''; },
    getAttribute(name) { return this.attributes[name] || null; },
    setAttribute(name, value) { this.attributes[name] = value; },
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name); },
    get children() { return this.childNodes.filter((child) => child.nodeType === 1); },
    get textContent() { return this.childNodes.map((child) => child.textContent || '').join(''); },
    get innerText() { return this.textContent; },
    appendChild(child) {
      if (child.parentNode) child.remove();
      child.parentElement = this;
      child.parentNode = this;
      if (this.childNodes.length > 0) {
        const last = this.childNodes[this.childNodes.length - 1];
        last.nextSibling = child;
        child.previousSibling = last;
      }
      child.nextSibling = null;
      this.childNodes.push(child);
      return child;
    },
    remove() {
      if (!this.parentNode) return;
      const index = this.parentNode.childNodes.indexOf(this);
      if (index !== -1) {
        this.parentNode.childNodes.splice(index, 1);
        if (this.previousSibling) this.previousSibling.nextSibling = this.nextSibling;
        if (this.nextSibling) this.nextSibling.previousSibling = this.previousSibling;
      }
      this.parentNode = null;
      this.parentElement = null;
    },
    contains(other) {
      if (other === this) return true;
      return this.childNodes.some((child) => child.nodeType === 1 && child.contains?.(other));
    },
    querySelectorAll(selector) {
      const results = [];
      const parts = selector.split(',').map((value) => value.trim().toLowerCase());
      function search(current) {
        for (const child of current.childNodes) {
          if (child.nodeType !== 1) continue;
          if (matches(child, parts)) results.push(child);
          search(child);
        }
      }
      search(this);
      return results;
    },
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    },
    cloneNode(deep = true) {
      const cloned = createMockNode({ tag: this.tagName, attrs: { ...this.attributes } });
      if (deep) {
        for (const child of this.childNodes) cloned.appendChild(child.cloneNode(true));
      }
      return cloned;
    }
  };

  function matches(node, selectors) {
    const tag = node.tagName.toLowerCase();
    const cls = (node.className || '').toLowerCase();
    const dataTestId = (node.getAttribute('data-testid') || '').toLowerCase();
    const ariaLabel = (node.getAttribute('aria-label') || '').toLowerCase();

    for (const selector of selectors) {
      if (selector === '*' || selector === tag) return true;
      if (selector.startsWith('.') && cls.includes(selector.slice(1))) return true;
      if (selector.includes('class*=') && cls.includes(selector.split('"')[1])) return true;
      if (selector.includes('data-testid*=') && dataTestId.includes(selector.split('"')[1])) return true;
      if (selector.includes('aria-label*=') && ariaLabel.includes(selector.split('"')[1])) return true;
      if (selector === '[role="button"]' && node.getAttribute('role') === 'button') return true;
      if (selector === '[aria-expanded]' && node.hasAttribute('aria-expanded')) return true;
      if (selector === '[tabindex]' && node.hasAttribute('tabindex')) return true;
    }
    return false;
  }

  if (spec.children) {
    for (const childSpec of spec.children) element.appendChild(createMockNode(childSpec));
  }
  return element;
}

module.exports = { createMockNode };
