import { createClient } from "redis";

// we iniataire two instances that would read and publish the message for this stream
export const publisher = createClient();

let isConnected = false;

export async function initPublisher() {
  if (!isConnected) {
    if (!publisher.isOpen) {
      await publisher.connect();
    }
    isConnected = true;
  }
}

export async function emitDbEvent(eventType: string, payload: unknown) {
  await initPublisher();
  return publisher.xAdd("db-events", "*", {
    eventType,
    payload: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}

export async function replyToBackend(
  loopbackId: string,
  status: "SUCCESS" | "REJECTED" | "SUCESSS",
  data: string = "",
  error: string = "",
) {
  await initPublisher();
  return publisher.xAdd("to-backend", "*", {
    loopbackId,
    status,
    data,
    error,
  });
}
