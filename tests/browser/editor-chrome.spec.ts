import { test, expect } from '@playwright/test';
import { defaultWorkspace, STORAGE_KEY } from '../../src/workspace';

test('Find and Replace loads its icon font and replaces text in both themes', async ({ page }) => {
  const workspace = defaultWorkspace();
  workspace.files = [{ path: 'main.cpp', content: 'int sample = 1;\nint sampleTwo = 2;\n' }];
  await page.addInitScript(({ workspace, key }) => {
    if (window === top) localStorage.setItem(key, JSON.stringify(workspace));
  }, { workspace, key: STORAGE_KEY });
  await page.goto('/');
  await expect(page.locator('.monaco-editor')).toBeVisible();
  await page.locator('.view-lines').click();
  await page.keyboard.press('Control+h');
  const find = page.getByRole('textbox', { name: 'Find', exact: true });
  const replace = page.getByRole('textbox', { name: 'Replace', exact: true });
  await expect(replace).toBeVisible();
  await find.fill('sampleTwo');
  await replace.fill('renamedValue');
  await expect.poll(() => page.evaluate(async () => {
    await document.fonts.load('16px codicon');
    return Array.from(document.fonts).some(face => face.family === 'codicon' && face.status === 'loaded');
  })).toBe(true);
  for (const glyph of ['case-sensitive', 'whole-word', 'regex', 'find-previous-match', 'find-next-match', 'find-replace', 'find-replace-all', 'widget-close']) {
    await expect(page.locator(`.find-widget .codicon-${glyph}`)).toHaveCSS('font-family', 'codicon');
  }
  await page.locator('.find-widget .codicon-find-replace-all').click();
  await expect(page.locator('.view-lines')).toContainText('renamedValue');
  await expect(page.locator('.view-lines')).not.toContainText('sampleTwo');
  await page.screenshot({ path: '.cache/find-replace-dark.png' });
  await page.getByRole('button', { name: 'Settings', exact: true }).first().click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(find).toBeVisible();
  await expect(page.locator('.find-widget .codicon-widget-close')).toHaveCSS('font-family', 'codicon');
  await page.screenshot({ path: '.cache/find-replace-light.png' });
  await page.setViewportSize({ width: 800, height: 800 });
  await expect(page.getByLabel('Canvas size', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Frame rate', { exact: true })).toBeVisible();
  await expect(page.locator('.viewport-footer')).toHaveCSS('height', '24px');
});
