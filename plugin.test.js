const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");

class Plugin {
  constructor(app) {
    this.app = app;
    this.commands = [];
  }

  addCommand(command) {
    this.commands.push(command);
  }

  registerEvent() {}
}

class Notice {}

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "obsidian") {
    return {
      Notice,
      Plugin,
      htmlToMarkdown: (html) => html.replace("<strong>", "**").replace("</strong>", "**"),
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const CanvasReadonlyCopyPlugin = require(path.join(__dirname, "main.js"));
Module._load = originalLoad;

const ancestor = { nodeType: 1 };
const range = {
  commonAncestorContainer: ancestor,
  cloneContents: () => ({ html: "<strong>Hello</strong>" }),
};
const selection = {
  isCollapsed: false,
  rangeCount: 1,
  getRangeAt: () => range,
  toString: () => "Hello",
};

const listeners = new Map();
const doc = {
  defaultView: {
    getSelection: () => selection,
    navigator: { clipboard: { writeText: async () => {} } },
  },
  createElement: () => ({
    innerHTML: "",
    appendChild(fragment) {
      this.innerHTML = fragment.html;
    },
  }),
  addEventListener: (name, handler, capture) => listeners.set(name, { handler, capture }),
  removeEventListener: (name) => listeners.delete(name),
};

const view = {
  getViewType: () => "canvas",
  containerEl: { ownerDocument: doc },
  canvas: { readonly: true, canvasEl: { contains: (node) => node === ancestor } },
};
const workspace = {
  activeLeaf: { view },
  getLeavesOfType: () => [{ view }],
  on: () => ({}),
  onLayoutReady: (callback) => callback(),
};

const plugin = new CanvasReadonlyCopyPlugin({ workspace });
plugin.onload();

assert.equal(listeners.get("copy").capture, true, "copy listener must use capture phase");
assert.equal(plugin.commands[0].checkCallback(true), true, "command must be available in read-only Canvas");

const clipboard = new Map();
let prevented = false;
let stopped = false;
plugin.handleCopyEvent(doc, {
  clipboardData: { setData: (type, value) => clipboard.set(type, value) },
  preventDefault: () => (prevented = true),
  stopImmediatePropagation: () => (stopped = true),
});

assert.equal(clipboard.get("text/plain"), "**Hello**");
assert.equal(clipboard.get("text/html"), "<strong>Hello</strong>");
assert.equal(prevented, true);
assert.equal(stopped, true);

view.canvas.readonly = false;
clipboard.clear();
prevented = false;
plugin.handleCopyEvent(doc, {
  clipboardData: { setData: (type, value) => clipboard.set(type, value) },
  preventDefault: () => (prevented = true),
  stopImmediatePropagation: () => {},
});

assert.equal(clipboard.size, 0, "edit mode must not be intercepted");
assert.equal(prevented, false, "edit mode must retain native copy behavior");
assert.equal(plugin.commands[0].checkCallback(true), false, "command must be hidden in edit mode");

plugin.onunload();
assert.equal(listeners.size, 0, "copy listener must be removed on unload");

console.log("Canvas Read-Only Copy tests passed.");
