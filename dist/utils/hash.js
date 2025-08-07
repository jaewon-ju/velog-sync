import crypto from "crypto";
export function computeHash(content) {
    return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}
//# sourceMappingURL=hash.js.map