// Downloading an export.
//
// The file is fetched through the same client as everything else so it carries
// the auth header, rather than being opened as a plain link the server would
// refuse. That means it arrives as data and has to be handed to the browser as
// a download deliberately.

import { api, errorMessage } from "./api";

export async function downloadExport(name, params, toast) {
  try {
    const response = await api.get(`/documents/exports/${name}.csv`, {
      params,
      responseType: "blob",
    });

    const url = URL.createObjectURL(response.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = filenameFrom(response) || `${name}.csv`;
    link.click();

    // Released once the click has been handled, or the blob is held for the
    // lifetime of the page.
    URL.revokeObjectURL(url);

    if (toast) toast(`${link.download} downloaded`);
  } catch (error) {
    // The error body arrives as a blob like everything else, so the usual
    // message reader cannot see into it.
    if (toast) toast(await blobError(error), "error");
  }
}

function filenameFrom(response) {
  const header = response.headers["content-disposition"] || "";
  return header.match(/filename="(.+)"/)?.[1] || null;
}

async function blobError(error) {
  const data = error?.response?.data;
  if (!(data instanceof Blob)) return errorMessage(error);

  try {
    return JSON.parse(await data.text()).error;
  } catch {
    return "That export could not be produced. Please try again.";
  }
}

// A PDF is opened rather than saved: it is a document to read, and the browser's
// own viewer is better at that than the downloads folder.
export async function openPdf(path, toast) {
  try {
    const response = await api.get(path, { responseType: "blob" });
    const url = URL.createObjectURL(response.data);

    // Revoking immediately would close the tab that was just handed the URL, so
    // it is released on a delay long enough for the viewer to have read it.
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    if (toast) toast(await blobError(error), "error");
  }
}
