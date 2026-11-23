import { resolve } from "bun";
import type { toEngine } from "common";
import { createClient } from "redis";
import { randomUUIDv7 } from "bun";

// We are creating a redis client in this file as this is the only way to use redis streams
const client = createClient();
const subscriber = createClient();

// This is the consumer group that consumes/listens request from the backend
const BACKEND_CONSUMER_GROUP = "backend-consumer-group";
const WORKER_NAME = "backend-instance-one";

// This is the object we store in the loopback resolves id that will have an identifier and the object that will be of this shape
// to resolve or reject the promise
interface DefferedPromise {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer?: ReturnType<typeof setTimeout>; // We store timeout id here
}

async function initializeRedis() {
  await Promise.all([client.connect(), subscriber.connect()]);

  try {
    // Here we are creating a stream to-backend and with the name of consumer group and 0 says to
    // process from the beginning / new messages
    await client.xGroupCreate("to-backend", BACKEND_CONSUMER_GROUP, "0", {
      MKSTREAM: true,
    });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("BUSYGROUP")) {
      throw error;
    }
  }
}

// This map stores all the loopbackIds that are basically all the operations that
// we have sent forward to the engine. This map helps us to track, reject and resolve those operations here.
const loopBackResolves = new Map<string, DefferedPromise>();

// This loopback function accepts messages typed as toEngine
export function loopback(message: toEngine): Promise<unknown> {
  return new Promise((resolve, reject) => {
    // Generates a random cryptographically secure uuid for each redis request cycle
    const loopbackId = randomUUIDv7();

    console.log(`loopback id is genreated by the file  ${loopbackId}`);

    // We store three things in this object: resolve, reject, and timer id
    const pendingPromise: DefferedPromise = {
      resolve,
      reject,
    };

    // Store the loopback id and the promise object in the map so we can later resolve it or reject it
    loopBackResolves.set(loopbackId, pendingPromise);

    // Add the request to the queue called "engine" with the loopbackId and stringified message
    client
      .xAdd("engine", "*", { loopbackId, payload: JSON.stringify(message) })
      .then(() => {
        console.log(
          "request  published succesfully by the loopback file  to the engine stream ",
        );

        pendingPromise.timer = setTimeout(() => {
          // This block executes when 10 seconds have elapsed and rejects the promise
          // the loopBack resovles is a map here that will exist to store a promise in the loop 
          const currentPendingPromise = loopBackResolves.get(loopbackId);

          if (currentPendingPromise) {

            if(currentPendingPromise.timer){
              clearTimeout(pendingPromise.timer);
            }

            loopBackResolves.delete(loopbackId);
            

            currentPendingPromise.reject(
              new Error(
                `Engine loopback timed out after 10000 for id ${loopbackId}`,
              ),
            );
          }
        }, 10000);

        console.log("loopback has been published to a queue");
      })
      .catch((error) => {
        // If the request fails to publish, delete that id from loopback resolves and reject
        loopBackResolves.delete(loopbackId);
        reject(error);
      });
  });
}

// Now the loopback also needs to listen to the messages from the engine
async function main(){
  while (1) {
    // The consumer reads from the queue to-backend , that are essentally the requests that are sent by the 
    // backend 
    
    const currentMsg = await subscriber.xReadGroup(
      BACKEND_CONSUMER_GROUP,
      WORKER_NAME,
      [
        {
          key: "to-backend",
          id: ">",
        },
      ],
      {
        BLOCK: 0,
        COUNT: 1,
      },
    );

    try {
      // This entry retrieves the first message from the redis queue
      const entry = currentMsg?.[0]?.messages[0];

      if (!entry) {
        continue;
      }

      // We extract the status and payload from the current stream message
      const { loopbackId, status, data, error } = entry.message as {
        loopbackId: string;
        status: "SUCCESS" | "REJECTED" | "ERROR";
        data?: string;
        error?: string;
      };

      // resolve the promise that was stored in the map earlier 
      const pendingPromise = loopBackResolves.get(loopbackId);

      if (pendingPromise) {
        loopBackResolves.delete(loopbackId);
      }

      if (status === "SUCCESS") {
        const parsedData = data ? JSON.parse(data) : null;
        pendingPromise?.resolve(parsedData);
      } else if (status === "REJECTED") {
        pendingPromise?.resolve({
          status: "REJECTED",
          error: error || "ENGINE_REJECTED_ORDER",
        });
      } else {
        pendingPromise?.reject(new Error(error || "engine rejected request "));
      }

      // Acknowledge that the consumer group has successfully handled the message
      await subscriber.xAck("to-backend", BACKEND_CONSUMER_GROUP, entry.id);
    } catch (error: any) {
      console.log("consumer erroe in backend ", error);
      if (error?.message?.includes("NOGROUP")) {
        try {
          await client.xGroupCreate("to-backend", BACKEND_CONSUMER_GROUP, "0", {
            MKSTREAM: true,
          });
          console.log("Successfully recreated backend-consumer-group");
        } catch (groupErr: any) {
          if (!groupErr?.message?.includes("BUSYGROUP")) {
            console.error("Failed to re-create backend group:", groupErr);
          }
        }
      }
    }
  }
}

initializeRedis()
  .then(() => main())
  .catch(console.error);
