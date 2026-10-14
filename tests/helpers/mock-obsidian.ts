// Vitest resolves "obsidian" to tests/__mocks__/obsidian.ts, which records menus and notices for assertions.
// The real typings do not know those members, so tests reach them through these typed views.
import { Menu, Notice } from "obsidian";
import type { Menu as MockMenu, Notice as MockNotice } from "../__mocks__/obsidian";

export const MenuMock = Menu as unknown as typeof MockMenu;
export const NoticeMock = Notice as unknown as typeof MockNotice;
