import type { toEngine } from "common";
import { STREAM_KEY, ENGINE_GROUP, WORKER_NAME } from "../config";
import {
  handleCreateOrder,
  handleCreateMarket,
  handleOnRamp,
  handleOffRamp,
  handleExitPosition,
  handleCancelOrder,
} from "../orders";

export async function startEngineConsumer(clientRead: any): Promise<void> {
  while (true) {
    try {
      // this is the snippert that read the engine queue here
      const response = await clientRead.xReadGroup(
        ENGINE_GROUP, // this is the consumer group name
        WORKER_NAME, // this is the stream/worker we use to read data from
        //message is tagged in the ple with the WORKER_NAME
        [
          {
            key: "engine", // the redis stream key to consume  from
            id: ">", // this tell us that give only msg that are recent
          },
        ],
        {
          BLOCK: 0, // waits unitl a new query drops
          COUNT: 1, // reads one query at a time
        },
      );

      if (!response || !response[0]?.messages[0]) {
        console.log("nothing found in the queue broo  bad luck ig ");
        continue;
      }

      // this is the entrie redis message that is received by the consermerworkr
      const entry = response[0]?.messages[0];

      if (!entry) continue;

      console.log("engine req is reaching here ");

      // THE entry message is currently is an strinfied version of the message
      // we have to destructure it and extract the loopback id of the message
      const loopbackId = entry.message.loopbackId;

      // this has the data that we are supposed to work on
      // this is basically an type check for the message we are working with
      const command: toEngine = JSON.parse(entry.message.payload!);

      //const message : {loopbackId : string } & toEngine = entry.message;

      console.dir(response, { depth: null });

      if (command.messageType == "CREATE_ORDER") {
        await handleCreateOrder(command, loopbackId, entry.id, clientRead);
        continue;
      }

      if (command.messageType == "CREATE_MARKET") {
        await handleCreateMarket(command, loopbackId, entry.id, clientRead);
        continue;
      }

      if (command.messageType == "ON_RAMP") {
        await handleOnRamp(command, loopbackId, entry.id, clientRead);
        continue;
      }

      if (command.messageType == "OFF_RAMP") {
        await handleOffRamp(command, loopbackId, entry.id, clientRead);
        continue;
      }

      if (command.messageType == "CANCEL_ORDER") {
        await handleCancelOrder(command, loopbackId, entry.id, clientRead);
        continue;
      }

      if (command.messageType == "EXIT_POSITION") {
        await handleExitPosition(command, loopbackId, entry.id, clientRead);
        continue;
      }
    } catch (err: any) {
      console.error("[Engine Consumer Error]:", err);
      if (err?.message?.includes("NOGROUP")) {
        try {
          await clientRead.xGroupCreate(STREAM_KEY, ENGINE_GROUP, "0", {
            MKSTREAM: true,
          });
          console.log("Successfully recreated engine-consumer-group");
        } catch (groupErr: any) {
          if (!groupErr?.message?.includes("BUSYGROUP")) {
            console.error("Failed to re-create engine group:", groupErr);
          }
        }
      }
    }
  }
}
