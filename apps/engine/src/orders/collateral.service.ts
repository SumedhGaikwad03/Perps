import type { toEngine } from "common";
import { STREAM_KEY, ENGINE_GROUP } from "../config";
import {
  getOrCreateBalance,
  getBalance,
  setBalance,
} from "../state";
import { publisher } from "../streams/publisher";

// we pass four things to the redis client namely the 
//1. command "narrowerd down" 2. loopbackid 3. streamEntry cliend read 
export async function handleOnRamp(
  command: Extract<toEngine, { messageType: "ON_RAMP" }>,
  loopbackId: string,
  streamEntryId: string,
  clientRead: { xAck: (key: string, group: string, id: string) => Promise<any> },
): Promise<void> {
      // extarct the info from the command

      const { userId, amount } = command;

      // we have to de-stringyfy the amount that was injested in the engine
      const numAmount = parseFloat(amount);

      // now we have to move ahead the as we nw have to amount

      if (numAmount <= 0 || !isFinite(numAmount)) {
        console.log("The amount is too low ");

        await publisher.xAdd("to-backend", "*", {
          loopbackId,
          status: "REJECTED",
          data: "",
          error: "AMOUNT_IS_TOO_LOW",
        });

        // every rejected or passed requets must be ack by the engine
        await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, streamEntryId);
        return;
      }

      const currentBalances = getOrCreateBalance(userId);

      const newBalance = (
        parseFloat(currentBalances.available_bal) + numAmount
      ).toString();

      setBalance(userId, {
        available_bal: newBalance,
        locked_bal: currentBalances.locked_bal,
      });

      console.log(
        `Engine has onrampeed the balances for this userid : ${userId} by  this amount ${numAmount}`,
      );

      await publisher.xAdd("to-backend", "*", {
        loopbackId: loopbackId,
        status: "SUCCESS",
        data: JSON.stringify({
          userId,
          available_bal: newBalance,
          locked_bal: currentBalances.locked_bal,
        }),
        error: "",
      });

      // this is the db poller that updates the postgress
      await publisher.xAdd("db-events", "*", {
        eventType: "WALLET_UPDATE",
        payload: JSON.stringify({
          userId,
          amountAvail: newBalance,
          amountLocked: currentBalances.locked_bal,
        }),
      });

      // publish to real-time websocket user channel so frontend updates immediately with the new bal 
      publisher.publish(
        `pub:user:${userId}`,
        JSON.stringify({
          eventType: "WALLET_UPDATE",
          amountAvail: newBalance,
          amountLocked: currentBalances.locked_bal,
        })
      );

      await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, streamEntryId);
      return;
}

export async function handleOffRamp(
  command: Extract<toEngine, {messageType: "OFF_RAMP"}>,
  loopbackId: string,
  streamEntryId: string,
  clientRead: { xAck: (key: string, group: string, id: string) => Promise<any> },
): Promise<void> {

      // this is the way that we destructure the command that we just defined 
      const {userId , amount} = command ;

      const amountToDeduct = parseFloat(amount);

      const currentBalances = getBalance(userId);

      


      if(!currentBalances){

        await publisher.xAdd("to-backend","*",{
          loopbackId,
          status : "REJECTED",
          data : "",
          error : "THE_USER_BALNCES_DOES_NOT_EXIST_BRO",
        });
        await clientRead.xAck(STREAM_KEY,ENGINE_GROUP,streamEntryId);
     return;
      }

      if(parseFloat(currentBalances.available_bal) < amountToDeduct){
        await publisher.xAdd("to-backend","*",{
          loopbackId,
          status : "REJECTED",
          data : "",
          error : "BROO_YOU_DONT_HAVE_ENOUGH_BALANCE_WITHDRAW_BRO"
        });
        await clientRead.xAck(STREAM_KEY,ENGINE_GROUP,streamEntryId);
     return;

      }

      setBalance(userId, {
        available_bal: (parseFloat(currentBalances!.available_bal) - amountToDeduct).toString(),
        locked_bal: currentBalances!.locked_bal,
      });

      await publisher.xAdd("to-backend","*",{
        loopbackId,
        status : "SUCCESS",
        error : "",
        data : "THE_AMOUNT_WAS_TRANSFERED_BRO"
      });

      await clientRead.xAck(STREAM_KEY,ENGINE_GROUP,streamEntryId);
     return; 
}

