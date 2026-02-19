const HELPER_BASE_URL = import.meta.env.VITE_HELPER_BASE_URL;

export async function readCardUID(): Promise<{ success: boolean; uid?: string; message?: string }> {
  try {
    const resp = await fetch(`${HELPER_BASE_URL}/api/read-card-uid`, {
      method: "GET",
    });

    if (!resp.ok) {
      return {
        success: false,
        message: `RFID helper not responding (HTTP ${resp.status}).`,
      };
    }

    const data = await resp.json().catch(() => null as any);

    if (!data || typeof data !== "object") {
      return {
        success: false,
        message: "Invalid response from RFID helper.",
      };
    }

    const success = !!data.success && !!data.uid;

    return {
      success,
      uid: success ? data.uid : undefined,
      message: data.message,
    };
  } catch (err) {
    console.error("readCardUID failed:", err);
    return {
      success: false,
      message:
        "Cannot reach the RFID helper. Make sure the helper app is running and the RFID scanner is plugged in.",
    };
  }
}
