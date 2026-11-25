const { chromium } = require("playwright");
const path = require("node:path");

const root = process.env.PWA_TEST_URL || "http://127.0.0.1:4173/";
const wav = path.resolve(__dirname, "../.cache/ja-model/sherpa-onnx-zipformer-ja-reazonspeech-2024-08-01/test_wavs/1.wav");

async function waitForTranscript(page, label) {
  await page.waitForFunction(() => document.querySelector("#text").value.trim().length > 0,
    undefined, { timeout: 240000 });
  const transcript = await page.locator("#text").inputValue();
  if (!/[ぁ-んァ-ヶ一-龯]/u.test(transcript)) throw new Error(label + ": no Japanese text in transcript: " + transcript);
  console.log(label + "_TRANSCRIPT=" + transcript.replace(/\s+/g, " "));
}

async function startAndRecognize(page, label) {
  await page.locator("#recordBtn").click();
  await page.waitForFunction(() => {
    const status = document.querySelector("#statusText")?.textContent || "";
    return status.includes("録音・日本語認識中") || status.includes("録音・認識を終了") ||
      status.includes("エラー") || status.includes("Model fetch failed") || status.includes("タイムアウト");
  }, undefined, { timeout: 240000 });
  const startupStatus = await page.locator("#statusText").textContent();
  if (startupStatus.includes("エラー") || startupStatus.includes("Model fetch failed") || startupStatus.includes("タイムアウト")) {
    throw new Error(label + ": ASR startup failed: " + startupStatus);
  }
  await page.waitForTimeout(7000);
  await page.locator("#stopBtn").click();
  await waitForTranscript(page, label);
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--use-file-for-fake-audio-capture=" + wav,
      "--autoplay-policy=no-user-gesture-required"
    ]
  });
  const context = await browser.newContext({ permissions: ["microphone"] });
  const page = await context.newPage();
  page.on("pageerror", error => console.error("PAGE_ERROR", error.message));
  page.on("console", message => { if (message.type() === "error") console.error("CONSOLE_ERROR", message.text()); });

  try {
    await page.goto(root, { waitUntil: "networkidle" });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload({ waitUntil: "networkidle" });
    await startAndRecognize(page, "ONLINE");
    await page.waitForTimeout(1500);

    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!document.querySelector("#recordBtn"));
    await startAndRecognize(page, "OFFLINE_RELAUNCH");
    console.log("PWA_BROWSER_E2E_SUCCESS online_and_offline_relaunch");
  } finally {
    await context.close();
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
