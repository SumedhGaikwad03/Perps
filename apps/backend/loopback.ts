import { resolve } from "bun";
import type {toEngine} from "common"; 
import { createClient } from "redis";
import { randomUUIDv7 } from "bun";

const client = createClient();
const subscriber = createClient(); 
  

const BACKEND_CONSUMER_GROUP = "backend-consumer-group";
const CONSUMER_NAME = "backend-instance-one";


interface DefferedPromise {

    resolve : (value : unknown ) => void ; 
    reject : (reason : unknown) => void ; 
} 

async function initializeRedis(){

    await Promise.all([
        client.connect() ,
        subscriber.connect()
    ]);

try {
    //here we are are creating a stram to-backed and with the name of consumer group and $ says that just 
    // send msg form this point of time 
await client.xGroupCreate("to-backend", BACKEND_CONSUMER_GROUP , "$" , 
    {
        MKSTREAM :true 
    }
);
}catch(error){
    if(
        !(error instanceof Error) || !(error.message.includes("BUSYGROUP"))
    ){
        throw error ; 
    }


} }




const loopBackResolves = new Map<string , DefferedPromise >(); 
// here we map the resloves that are accumating in the in memeory app 
// this above sniipped stroes the loppback id and its promise to be resoled later 
export function loopback( message : toEngine ) : Promise<unknown> {

    return new Promise( (resolve , reject ) => {


        const loopbackId = randomUUIDv7(); // generates a random cryptograpically secure uuid 
        
        loopBackResolves.set(loopbackId, {resolve, reject}); // this sorted the  the loopback id that and the resolve  

        console.log("loopback resolve this is prior to the resolve "); 
         
         // add the reques to the queue called engine with the message like loopbackid and all 
        client.xAdd("engine", "*", {loopbackId , payload: JSON.stringify(message)}) // as this makes redis accept the 
        // stringfied msg
        .then(()=> {
            console.log("request  published succesfully ");
    })
       .catch((error) => {

        loopBackResolves.delete(loopbackId); // if the request go haywire then we delete that id from loopback resolve 
        reject(error); 
       }); 
      // loopBackResolves.set(loopbackId,resolve);

      const timer = setTimeout(()=> {
     const pending = loopBackResolves.get(loopbackId);

     if(pending){

        loopBackResolves.delete(loopbackId);
        pending.reject(
            new Error (`Engine loopback timed out after 10000 for id ${loopbackId}`)
        );
     }
      },10000);   
     // name of the redis stream we push is engine and , * is the unique msg id 
         console.log("loopback has been published to a queue");
        //loopback.Resolves.set(loopbackId, resolve); 

    });


}

// now the loopback also  needs to listen to the msg that it just created 

async function main () { 

    while(1){

    const currentMsg = await subscriber.xReadGroup(BACKEND_CONSUMER_GROUP, CONSUMER_NAME , [{

        key : "to-backend", 
        id : ">"
    }] , {

        BLOCK : 0 ,
        COUNT : 1 ,

    }
     );

     try {

     const entry  = currentMsg?.[0]?.messages[0]; //this is the msg that the other queue responed with and this is genrally an array of messages that the other queue sends 
     // to us 

     if(!entry){
        continue;
     }

     const { loopbackId, status, data, error } = entry.message as {
        loopbackId: string;
        status: "SUCCESS" | "REJECTED" | "ERROR";
        data?: string;
        error?: string;
      };

      const pending = loopBackResolves.get(loopbackId);

      if(pending){

        loopBackResolves.delete(loopbackId);
      }

      if(status == "SUCCESS"){

        const parsedData = data ? JSON.parse(data): null ;  
        pending?.resolve(parsedData); // we resolved the promise here that was pending as the current order is executed here 
     }
     else{

        pending!.reject(new Error( error || "engine rejected request "))
     }



      await subscriber.xAck("to-backend", BACKEND_CONSUMER_GROUP, entry.id) // this snipped tell that the 



    }catch(error){

        console.log("consumer erroe in backend ", error);
    }

}}

initializeRedis()
.then(()=> main())
.catch(console.error);

