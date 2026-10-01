import { handler } from "@/lib/api";
import { calibrationFilesAvailable, runCalibration } from "@/lib/calibration";
import { getStore } from "@/lib/store";
import { openAccess } from "@/lib/access-code";

export const maxDuration = 300;

export const GET = handler(async () => ({
  run: await getStore().getLatestCalibration(),
  files: calibrationFilesAvailable(),
}));

export const POST = handler(async () => {
  // While open to anyone, allow at most one run every 15 minutes (each run makes 8 AI calls).
  const last = await getStore().getLatestCalibration();
  if (openAccess() && last && Date.now() - new Date(last.created_at).getTime() < 15 * 60_000) {
    return { run: last, files: calibrationFilesAvailable(), note: "Showing the latest run; a new run is allowed every 15 minutes." };
  }
  return { run: await runCalibration(), files: calibrationFilesAvailable() };
});
