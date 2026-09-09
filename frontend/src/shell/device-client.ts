// The device shell's implementation of the contract's `DeviceTransport`.
//
// A FACADE over the existing `backend` singleton, and nothing more — no second
// socket, no second queue, no second auth handshake. That is not an efficiency
// point, it is a correctness one: the device is single-in-flight, and being
// single-in-flight is a property of *one* object holding *one* socket and
// serializing opens through *one* FIFO. A module that opened its own connection
// would interleave sessions with the shell's and both would be answered out of
// order.
//
// So this file has no logic. It exists to narrow what a module can reach: `request`
// is the whole surface, and `backend`'s reconnect, token handling, chunk
// reassembly, broadcast fan-out and progress callbacks stay unreachable from module
// code. It is a boundary made of types, not of privilege — modules run in-process
// and could import `backend` themselves (§9 of the design). What it buys is that a
// module written against the contract runs unchanged on the relay shell, where
// `request` is a hub invoke and there is no `backend` to import.

import type { DeviceLogLine, DeviceTransport } from "@shell/contract"
import { backend } from "@/lib/backend"

export const deviceTransport: DeviceTransport = {
  request<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T> {
    // `send` already rejects with the device's own reason on FLAG_REJECT, with
    // Error("Request timeout") on an idle reply, and once per pending request when
    // the socket closes — exactly the failure semantics the contract promises. There
    // is nothing to translate.
    return backend.send<T>(command, args ?? {})
  },

  upload<T = unknown>(
    command: string,
    args: Record<string, unknown> | undefined,
    body: Blob,
    onProgress?: (fraction: number) => void,
  ): Promise<T> {
    // Nothing translated here either: `uploadSession` already streams the body in
    // window-sized chunks and reports the DEVICE's write position, which is the
    // number the contract promises.
    return backend.uploadSession<T>(command, args, body, onProgress)
  },

  download(
    command: string,
    args?: Record<string, unknown>,
    total?: number,
    onProgress?: (fraction: number) => void,
  ): Promise<Blob> {
    return backend.downloadSession(command, args, total, onProgress)
  },

  logs(handler: (line: DeviceLogLine) => void): () => void {
    // Session 0, which `backend` already fans out to every subscriber. On this shell
    // that is a direct read off the device's own socket — the relay's implementation
    // has a hub group in the middle, and a module cannot tell.
    return backend.subscribe(handler as (msg: unknown) => void)
  },
}
