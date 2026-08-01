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
const body = { nodeType: 1 };
const doc = {
  body,
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

const canvasRoot = { contains: (node) => node === ancestor };
const view = {
  getViewType: () => "canvas",
  containerEl: { ownerDocument: doc },
  canvas: { readonly: true, canvasEl: canvasRoot },
};
const leaves = [{ view }];
const workspace = {
  activeLeaf: { view },
  getLeavesOfType: () => leaves,
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
  target: body,
  composedPath: () => [body, doc],
  clipboardData: { setData: (type, value) => clipboard.set(type, value) },
  preventDefault: () => (prevented = true),
  stopImmediatePropagation: () => (stopped = true),
});

assert.equal(clipboard.get("text/plain"), "**Hello**");
assert.equal(clipboard.get("text/html"), "<strong>Hello</strong>");
assert.equal(prevented, true);
assert.equal(stopped, true);

clipboard.clear();
prevented = false;
stopped = false;
const outsideTarget = { nodeType: 1 };
plugin.handleCopyEvent(doc, {
  target: outsideTarget,
  composedPath: () => [outsideTarget, doc],
  clipboardData: { setData: (type, value) => clipboard.set(type, value) },
  preventDefault: () => (prevented = true),
  stopImmediatePropagation: () => (stopped = true),
});

assert.equal(clipboard.size, 0, "copy outside Canvas must ignore a stale Canvas selection");
assert.equal(prevented, false, "copy outside Canvas must retain native behavior");
assert.equal(stopped, false, "copy outside Canvas must reach other handlers");
assert.equal(
  plugin.eventOriginatesWithinCanvas(
    { target: ancestor, composedPath: () => [ancestor, canvasRoot, body, doc] },
    canvasRoot,
    doc,
  ),
  true,
  "copy events dispatched inside Canvas must be accepted",
);

view.canvas.readonly = false;
clipboard.clear();
prevented = false;
plugin.handleCopyEvent(doc, {
  target: ancestor,
  clipboardData: { setData: (type, value) => clipboard.set(type, value) },
  preventDefault: () => (prevented = true),
  stopImmediatePropagation: () => {},
});

assert.equal(clipboard.size, 0, "edit mode must not be intercepted");
assert.equal(prevented, false, "edit mode must retain native copy behavior");
assert.equal(plugin.commands[0].checkCallback(true), false, "command must be hidden in edit mode");

leaves.length = 0;
plugin.attachToCanvasDocuments();
assert.equal(listeners.size, 0, "listener must be removed when a document has no Canvas leaves");
assert.equal(plugin.attachedDocuments.size, 0, "closed Canvas documents must not be retained");

leaves.push({ view });
plugin.attachToCanvasDocuments();
assert.equal(listeners.get("copy").capture, true, "listener must be restored when Canvas reopens");

plugin.onunload();
assert.equal(listeners.size, 0, "copy listener must be removed on unload");

console.log("Canvas Read-Only Copy tests passed.");
