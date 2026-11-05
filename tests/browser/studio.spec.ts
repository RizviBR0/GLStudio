import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { defaultWorkspace, STORAGE_KEY } from '../../src/workspace';
import { examples } from '../../src/examples';
import type { SourceFile } from '../../shared/contracts';

async function openWorkspace(page: Page, files?: SourceFile[]) {
  const workspace = defaultWorkspace();
  if (files) Object.assign(workspace, { files, activeFile: files[0].path, openFiles: files.map(file => file.path) });
  await page.addInitScript(({ key, workspace }) => {
    if (window === window.top && !sessionStorage.getItem('glstudio.test.seeded')) {
      localStorage.setItem(key, JSON.stringify(workspace));
      sessionStorage.setItem('glstudio.test.seeded', '1');
    }
  }, { key: STORAGE_KEY, workspace });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Compiler connected' })).toBeVisible();
  await expect(page.locator('.monaco-editor')).toBeVisible();
  await expect(page.locator('.view-lines')).toContainText(files?.[0].content.split('\n')[0] || '// Welcome to GL Studio.');
}

async function run(page: Page) {
  const response = page.waitForResponse(response => response.url().endsWith('/api/compile') && response.request().method() === 'POST', { timeout: 140_000 });
  await page.getByRole('button', { name: 'Run code' }).click();
  const result = await (await response).json();
  expect(result.ok, result.logs).toBe(true);
  await expect(page.locator('.output-status')).toContainText('Running');
  await expect(page.locator('.terminal-body')).toContainText('Window:');
}

test('real C++ renders pixels, exports a screenshot, pauses, resizes and stops', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await openWorkspace(page);
  await run(page);
  const canvas = page.frameLocator('iframe[title="Isolated C++ graphics output"]').locator('canvas');
  await expect.poll(async () => {
    const image = PNG.sync.read(await canvas.screenshot());
    const i = (Math.floor(image.height / 2) * image.width + Math.floor(image.width / 2)) * 4;
    return Math.max(image.data[i], image.data[i + 1], image.data[i + 2]);
  }, { timeout: 20_000, message: 'The center of the actual Wasm-rendered triangle must contain colored pixels.' }).toBeGreaterThan(80);
  const frame = page.frames().find(frame => frame.parentFrame())!;
  expect(await frame.evaluate(() => { try { void parent.document.body; return false; } catch { return true; } })).toBe(true);
  await page.screenshot({ path: '.cache/studio-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Pause animation callbacks', exact: true }).click();
  await expect(page.locator('.output-status')).toContainText('Paused');
  await page.getByRole('button', { name: 'Resume animation callbacks', exact: true }).click();
  await expect(page.locator('.output-status')).toContainText('Running');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Capture screenshot', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('gl-studio-output.png');
  const splitter = page.getByRole('separator', { name: 'Resize editor and output' });
  await splitter.focus(); await page.keyboard.press('ArrowLeft');
  await expect(splitter).toHaveAttribute('aria-valuenow', '53');
  await page.getByRole('button', { name: 'Stop runtime', exact: true }).click();
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.locator('.output-status')).toContainText('Stopped');
  expect(errors).toEqual([]);
});

test('compiler diagnostics preserve the editor filename and line', async ({ page }) => {
  await openWorkspace(page, [{ path: 'main.cpp', content: 'int main() {\n  unknown_function();\n}\n' }]);
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.diagnostic-row')).toContainText('main.cpp · Ln 2');
  await expect(page.locator('.diagnostic-row')).toContainText('unknown_function');
  await page.locator('.diagnostic-row').first().click();
  await expect(page.locator('.cursor-status')).toContainText('Ln 2');
  await expect(page.locator('iframe')).toHaveCount(0);
});

