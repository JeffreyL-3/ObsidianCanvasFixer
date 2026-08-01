const { Notice, Plugin, htmlToMarkdown } = require("obsidian");

const CANVAS_VIEW_TYPE = "canvas";

module.exports = class CanvasReadonlyCopyPlugin extends Plugin {
  onload() {
    this.attachedDocuments = new Map();

    this.addCommand({
      id: "copy-readonly-canvas-selection",
      name: "Copy selected text from read-only canvas",
      checkCallback: (checking) => {
        const canvasView = this.getActiveReadonlyCanvasView();
        if (!canvasView) return false;

        if (!checking) void this.copyWithCommand(canvasView);
        return true;
      },
    });

    const attach = () => this.attachToCanvasDocuments();
    this.registerEvent(this.app.workspace.on("layout-change", attach));
    this.registerEvent(this.app.workspace.on("active-leaf-change", attach));
    this.app.workspace.onLayoutReady(attach);
  }

  onunload() {
    for (const [doc, handler] of this.attachedDocuments) {
      doc.removeEventListener("copy", handler, true);
    }
    this.attachedDocuments.clear();
  }

  attachToCanvasDocuments() {
    const liveDocuments = new Set();

    for (const leaf of this.app.workspace.getLeavesOfType(CANVAS_VIEW_TYPE)) {
      const doc = leaf.view?.containerEl?.ownerDocument;
      if (!doc) continue;

      liveDocuments.add(doc);
      if (this.attachedDocuments.has(doc)) continue;

      const handler = (event) => this.handleCopyEvent(doc, event);
      doc.addEventListener("copy", handler, true);
      this.attachedDocuments.set(doc, handler);
    }

    for (const [doc, handler] of this.attachedDocuments) {
      if (liveDocuments.has(doc)) continue;

      doc.removeEventListener("copy", handler, true);
      this.attachedDocuments.delete(doc);
    }
  }

  handleCopyEvent(doc, event) {
    if (!event.clipboardData || event.defaultPrevented) return;

    const selection = this.findReadonlyCanvasSelection(doc, null, event);
    if (!selection) return;

    // ClipboardEvent data must be written synchronously while the copy event is active.
    event.clipboardData.setData("text/plain", selection.markdown);
    event.clipboardData.setData("text/html", selection.html);
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  findReadonlyCanvasSelection(doc, expectedView = null, copyEvent = null) {
    const selection = doc.defaultView?.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return null;
    }

    const range = selection.getRangeAt(0);
    const ancestor =
      range.commonAncestorContainer.nodeType === 1
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;

    if (!ancestor) return null;

    const candidateViews = expectedView ? [expectedView] : this.getReadonlyCanvasViews();
    const canvasView = candidateViews.find((view) => {
      if (!this.isReadonlyCanvasView(view)) return false;
      if (view.containerEl.ownerDocument !== doc) return false;
      const canvasRoot = view.canvas?.canvasEl ?? view.containerEl;
      if (!canvasRoot.contains(ancestor)) return false;
      return (
        !copyEvent ||
        this.eventOriginatesWithinCanvas(copyEvent, view, canvasRoot, doc)
      );
    });

    if (!canvasView) return null;
    return this.serializeSelection(doc, selection, range);
  }

  eventOriginatesWithinCanvas(event, canvasView, canvasRoot, doc) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    const target = path[0] ?? event.target;
    if (!target) return false;

    // Editable controls should copy natively; form controls can maintain their
    // own selection without replacing document.getSelection().
    if (this.pathContainsEditableControl(path, target, canvasRoot)) return false;

    if (path.includes(canvasRoot)) return true;
    if (
      target === canvasRoot ||
      (typeof target.nodeType === "number" && canvasRoot.contains(target))
    ) {
      return true;
    }

    // Non-editable selections may dispatch copy at the document body. Since that
    // target carries no origin information, only trust it for the active Canvas.
    const activeCanvasView = this.getActiveReadonlyCanvasView();
    return (
      activeCanvasView === canvasView &&
      activeCanvasView.containerEl.ownerDocument === doc &&
      (target === doc || target === doc.body || target === doc.documentElement)
    );
  }

  pathContainsEditableControl(path, target, canvasRoot) {
    const nodes = path.length ? path : [target];

    for (const node of nodes) {
      if (node === canvasRoot) break;

      const tagName =
        typeof node?.tagName === "string" ? node.tagName.toUpperCase() : "";
      if (
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        node?.isContentEditable === true
      ) {
        return true;
      }
    }

    return false;
  }

  serializeSelection(doc, selection, range) {
    const text = selection.toString();
    if (!text.trim()) return null;

    const wrapper = doc.createElement("div");
    wrapper.appendChild(range.cloneContents());

    const html = wrapper.innerHTML || this.escapeHtml(text);
    const converted = htmlToMarkdown(html);
    const markdown = converted.trim() ? converted : text;
    return { html, markdown };
  }

  getReadonlyCanvasViews() {
    return this.app.workspace
      .getLeavesOfType(CANVAS_VIEW_TYPE)
      .map((leaf) => leaf.view)
      .filter((view) => this.isReadonlyCanvasView(view));
  }

  getActiveReadonlyCanvasView() {
    const view = this.app.workspace.activeLeaf?.view;
    return this.isReadonlyCanvasView(view) ? view : null;
  }

  isReadonlyCanvasView(view) {
    return view?.getViewType?.() === CANVAS_VIEW_TYPE && view.canvas?.readonly === true;
  }

  async copyWithCommand(canvasView) {
    const doc = canvasView.containerEl.ownerDocument;
    const selection = this.findReadonlyCanvasSelection(doc, canvasView);
    if (!selection) {
      new Notice("No text is selected in the active read-only canvas.");
      return;
    }

    try {
      const clipboard = doc.defaultView?.navigator?.clipboard;
      if (!clipboard) throw new Error("Clipboard API is unavailable");

      await clipboard.writeText(selection.markdown);
      new Notice("Canvas selection copied.");
    } catch (error) {
      console.error("[Canvas Read-Only Copy] Clipboard write failed", error);
      new Notice("Clipboard write failed. Check the developer console for details.");
    }
  }

  escapeHtml(text) {
    return text
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
};
