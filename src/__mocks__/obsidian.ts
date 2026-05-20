// Vitest mock for Obsidian. Filled in incrementally as adapter tests require members.

export class Plugin {
  app: App;
  manifest: PluginManifest;
  constructor(app: App, manifest: PluginManifest) {
    this.app = app;
    this.manifest = manifest;
  }
  registerView(_type: string, _factory: (leaf: WorkspaceLeaf) => unknown) {}
  registerMarkdownCodeBlockProcessor(
    _lang: string,
    _handler: (src: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => void
  ) {}
  addSettingTab(_tab: PluginSettingTab) {}
  loadData(): Promise<unknown> {
    return Promise.resolve(null);
  }
  saveData(_data: unknown): Promise<void> {
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
  data: string = "";
  contentEl: HTMLElement;
  constructor(public leaf: WorkspaceLeaf) {
    this.app = (leaf as unknown as { app: App }).app;
    this.contentEl = document.createElement("div");
  }
  getViewData(): string {
    return this.data;
  }
  setViewData(data: string, _clear: boolean): void {
    this.data = data;
  }
  clear(): void {
    this.data = "";
  }
  requestSave(): void {}
  getViewType(): string {
    return "";
  }
}

export class Setting {
  settingEl: HTMLElement;
  constructor(public containerEl: HTMLElement) {
    this.settingEl = document.createElement("div");
    containerEl.appendChild(this.settingEl);
  }
  setName(_name: string): this { return this; }
  setDesc(_desc: string): this { return this; }
  addText(cb: (text: TextComponent) => void): this {
    cb(new TextComponent());
    return this;
  }
  addDropdown(cb: (dd: DropdownComponent) => void): this {
    cb(new DropdownComponent());
    return this;
  }
  addToggle(cb: (t: ToggleComponent) => void): this {
    cb(new ToggleComponent());
    return this;
  }
}

export class TextComponent {
  inputEl: HTMLInputElement = document.createElement("input");
  setValue(v: string): this { this.inputEl.value = v; return this; }
  onChange(_cb: (v: string) => void): this { return this; }
}
export class DropdownComponent {
  selectEl: HTMLSelectElement = document.createElement("select");
  addOption(_value: string, _display: string): this { return this; }
  setValue(_v: string): this { return this; }
  onChange(_cb: (v: string) => void): this { return this; }
}
export class ToggleComponent {
  toggleEl: HTMLElement = document.createElement("div");
  setValue(_v: boolean): this { return this; }
  onChange(_cb: (v: boolean) => void): this { return this; }
}

export interface WorkspaceLeaf { app: App; }
export interface App {}
export interface PluginManifest { id: string; name: string; version: string; }
export interface MarkdownPostProcessorContext {
  sourcePath: string;
  getSectionInfo(el: HTMLElement): { lineStart: number; lineEnd: number; text: string } | null;
}