test('a tight C++ loop cannot block the IDE or its Stop control', async ({ page }) => {
  const content = await readFile(new URL('../fixtures/infinite-loop.cpp', import.meta.url), 'utf8');
  await openWorkspace(page, [{ path: 'main.cpp', content }]);
  const response = page.waitForResponse(response => response.url().endsWith('/api/compile'));
  await page.getByRole('button', { name: 'Run code' }).click();
  const result = await (await response).json();
  expect(result.ok, result.logs).toBe(true);
  await expect(page.locator('.terminal-body')).toContainText('will now enter an infinite loop');
  await page.getByRole('button', { name: 'Settings', exact: true }).first().click({ timeout: 2000 });
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2000 });
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Stop runtime', exact: true }).click({ timeout: 2000 });
  await expect(page.locator('iframe')).toHaveCount(0, { timeout: 2000 });
  await expect(page.locator('.output-status')).toContainText('Stopped');
  const secondBuild = page.waitForResponse(response => response.url().endsWith('/api/compile'));
  await page.getByRole('button', { name: 'Run code' }).click();
  expect((await (await secondBuild).json()).ok).toBe(true);
  await expect(page.locator('.output-status')).toContainText('Running');
  await expect(page.locator('.output-status')).toContainText('Needs attention', { timeout: 16_000 });
  await expect(page.locator('.terminal-body')).toContainText('stopped responding for 12 seconds and was terminated');
  await page.getByRole('button', { name: 'Stop runtime', exact: true }).click();
});

test('timer animation, keyboard, mouse and reshape callbacks run in the graphics worker', async ({ page }) => {
  const content = await readFile(new URL('../fixtures/interaction.cpp', import.meta.url), 'utf8');
  await openWorkspace(page, [{ path: 'main.cpp', content }]);
  await run(page);
  await expect(page.locator('.viewport-footer')).toContainText(/[1-9]\d* FPS/);
  const canvas = page.frameLocator('iframe').locator('canvas');
  await canvas.click({ position: { x: 100, y: 70 } });
  await page.keyboard.press('a');
  await expect(page.locator('.terminal-body')).toContainText(/mouse 0 0 at \d+ \d+/);
  const pointer = (await page.locator('.terminal-body').innerText()).match(/mouse 0 0 at (\d+) (\d+)/)!;
  expect(Math.abs(Number(pointer[1]) - 100)).toBeLessThanOrEqual(1);
  expect(Math.abs(Number(pointer[2]) - 70)).toBeLessThanOrEqual(1);
  await expect(page.locator('.terminal-body')).toContainText(`key 97 at ${pointer[1]} ${pointer[2]}`);
  await page.getByRole('button', { name: 'Pause animation callbacks', exact: true }).click();
  await expect(page.locator('.output-status')).toContainText('Paused');
  const paused = await canvas.screenshot();
  await page.waitForTimeout(350);
  expect(await canvas.screenshot()).toEqual(paused);
  await page.getByRole('button', { name: 'Resume animation callbacks', exact: true }).click();
  await expect.poll(async () => (await canvas.screenshot()).equals(paused)).toBe(false);
  const before = (await page.locator('.terminal-body').innerText()).match(/reshape \d+ \d+/g)?.length ?? 0;
  await page.getByRole('separator', { name: 'Resize editor and output' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await page.locator('.terminal-body').innerText()).match(/reshape \d+ \d+/g)?.length ?? 0).toBeGreaterThan(before);
  await page.getByRole('button', { name: 'Stop runtime', exact: true }).click();
});

test('the DDA assignment renders points from its C++ algorithm', async ({ page }) => {
  await openWorkspace(page, examples[1].files);
  await run(page);
  const canvas = page.frameLocator('iframe').locator('canvas');
  await expect.poll(async () => {
    const image = PNG.sync.read(await canvas.screenshot());
    let colored = 0;
    for (let i = 0; i < image.data.length; i += 4) if (image.data[i + 1] > 100 || image.data[i + 2] > 100) colored++;
    return colored;
  }).toBeGreaterThan(150);
});

test('file changes and appearance persist, and a small screen has an intentional output switch', async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole('button', { name: 'New file', exact: true }).first().click();
  await page.getByLabel('File path', { exact: true }).fill('include/constants.h');
  await page.getByRole('button', { name: 'Create file', exact: true }).click();
  await expect(page.getByRole('tab', { name: /constants.h/ })).toBeVisible();
  await page.getByRole('button', { name: 'Rename or delete include/constants.h' }).click();
  await page.getByLabel('File path', { exact: true }).fill('include/color.h');
  await page.getByRole('button', { name: 'Save filename', exact: true }).click();
  await expect(page.getByRole('tab', { name: /color.h/ })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).first().click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('.saved-state')).toContainText('Saved locally');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('tab', { name: /color.h/ })).toBeVisible();
  await page.screenshot({ path: '.cache/studio-light.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('region', { name: 'Source editor', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Graphical output', exact: true })).not.toBeVisible();
  await page.locator('.mobile-switch').getByRole('button', { name: 'Output', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Graphical output', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Source editor', exact: true })).not.toBeVisible();
  await page.screenshot({ path: '.cache/studio-mobile.png' });
});
