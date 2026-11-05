import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { defaultWorkspace, STORAGE_KEY } from '../../src/workspace';

async function start(page: Page, source: string) {
  const workspace = defaultWorkspace();
  workspace.files = [{ path: 'main.cpp', content: source }];
  await page.addInitScript(({ key, workspace }) => { if (window === top) localStorage.setItem(key, JSON.stringify(workspace)); }, { key: STORAGE_KEY, workspace });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Compiler connected' })).toBeVisible();
  const response = page.waitForResponse(response => response.url().endsWith('/api/compile'));
  await page.getByRole('button', { name: 'Run code' }).click();
  const result = await (await response).json();
  expect(result.ok, result.logs).toBe(true);
  await expect(page.getByRole('textbox', { name: 'Program input', exact: true })).toBeEnabled();
  await expect(page.locator('.output-status')).toContainText('Waiting for input');
}

async function enter(page: Page, value: string, nextPrompt?: string) {
  const input = page.getByRole('textbox', { name: 'Program input', exact: true });
  await expect(input).toBeEnabled();
  await input.fill(value);
  await input.press('Enter');
  if (nextPrompt) {
    await expect(page.locator('.terminal-body')).toContainText(nextPrompt);
    await expect(input).toBeEnabled();
  }
}

for (const mode of ['Bresenham', 'circle', 'DDA']) {
  test(`the classroom program accepts interactive cin and renders ${mode}`, async ({ page }) => {
    let source = await readFile(new URL('../fixtures/line-circle.cpp', import.meta.url), 'utf8');
    if (mode === 'DDA') source = source.replace('glutDisplayFunc(Bresenham)', 'glutDisplayFunc(DDA)');
    await start(page, source);
    await expect(page.locator('.terminal-body')).toContainText('Enter your choice:');
    await expect(page.locator('.terminal-body')).not.toContainText('Invalid choice!');
    if (mode === 'circle') {
      await enter(page, '2', 'X-coordinate:');
      await enter(page, '320', 'Y-coordinate:');
      await enter(page, '240', 'Enter the radius:');
      await enter(page, '100');
    } else {
      await enter(page, '1', 'Enter an Initial Point');
      await enter(page, '100 100', 'Enter the Final Point');
      await enter(page, '500 350');
    }
    await expect(page.locator('.output-status')).toContainText('Running');
    await expect(page.locator('.terminal-body')).toContainText('Window: Line and Circle Drawing');
    const canvas = page.frameLocator('iframe').locator('canvas');
    await expect.poll(async () => {
      const image = PNG.sync.read(await canvas.screenshot());
      let dark = 0;
      for (let i = 0; i < image.data.length; i += 4) if (image.data[i] < 60 && image.data[i + 1] < 60 && image.data[i + 2] < 60) dark++;
      return dark;
    }).toBeGreaterThan(100);
    await page.screenshot({ path: `.cache/stdin-${mode}.png` });
  });
}

test('scanf, UTF-8 getline, EOF and stopping an input wait work without blocking the UI', async ({ page }) => {
  const source = '#include <cstdio>\n#include <iostream>\n#include <string>\n#include <limits>\nint main(){int n;std::printf("Number: ");if(std::scanf("%d",&n)!=1)return 0;std::cout<<"Got "<<n<<"\\n";std::cin.ignore(std::numeric_limits<std::streamsize>::max(),\'\\n\');std::cout<<"Name: ";std::string name;std::getline(std::cin,name);std::cout<<"Hello "<<name<<"\\nAnother value: ";if(!(std::cin>>n))std::cout<<"EOF received\\n";return 0;}';
  await start(page, source);
  await expect(page.locator('.terminal-body')).toContainText('Number:');
  // An ordinary input wait must outlive the 12-second hung-worker watchdog.
  await page.waitForTimeout(13_200);
  await expect(page.getByRole('textbox', { name: 'Program input', exact: true })).toBeEnabled();
  await expect(page.locator('.output-status')).toContainText('Waiting for input');
  await enter(page, '42', 'Name:');
  await enter(page, 'শিক্ষার্থী', 'Another value:');
  await expect(page.locator('.terminal-body')).toContainText('Hello শিক্ষার্থী');
  await page.getByRole('button', { name: 'EOF', exact: true }).click();
  await expect(page.locator('.terminal-body')).toContainText('EOF received');
  await expect(page.locator('.output-status')).toContainText('Stopped');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.getByRole('textbox', { name: 'Program input', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Settings', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Stop runtime', exact: true }).click();
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Program input', exact: true })).toBeDisabled();
});
