/** 按实际读取的字节限制 UTF-8 正文；Content-Length 仅用于提前拒绝超限响应。 */
export async function readResponseText(response: Response, maxBytes: number): Promise<string> {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new Error("Invalid response size limit");
    if (Number(response.headers.get("content-length")) > maxBytes) {
        await response.body?.cancel();
        throw new Error("Response too large");
    }
    const reader = response.body?.getReader();
    if (!reader) return "";
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0;
    let text = "";
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) return text + decoder.decode();
            bytes += value.byteLength;
            if (bytes > maxBytes) throw new Error("Response too large");
            text += decoder.decode(value, { stream: true });
        }
    } finally {
        await reader.cancel();
    }
}
