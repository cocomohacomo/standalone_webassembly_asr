const { chromium } = require("playwright");
const path = require("node:path");

const root = process.env.PWA_TEST_URL || "http://127.0.0.1:4173/";
const wav = path.resolve(__dirname, "../.cache/ja-model/sherpa-onnx-zipformer-ja-reazonspeech-2024-08-01/test_wavs/1.wav");

async function waitForTranscript(page, label, previousText) {
  await page.waitForFunction(previous => {
    const current = document.querySelector("#text")?.value || "";
    return current.trim().length > 0 && current.length > previous.length;
  }, previousText, { timeout: 240000 });
  const transcript = await page.locator("#text").inputValue();
  if (!/[ぁ-んァ-ヶ一-龯]/u.test(transcript.slice(previousText.length))) {
    throw new Error(label + ": no new Japanese text in transcript: " + transcript);
  }
  console.log(label + "_TRANSCRIPT=" + transcript.slice(previousText.length).replace(/\s+/g, " "));
}

async function startAndRecognize(page, label) {
  const previousText = await page.locator("#text").inputValue();
  await page.locator("#recordBtn").click();
  try {
    await page.waitForFunction(() => {
      const record = document.querySelector("#recordBtn");
      const stop = document.querySelector("#stopBtn");
      const status = document.querySelector("#statusText")?.textContent || "";
      return (!record?.disabled && !stop?.disabled) ||
        status.includes("開始エラー") || status.includes("ASRエラー") ||
        status.includes("Workerエラー") || status.includes("タイムアウト");
    }, undefined, { timeout: 240000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      status: document.querySelector("#statusText")?.textContent || "",
      recordDisabled: document.querySelector("#recordBtn")?.disabled,
      stopDisabled: document.querySelector("#stopBtn")?.disabled,
      online: navigator.onLine,
      controlled: !!navigator.serviceWorker?.controller,
      modelReady: localStorage.getItem("vnnAsrModelReady"),
      transcriptLength: document.querySelector("#text")?.value?.length || 0
    }));
    throw new Error(label + ": startup wait timed out; " + JSON.stringify(diagnostic) + "; " + error.message);
  }
  const state = await page.evaluate(() => ({
    status: document.querySelector("#statusText")?.textContent || "",
    recordDisabled: document.querySelector("#recordBtn")?.disabled,
    stopDisabled: document.querySelector("#stopBtn")?.disabled
  }));
  if (state.stopDisabled) {
    throw new Error(label + ": ASR startup failed: " + state.status + " state=" + JSON.stringify(state));
  }
  await page.waitForTimeout(7000);
  // The stop control is visually hidden in the compact test viewport; trigger its real DOM handler.\n  await page.locator("#stopBtn").evaluate(button => button.click());
  await waitForTranscript(page, label, previousText);
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
  // The app intentionally asks for first-run model-download consent. Playwright
  // dismisses dialogs by default when no listener is registered, which makes
  // the recording button silently return to idle and causes a false timeout.
  page.on("dialog", async dialog => {
    const dialogType = dialog.type();
    console.log("BROWSER_DIALOG", dialogType, dialog.message());
    if (dialogType === "confirm") await dialog.accept();
    else await dialog.dismiss();
  });
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
