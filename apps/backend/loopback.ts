import { resolve } from "bun";
import type { toEngine } from "common";
import { createClient } from "redis";
import { randomUUIDv7 } from "bun";

// we are creating an redis client in this file as this is the only way to use redis streams
const client = createClient();
const subscriber = createClient();

// this is the counsuner group that consumes/listens request from the backend

const BACKEND_CONSUMER_GROUP = "backend-consumer-group";
const CONSUMER_NAME = "backend-instance-one";

// this is the object we store in the loopback resolves id that will have an identfier and the object that will be of this shape
// to resolve or reject the promise

interface DefferedPromise {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer?: ReturnType<typeof setTimeout>; // we store timeout id here
}

async function initializeRedis() {
  await Promise.all([client.connect(), subscriber.connect()]);

  try {
    //here we are are creating a stram to-backed and with the name of consumer group and $ says that just
    // send msg form this point of time
    await client.xGroupCreate("to-backend", BACKEND_CONSUMER_GROUP, "0", {
      MKSTREAM: true,
    });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("BUSYGROUP")) {
      throw error;
    }
  }
}

// this map stores all the loopbacids that are basically all the operations that 
// we have send forward to the engine this map helps us to track reject and resolve those operations here 
const loopBackResolves = new Map<string, DefferedPromise>();

// this loopback function accept the message that is accepting the type as to engine here 
export function loopback(message: toEngine): Promise<unknown> {
  return new Promise((resolve, reject) => {
    // // generates a random cryptograpically secure uuid for each redis request cycle
    const loopbackId = randomUUIDv7();

    console.log(`loopback id is genreated by the file  ${loopbackId}`);

    // we store three things in this object as resolve reject and timer id for early id
    const pendingPromise: DefferedPromise = {
      resolve,
      reject,
      // this line below gives the return type of the settimoot variable and all
      timer: undefined as unknown as ReturnType<typeof setTimeout>,
    };

    // store the loopback id and the promise object in the map so we can later resolve it or reject it 
    loopBackResolves.set(loopbackId, pendingPromise);

    // add the request to the queue called "engine" with the message like loopbackid and all
    // as this makes redis accept the stringfied message
    client
      .xAdd("engine", "*", { loopbackId, payload: JSON.stringify(message) })
      .then(() => {
        // as the engine is done publishing the request then
        console.log(
          "request  published succesfully by the loopback file  to the engine stream ",
        );

        pendingPromise.timer = setTimeout(() => {
          // this block executes code when 10 sec has elapshed then this block is triggerd that resolves the promise created
          // the the engine

          // by binding the timer to the a object we can track the timer and help can cancel dummy execution
          const currentPendingPromise = loopBackResolves.get(loopbackId);

          if (currentPendingPromise) {
            loopBackResolves.delete(loopbackId);

            currentPendingPromise.reject(
              new Error(
                `Engine loopback timed out after 10000 for id ${loopbackId}`,
              ),
            );
          }
        }, 10000);
        // name of the redis stream we push is engine and , * is the unique msg id
        console.log("loopback has been published to a queue");
        //loopback.Resolves.set(loopbackId, resolve);
      })
      .catch((error) => {
        // if the request go haywire then we delete that id from loopback resolve
        loopBackResolves.delete(loopbackId);
        reject(error);
      });
  });
}

// now the loopback also  needs to listen to the msg that it just created

async function main() {
  while (1) {
    // the consumer name is the consumer that is assaigned to read form the queue to backend
    const currentMsg = await subscriber.xReadGroup(
      BACKEND_CONSUMER_GROUP,
      CONSUMER_NAME,
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
      // this entry retrives the first message form the redis queue as is

      const entry = currentMsg?.[0]?.messages[0];
      // the current message represents all the streams of redis right now there is only one stram that is to backend stream

      if (!entry) {
        continue;
      }

      // we extract the status from the current data stream message

      const { loopbackId, status, data, error } = entry.message as {
        loopbackId: string;
        status: "SUCCESS" | "REJECTED" | "ERROR";
        data?: string;
        error?: string;
      };

      const pendingPromise = loopBackResolves.get(loopbackId);

      if (pendingPromise) {
        loopBackResolves.delete(loopbackId);
      }

      if (status === "SUCCESS") {
        const parsedData = data ? JSON.parse(data) : null;
        pendingPromise?.resolve(parsedData);
        // we resolved the promise here that was pending as the current order is executed here
      } else if (status == "REJECTED") {
        pendingPromise?.resolve({
          status: "REJECTED",
          error: error || "ENGINE_REJECTED_ORDER",
        });
      } else {
        pendingPromise?.reject(new Error(error || "engine rejected request "));
      }

      // this message ack that the consumer "BACKEND CONSUMER GROUP " group has sucessfully acked the request the "to-backend" req w
      // with the entry.id as in that request is sorted
      await subscriber.xAck("to-backend", BACKEND_CONSUMER_GROUP, entry.id); // this snipped tell that the
    } catch (error) {
      console.log("consumer erroe in backend ", error);
    }
  }
}

initializeRedis()
  .then(() => main())
  .catch(console.error);
