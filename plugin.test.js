const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");

class Plugin {
  constructor(app) {
    this.app = app;
    this.commands = [];
    this.settingTabs = [];
  }

  addCommand(command) {
    this.commands.push(command);
  }

  registerEvent() {}

  addSettingTab(settingTab) {
    this.settingTabs.push(settingTab);
  }

  async loadData() {
    return this.app.pluginData;
  }

  async saveData(data) {
    this.app.pluginData = { ...data };
  }
}

class PluginSettingTab {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = { empty() {} };
  }
}

class Setting {
  constructor() {
    Setting.instances.push(this);
  }

  setName() {
    return this;
  }

  setDesc() {
    return this;
  }

  addDropdown(callback) {
    this.dropdown = {
      options: new Map(),
      addOption(value, label) {
        this.options.set(value, label);
        return this;
      },
      setValue(value) {
        this.value = value;
        return this;
      },
      onChange(handler) {
        this.changeHandler = handler;
        return this;
      },
    };
    callback(this.dropdown);
    return this;
  }
}
Setting.instances = [];

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "obsidian") {
    return {
      Plugin,
      PluginSettingTab,
      Setting,
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
const editableTargets = [
  { label: "input", nodeType: 1, tagName: "input" },
  { label: "textarea", nodeType: 1, tagName: "textarea" },
  {
    label: "content-editable",
    nodeType: 1,
    tagName: "div",
    isContentEditable: true,
  },
];
const doc = {
  body,
  defaultView: {
    getSelection: () => selection,
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

const canvasRoot = {
  contains: (node) => node === ancestor || editableTargets.includes(node),
};
const view = {
  getViewType: () => "canvas",
  containerEl: { ownerDocument: doc },
  canvas: { readonly: true, canvasEl: canvasRoot },
};
const otherCanvasView = {
  getViewType: () => "canvas",
  containerEl: { ownerDocument: doc },
  canvas: { readonly: true, canvasEl: { contains: () => false } },
};
const leaves = [{ view }, { view: otherCanvasView }];
const workspace = {
  activeLeaf: { view },
  getLeavesOfType: () => leaves,
  on: () => ({}),
  onLayoutReady: (callback) => callback(),
};

async function runTests() {
  const app = { workspace };
  const plugin = new CanvasReadonlyCopyPlugin(app);
  await plugin.onload();

  assert.equal(listeners.get("copy").capture, true, "copy listener must use capture phase");
  assert.equal(plugin.commands.length, 0, "the plugin must not register custom copy commands");
  assert.equal(plugin.settingTabs.length, 1, "the plugin must register its settings tab");
  assert.equal(plugin.settings.copyMode, "markdown", "Markdown must remain the default copy format");

  plugin.settingTabs[0].display();
  const copyFormatDropdown = Setting.instances[0].dropdown;
  assert.deepEqual(
    [...copyFormatDropdown.options],
    [
      ["markdown", "Markdown (with formatting)"],
      ["rendered-text", "Rendered text (plain)"],
      ["rendered-rich-text", "Rendered text (rich formatting)"],
    ],
    "the settings dropdown must offer all copy formats",
  );
  assert.equal(copyFormatDropdown.value, "markdown");

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
  await copyFormatDropdown.changeHandler("rendered-text");
  assert.equal(plugin.settings.copyMode, "rendered-text");
  assert.equal(app.pluginData.copyMode, "rendered-text", "the selected copy format must persist");
  plugin.settings.copyMode = "markdown";
  await plugin.loadSettings();
  assert.equal(plugin.settings.copyMode, "rendered-text", "the saved copy format must be restored");
  plugin.handleCopyEvent(doc, {
    target: body,
    composedPath: () => [body, doc],
    clipboardData: { setData: (type, value) => clipboard.set(type, value) },
    preventDefault: () => (prevented = true),
    stopImmediatePropagation: () => (stopped = true),
  });

  assert.equal(clipboard.get("text/plain"), "Hello");
  assert.equal(clipboard.has("text/html"), false, "rendered-text mode must copy without rich formatting");
  assert.equal(prevented, true);
  assert.equal(stopped, true);

  clipboard.clear();
  prevented = false;
  stopped = false;
  await copyFormatDropdown.changeHandler("rendered-rich-text");
  assert.equal(plugin.settings.copyMode, "rendered-rich-text");
  assert.equal(
    app.pluginData.copyMode,
    "rendered-rich-text",
    "the rich rendered-text format must persist",
  );
  plugin.settings.copyMode = "markdown";
  await plugin.loadSettings();
  assert.equal(plugin.settings.copyMode, "rendered-rich-text");
  plugin.handleCopyEvent(doc, {
    target: body,
    composedPath: () => [body, doc],
    clipboardData: { setData: (type, value) => clipboard.set(type, value) },
    preventDefault: () => (prevented = true),
    stopImmediatePropagation: () => (stopped = true),
  });

  assert.equal(clipboard.get("text/plain"), "Hello");
  assert.equal(clipboard.get("text/html"), "<strong>Hello</strong>");
  assert.equal(prevented, true);
  assert.equal(stopped, true);
  await copyFormatDropdown.changeHandler("markdown");

  clipboard.clear();
  prevented = false;
  stopped = false;
  let clipboardWrites = 0;
  plugin.handleCopyEvent(doc, {
    defaultPrevented: true,
    target: body,
    composedPath: () => [body, doc],
    clipboardData: { setData: () => clipboardWrites++ },
    preventDefault: () => (prevented = true),
    stopImmediatePropagation: () => (stopped = true),
  });

  assert.equal(clipboardWrites, 0, "an already-handled copy must retain its clipboard data");
  assert.equal(prevented, false, "an already-handled copy must not be prevented again");
  assert.equal(stopped, false, "an already-handled copy must reach its remaining handlers");

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
      view,
      canvasRoot,
      doc,
    ),
    true,
    "copy events dispatched inside Canvas must be accepted",
  );

  clipboard.clear();
  prevented = false;
  stopped = false;
  workspace.activeLeaf = { view: otherCanvasView };
  plugin.handleCopyEvent(doc, {
    target: body,
    composedPath: () => [body, doc],
    clipboardData: { setData: (type, value) => clipboard.set(type, value) },
    preventDefault: () => (prevented = true),
    stopImmediatePropagation: () => (stopped = true),
  });

  assert.equal(
    clipboard.size,
    0,
    "body-targeted copy must ignore a selection in an inactive Canvas",
  );
  assert.equal(
    prevented,
    false,
    "inactive Canvas selections must not replace native copy behavior",
  );
  assert.equal(
    stopped,
    false,
    "inactive Canvas selections must not block other copy handlers",
  );

  workspace.activeLeaf = { view };
  for (const editableTarget of editableTargets) {
    clipboard.clear();
    prevented = false;
    stopped = false;
    plugin.handleCopyEvent(doc, {
      target: editableTarget,
      composedPath: () => [editableTarget, canvasRoot, body, doc],
      clipboardData: { setData: (type, value) => clipboard.set(type, value) },
      preventDefault: () => (prevented = true),
      stopImmediatePropagation: () => (stopped = true),
    });

    assert.equal(
      clipboard.size,
      0,
      `${editableTarget.label} selections inside Canvas must retain native copy behavior`,
    );
    assert.equal(
      prevented,
      false,
      `${editableTarget.label} copies inside Canvas must not be replaced`,
    );
    assert.equal(
      stopped,
      false,
      `${editableTarget.label} copies inside Canvas must reach their own handlers`,
    );
  }

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
}

runTests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
