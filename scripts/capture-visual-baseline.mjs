import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.AIGAUGE_BASE_URL ?? "http://127.0.0.1:1420";
const outputRoot =
  process.env.AIGAUGE_VISUAL_DIR ??
  path.join(process.cwd(), "artifacts", "visual", process.platform);

const ensureDir = async (dirPath) => {
  await fs.mkdir(dirPath, { recursive: true });
};

const waitForStableUi = async (page) => {
  await page.waitForTimeout(1000);
};

const captureMainViews = async (page, theme, outputDir) => {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate((nextTheme) => {
    localStorage.setItem("aigauge-theme", nextTheme);
  }, theme);
  await page.reload({ waitUntil: "networkidle" });
  await waitForStableUi(page);

  await page.screenshot({
    path: path.join(outputDir, `${theme}-dashboard.png`),
    fullPage: true,
  });

  const analyticsButton = page.getByRole("button", {
    name: "Navigate to Analytics",
  });
  await analyticsButton.click();
  await waitForStableUi(page);
  await page.screenshot({
    path: path.join(outputDir, `${theme}-analytics.png`),
    fullPage: true,
  });

  const settingsButton = page.getByRole("button", {
    name: "Navigate to Settings",
  });
  await settingsButton.click();
  await waitForStableUi(page);
  await page.screenshot({
    path: path.join(outputDir, `${theme}-settings.png`),
    fullPage: true,
  });
};

const captureTrayView = async (browser, theme, outputDir) => {
  const trayContext = await browser.newContext({
    viewport: { width: 420, height: 540 },
  });
  const trayPage = await trayContext.newPage();

  await trayPage.goto(`${baseUrl}/#/tray`, { waitUntil: "networkidle" });
  await trayPage.evaluate((nextTheme) => {
    localStorage.setItem("aigauge-theme", nextTheme);
  }, theme);
  await trayPage.reload({ waitUntil: "networkidle" });
  await waitForStableUi(trayPage);

  await trayPage.screenshot({
    path: path.join(outputDir, `${theme}-tray.png`),
    fullPage: true,
  });

  await trayContext.close();
};

const main = async () => {
  await ensureDir(outputRoot);
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  try {
    for (const theme of ["light", "dark"]) {
      await captureMainViews(page, theme, outputRoot);
      await captureTrayView(browser, theme, outputRoot);
    }

    process.stdout.write(`Visual baseline captured in ${outputRoot}\n`);
  } finally {
    await context.close();
    await browser.close();
  }
};

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
