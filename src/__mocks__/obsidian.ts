// Vitest mock for Obsidian. Implements the subset of the API used by adapters
// and their tests. Mirrors the public shapes from obsidian.d.ts; behavior is
// minimal but observable.

export type App = Record<string, unknown>;
export interface WorkspaceLeaf {
  app: App;
}
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
}
export interface MarkdownPostProcessorContext {
  sourcePath: string;
  getSectionInfo(el: HTMLElement): { lineStart: number; lineEnd: number; text: string } | null;
}

export class Plugin {
  app: App;
  manifest: PluginManifest;
  views: Record<string, (leaf: WorkspaceLeaf) => unknown> = {};
  postprocessors: Record<string, (...args: unknown[]) => unknown> = {};
  settingTabs: PluginSettingTab[] = [];
  commands: unknown[] = [];
  storedData: unknown = null;
  constructor(app: App, manifest: PluginManifest) {
    this.app = app;
    this.manifest = manifest;
  }
  registerView(type: string, factory: (leaf: WorkspaceLeaf) => unknown) {
    this.views[type] = factory;
  }
  registerExtensions(_extensions: string[], _viewType: string) {}
  registerMarkdownCodeBlockProcessor(
    lang: string,
    handler: (src: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => void,
  ) {
    this.postprocessors[lang] = handler;
  }
  addSettingTab(tab: PluginSettingTab) {
    this.settingTabs.push(tab);
  }
  addCommand(cmd: unknown) {
    this.commands.push(cmd);
  }
  loadData(): Promise<unknown> {
    return Promise.resolve(this.storedData);
  }
  saveData(data: unknown): Promise<void> {
    this.storedData = data;
    return Promise.resolve();
  }
}

export class PluginSettingTab {
  app: App;
  plugin: Plugin;
  containerEl: HTMLElement;
  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = document.createElement("div");
  }
  display() {}
  hide() {}
}

export class TextFileView {
  app: App;
  data = "";
  contentEl: HTMLElement;
  actionsEl: HTMLElement;
  scope: Scope | null = null;
  saveCount = 0;
  constructor(public leaf: WorkspaceLeaf) {
    this.app = (leaf as unknown as { app: App }).app;
    this.contentEl = document.createElement("div");
    this.actionsEl = document.createElement("div");
  }
  addAction(icon: string, title: string, callback: (evt: MouseEvent) => void): HTMLElement {
    const btn = document.createElement("button");
    btn.setAttribute("aria-label", title);
    btn.dataset.icon = icon;
    btn.addEventListener("click", (e) => callback(e as MouseEvent));
    this.actionsEl.appendChild(btn);
    return btn;
  }
  async onOpen(): Promise<void> {}
  async onClose(): Promise<void> {}
  getViewData(): string {
    return this.data;
  }
  setViewData(data: string, _clear: boolean): void {
    this.data = data;
  }
  clear(): void {
    this.data = "";
  }
  requestSave(): void {
    this.saveCount += 1;
  }
  getViewType(): string {
    return "";
  }
}

export class TFile {
  constructor(public path: string) {}
}

type KeymapHandler = (...args: unknown[]) => unknown;
export class Scope {
  keys: Array<{ modifiers: string[] | null; key: string | null; handler: KeymapHandler }> = [];
  constructor(public parent?: Scope) {}
  register(modifiers: string[] | null, key: string | null, handler: KeymapHandler): KeymapHandler {
    this.keys.push({ modifiers, key, handler });
    return handler;
  }
  unregister(_handler: unknown): void {}
}

export function normalizePath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/$/, "")
    .trim();
}

export class Notice {
  static instances: Notice[] = [];
  constructor(
    public message: string,
    public timeout?: number,
  ) {
    Notice.instances.push(this);
  }
}

export class Setting {
  settingEl: HTMLElement;
  nameValue = "";
  descValue = "";
  constructor(public containerEl: HTMLElement) {
    this.settingEl = document.createElement("div");
    containerEl.appendChild(this.settingEl);
  }
  setName(name: string): this {
    this.nameValue = name;
    return this;
  }
  setDesc(desc: string): this {
    this.descValue = desc;
    return this;
  }
  addText(cb: (text: TextComponent) => void): this {
    const c = new TextComponent();
    this.settingEl.appendChild(c.inputEl);
    cb(c);
    return this;
  }
  addDropdown(cb: (dd: DropdownComponent) => void): this {
    const c = new DropdownComponent();
    this.settingEl.appendChild(c.selectEl);
    cb(c);
    return this;
  }
  addToggle(cb: (t: ToggleComponent) => void): this {
    const c = new ToggleComponent();
    this.settingEl.appendChild(c.toggleEl);
    cb(c);
    return this;
  }
}

export class TextComponent {
  inputEl: HTMLInputElement = document.createElement("input");
  changeHandlers: Array<(v: string) => void> = [];
  setValue(v: string): this {
    this.inputEl.value = v;
    return this;
  }
  onChange(cb: (v: string) => void): this {
    this.changeHandlers.push(cb);
    return this;
  }
}
export class DropdownComponent {
  selectEl: HTMLSelectElement = document.createElement("select");
  changeHandlers: Array<(v: string) => void> = [];
  addOption(value: string, display: string): this {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = display;
    this.selectEl.appendChild(opt);
    return this;
  }
  setValue(v: string): this {
    this.selectEl.value = v;
    return this;
  }
  onChange(cb: (v: string) => void): this {
    this.changeHandlers.push(cb);
    this.selectEl.addEventListener("change", () => cb(this.selectEl.value));
    return this;
  }
}
export class ToggleComponent {
  toggleEl: HTMLElement = document.createElement("div");
  value = false;
  changeHandlers: Array<(v: boolean) => void> = [];
  setValue(v: boolean): this {
    this.value = v;
    return this;
  }
  onChange(cb: (v: boolean) => void): this {
    this.changeHandlers.push(cb);
    return this;
  }
}

export const Platform = {
  isMobile: false,
  isPhone: false,
  isTablet: false,
  isDesktop: true,
};

export function setIcon(el: HTMLElement, iconId: string): void {
  el.dataset.icon = iconId;
}

export class MenuItem {
  titleText = "";
  iconName = "";
  disabled = false;
  warning = false;
  clickHandler: (() => void) | null = null;
  submenu: Menu | null = null;
  setTitle(t: string): this {
    this.titleText = t;
    return this;
  }
  setIcon(i: string): this {
    this.iconName = i;
    return this;
  }
  setDisabled(d: boolean): this {
    this.disabled = d;
    return this;
  }
  setWarning(w: boolean): this {
    this.warning = w;
    return this;
  }
  onClick(cb: () => void): this {
    this.clickHandler = cb;
    return this;
  }
  setSubmenu(): Menu {
    this.submenu = new Menu();
    return this.submenu;
  }
}

export class Menu {
  items: MenuItem[] = [];
  separatorCount = 0;
  shown = false;
  addItem(cb: (item: MenuItem) => void): this {
    const item = new MenuItem();
    cb(item);
    this.items.push(item);
    return this;
  }
  addSeparator(): this {
    this.separatorCount += 1;
    return this;
  }
  showAtMouseEvent(_e: MouseEvent): this {
    this.shown = true;
    return this;
  }
  showAtPosition(_p: { x: number; y: number }): this {
    this.shown = true;
    return this;
  }
  hide(): this {
    this.shown = false;
    return this;
  }
}
