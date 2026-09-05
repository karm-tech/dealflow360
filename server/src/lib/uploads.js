// Uploaded files live beside the database rather than in the source tree: they
// belong to this installation, not to the code.

import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const UPLOADS_DIR = path.resolve(here, "../../uploads");
