import { getZoomAccessToken } from "./zoomAuth.js";

export async function downloadChatFile(fileId: string): Promise<{
  buffer: Buffer;
  contentType: string | undefined;
  fileName: string | undefined;
}> {
  const token = await getZoomAccessToken();
  const url = `https://api.zoom.us/v2/team-chat/chat/files/${encodeURIComponent(fileId)}`;
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`File download failed: ${resp.status} ${text}`);
  }
  const arrayBuf = await resp.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);
  const contentType = resp.headers.get("content-type") ?? undefined;
  const disposition = resp.headers.get("content-disposition") ?? undefined;
  const fileName = disposition?.split("filename=")[1]?.replaceAll('"', "");
  return { buffer, contentType, fileName };
}


