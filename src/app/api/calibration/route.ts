import { handler } from "@/lib/api";
import { calibrationFilesAvailable, runCalibration } from "@/lib/calibration";
import { getStore } from "@/lib/store";

export const maxDuration = 300;

export const GET = handler(async () => ({
  run: await getStore().getLatestCalibration(),
  files: calibrationFilesAvailable(),
}));

export const POST = handler(async () => ({ run: await runCalibration(), files: calibrationFilesAvailable() }));
