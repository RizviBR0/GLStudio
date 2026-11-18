import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
import classroom from '../../src/classroom-examples.json' with { type: 'json' };
import { defaultWorkspace, STORAGE_KEY } from '../../src/workspace';

const lighting = classroom[0];
const shapeVariants = ['Cone', 'Torus'].map(shape => ({
  ...lighting,
  name: `Object Lighting (${shape})`,
  files: [{ path: 'main.cpp', content: lighting.files[0].content.replace(
    'glutSolidSphere(1.0, 30, 30);',
    shape === 'Cone' ? 'glutSolidCone(1.0, 2.0, 30, 30);' : 'glutSolidTorus(0.3, 0.7, 30, 30);',
  ) }],
}));

for (const example of [...classroom, ...shapeVariants]) {
  test(`classroom: ${example.name} compiles and renders`, async ({ page }) => {
    const workspace = defaultWorkspace();
    Object.assign(workspace, { files: example.files, activeFile: 'main.cpp', openFiles: ['main.cpp'] });
    await page.addInitScript(({ key, workspace }) => {
      if (window === window.top) localStorage.setItem(key, JSON.stringify(workspace));
    }, { key: STORAGE_KEY, workspace });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Compiler connected' })).toBeVisible();
    await expect(page.locator('.monaco-editor')).toBeVisible();
    const response = page.waitForResponse(r => r.url().endsWith('/api/compile') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Run code' }).click();
    const result = await (await response).json();
    expect(result.ok, result.logs).toBe(true);
    await expect(page.locator('.output-status')).toContainText('Running');
    const canvas = page.frameLocator('iframe[title="Graphics output"]').locator('canvas');
    const image = async () => PNG.sync.read(await canvas.screenshot());
    const sky = async () => { const png = await image(); return png.data[(10 * png.width + 10) * 4]; };
    await expect.poll(async () => {
      const png = await image();
      const colors = new Set<string>();
      for (let i = 0; i < png.data.length; i += 4) colors.add(png.data.subarray(i, i + 3).toString('hex'));
      return colors.size;
    }, { message: 'The actual C++ program must draw visible geometry.' }).toBeGreaterThan(2);

    if (example.name === 'Day_Night') {
      await canvas.click();
      await page.keyboard.press('n');
      await expect.poll(async () => (await sky())).toBe(0);
      await page.keyboard.press('d');
      await expect.poll(async () => (await sky())).toBeGreaterThan(100);
    }
    if (example.name === 'Auto day+night') {
      const before = (await sky());
      await expect.poll(async () => (await sky()), { timeout: 5000 }).not.toBe(before);
    }
    if (['Rotation', 'Object Manipulation', '3D Transformation using function'].includes(example.name)) {
      const before = (await image()).data;
      await expect.poll(async () => (await image()).data.equals(before)).toBe(false);
    }
    if (example.name === 'Object Manipulation') {
      await canvas.click();
      await page.keyboard.press('a');
      await page.waitForTimeout(150);
      const stopped = (await image()).data;
      await page.waitForTimeout(250);
      expect((await image()).data.equals(stopped)).toBe(true);
      await page.keyboard.press('w');
      await expect.poll(async () => (await image()).data.equals(stopped)).toBe(false);
    }
    await expect(page.locator('.output-status')).toContainText('Running');
    await page.getByRole('button', { name: 'Stop program', exact: true }).click();
    await expect(page.locator('iframe')).toHaveCount(0);
  });
}
